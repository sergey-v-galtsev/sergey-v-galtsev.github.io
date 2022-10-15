## Copy-on-write fork

Теперь у нас есть всё необходимое для реализации copy-on-write `fork()` в пространстве пользователя.
Программа [`user/cow_fork/src/main.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/cow_fork/src/main.rs) структурно похожа на [`user/eager_fork/src/main.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/eager_fork/src/main.rs)
и на `eager_fork` можно ориентироваться при реализации.


#### Ленивое копирование адресного пространства

```rust
fn copy_page_table(
    child: Pid,
    level: u32,
    trap_stack: Block<Page>,
    virt_addr: Virt,
) -> Result<()>
```

Выполняется аналогично [соответствующей процедуре](../../lab/book/5-um-3-eager-fork.html#copy_page_table) `eager_fork`.
Отличается от которой в паре моментов:

- К игнорируемым страницам добавляется `trap_stack`, его копировать не нужно. У потомка изначально будет полностью отдельный стек для обработки исключений.
- Вместо копирования страниц функцией `lib::memory::copy_page()` создаёт в потомке отображение. Оно ссылается на тот же физический фрейм, на который ссылается соответствующая виртуальная страница в родителе. При этом для страниц, которые отображены с одним из флагов `PageTableFlags::WRITABLE` или `PageTableFlags::COPY_ON_WRITE`, в обоих адресных пространствах меняет флаги отображения страницы так, чтобы `PageTableFlags::COPY_ON_WRITE` был включён, а `PageTableFlags::WRITABLE` выключен. Копирование содержимого страницы функцией `lib::memory::copy_page()` таким образом лениво откладывается до возникновения Page Fault.


#### Пользовательский обработчик исключений Page Fault

Когда программа попытается записать в страницу, помеченную в `copy_page_table()` как `COPY_ON_WRITE` и только на чтение,
возникнет Page Fault и ядро передаст управление в
[реализованный вами ранее](../../lab/book/5-um-4-traps.html#%D0%A2%D1%80%D0%B0%D0%BC%D0%BF%D0%BB%D0%B8%D0%BD-%D0%BE%D0%B1%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA%D0%B0-%D0%BF%D1%80%D0%B5%D1%80%D1%8B%D0%B2%D0%B0%D0%BD%D0%B8%D0%B9)
`trap_trampoline()`, который в свою очередь запустит

```rust
fn trap_handler(info: &TrapInfo)
```

Эта функция работает в очень стеснённых условиях.

Возможно, вся память программы, кроме стека `trap_stack`, на котором сейчас работает эта функция, доступна только на чтение.
В том числе `RingBuffer`, который используется для логирования в пространстве пользователя макросами библиотеки [tracing](https://docs.rs/tracing/) --- `info!()`, `debug!()` и т.д.
Так как при этом нужно писать, то такое логирование в `trap_handler()` не доступно.
`panic!()` тоже не доступен, так как он использует логирование.
В других частях `cow_fork` логированием можно пользоваться, потому что `trap_handler()` починит возникающие при этом Page Fault.
Для логирования в `trap_handler()` можно воспользоваться
[одним из первых реализованных системных вызовов](../../lab/book/3-user-4-syscall.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-12--%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D0%BD%D1%8B%D0%B9-%D0%B2%D1%8B%D0%B7%D0%BE%D0%B2-log_value) ---
`syscall::log_value()`.

Вторая неприятность заключается в том, что в процессе--потомке в `trap_handler()` не доступны
`ku::ProcessInfo` и `ku::SystemInfo` даже на чтение.
Поэтому потомок не может узнать свой идентификатор `Pid`.
Так как не работает в том числе функция `ku::process::pid()`.
Поэтому в `trap_handler()` идентифицировать процесс для выполняемых системных вызовов нужно как `Pid::Current`.

Также учтите, что эти ограничения распространяются на вспомогательные функции, которые `trap_handler()` использует.
Впрочем, оба эти ограничения --- во многом причина реализации `cow_fork`, а не характерная особенность обработки прерываний в пространстве пользователя.

При получении управления, `trap_handler()`:

- Проверяет, что прерывание это действительно `PageFault` и он вызван записью. Иначе он прекращает исполнение программы, вызвав `syscall::exit()` с кодом ошибки.
- С помощью [реализованной ранее](../../lab/book/5-um-3-eager-fork.html#temp_page) функции `lib::memory::temp_page()` находит временную страницу.
- Копирует содержимое страницы, обращение к которой привело к Page Fault, во временную, с помощью [реализованной вами ранее](../../lab/book/5-um-3-eager-fork.html#copy_page) функции `lib::memory::copy_page()`.
- С помощью системного вызова `syscall::map()` заменяет физический фрейм под скопированной страницей на фрейм временной страницы, одновременно меняя флаг `COPY_ON_WRITE` на `WRITABLE` в её отображении.
- С помощью системного вызова `syscall::unmap()` удаляет из адресного пространства не нужную более временную страницу.


#### `cow_fork()`

```rust
fn cow_fork() -> Result<bool>
```

Эта функции похожа на соответствующую функцию `eager_fork()`, но в ней добавляется работа по инициализации обработчика прерываний.
Функция `cow_fork()`:

- Выделяет себе --- родительскому процессу --- стек для обработки исключений с помощью `syscall::map()` и устанавливает себе функцией `syscall::set_trap_handler()` обработчик исключений `trap_handler()`.
- Создаёт процесс потомка с помощью [реализованного вами ранее](../../lab/book/5-um-3-eager-fork.html#%D0%A1%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D0%BD%D1%8B%D0%B9-%D0%B2%D1%8B%D0%B7%D0%BE%D0%B2-exofork) системного вызова `syscall::exofork()`.
- Далее лениво копирует своё адресное пространство в пространство потомка с помощью функции `fn copy_address_space()`.
- Выделяет потомку отдельный стек для обработки исключений с помощью `syscall::map()` и устанавливает уже ему функцией `syscall::set_trap_handler()` обработчик исключений `trap_handler()`.
- Запускает потомка системным вызовом `syscall::set_state()`, устанавливая его состояние в `State::Runnable`.

В потомке `cow_fork()` ничего не делает.
Возвращает она `true` в процессе потомка и `false` в процессе родителя.


### Проверьте себя

Теперь должен заработать тест `cow_fork()` в файле [`kernel/src/tests/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/process.rs):

```console
kernel::tests::process::cow_fork----------------------------
15:08:41.777 0 I page allocator init; free_page_count = 33688649728; block = [2.000 TiB, 127.500 TiB), size 125.500 TiB
15:08:41.793 0 I duplicate; address_space = "process" @ 0p2EC9000
15:08:41.804 0 I switch to; address_space = "process" @ 0p2EC9000
15:08:41.816 0 D extend mapping; block = [0x10000000, 0x10007594), size 29.395 KiB; page_block = [0x10000, 0x10008), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:41.831 0 D elf loadable program header; file_block = [0x4e15c4, 0x4e8b58), size 29.395 KiB; memory_block = [0x10000000, 0x10007594), size 29.395 KiB; flags =   R
15:08:41.862 0 D extend mapping; block = [0x10008000, 0x10052e7b), size 299.620 KiB; page_block = [0x10008, 0x10053), size 300.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:41.870 0 D elf loadable program header; file_block = [0x4e8b64, 0x53443f), size 302.214 KiB; memory_block = [0x100075a0, 0x10052e7b), size 302.214 KiB; flags = X R
15:08:41.895 0 D elf loadable program header; file_block = [0x534444, 0x534564), size 288 B; memory_block = [0x10052e80, 0x10052fa0), size 288 B; flags =  WR
15:08:41.902 0 D extend mapping; block = [0x10053000, 0x10058610), size 21.516 KiB; page_block = [0x10053, 0x10059), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:41.911 0 D elf loadable program header; file_block = [0x534564, 0x539bac), size 21.570 KiB; memory_block = [0x10052fa0, 0x10058610), size 21.609 KiB; flags =  WR
15:08:41.940 0 I switch to; address_space = "base" @ 0p1000
15:08:41.955 0 I loaded ELF file; context = { rip: 0v10037530, rsp: 0v7F7FFFFFF000 }; file_size = 673.344 KiB; process = { pid: <current>, address_space: "process" @ 0p2EC9000, { rip: 0v10037530, rsp: 0v7F7FFFFFF000 } }
15:08:41.969 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:41.973 0 I allocate; slot = Process { pid: 5:3, address_space: "5:3" @ 0p2EC9000, { rip: 0v10037530, rsp: 0v7F7FFFFFF000 } }; process_count = 1
15:08:41.982 0 I user process page table entry; entry_point = 0v10037530; frame = Frame(11989 @ 0p2ED5000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
15:08:42.002 0 D process_frames = 130
15:08:42.006 0 I dequeue; pid = Some(5:3)
15:08:42.010 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:42.014 0 D entering the user mode; pid = 5:3; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10037530, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
15:08:42.027 0 I name = "cow_fork *"; pedigree = [5:3]; len = 1; capacity = 3; pid = 5:3
15:08:42.068 0 D syscall = "set_trap_handler"; dst = 5:3; trap_context = { { rip: 0v10011250, rsp: 0v7F7FFFFEB000 }, stack: [127.500 TiB, 127.500 TiB), size 16.000 KiB }
15:08:42.143 0 I page allocator init; free_page_count = 33554432000; block = [2.000 TiB, 127.000 TiB), size 125.000 TiB
15:08:42.156 0 I duplicate; address_space = "process" @ 0p30A1000
15:08:42.159 0 I switch to; address_space = "process" @ 0p30A1000
15:08:42.172 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:42.188 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:42.192 0 I allocate; slot = Process { pid: 1:2, address_space: "1:2" @ 0p30A1000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD588 } }; process_count = 2
15:08:42.198 0 I syscall = "exofork"; process = 5:3; child = 1:2
15:08:42.205 0 I syscall::exofork() done; child = 1:2; pid = 5:3
15:08:42.292 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100102A6, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:42.321 0 D leaving the user mode; pid = 5:3
15:08:42.337 0 I the process was preempted; pid = 5:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFEAFC8, rflags: IF }
15:08:42.355 0 I returned
15:08:42.358 0 I dequeue; pid = Some(5:3)
15:08:42.361 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:42.365 0 D entering the user mode; pid = 5:3; registers = { rax: 0x0, rdi: 0x0, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFEAFC8, rflags: IF } }
15:08:42.389 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:42.416 0 D leaving the user mode; pid = 5:3
15:08:42.433 0 I the process was preempted; pid = 5:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFEAFC8, rflags: IF }
15:08:42.446 0 I returned
15:08:42.450 0 I dequeue; pid = Some(5:3)
15:08:42.453 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:42.456 0 D entering the user mode; pid = 5:3; registers = { rax: 0x0, rdi: 0x0, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFEAFC8, rflags: IF } }
15:08:42.481 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAB4, ss:rsp: 0x001B:0v7F7FFFFFCB58, rflags: IF ZF PF }
15:08:42.530 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF ZF AF PF CF }
15:08:42.575 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100286DF, ss:rsp: 0x001B:0v7F7FFFFFD328, rflags: IF ZF PF }
15:08:42.623 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10028ABA, ss:rsp: 0x001B:0v7F7FFFFFD258, rflags: IF ZF PF }
15:08:42.673 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:42.727 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10033E87, ss:rsp: 0x001B:0v7F7FFFFFAC08, rflags: IF AF }
15:08:42.672 0 I copy_address_space done; child = 1:2; trap_stack = [0x7f7ffffe7, 0x7f7ffffeb), size 16.000 KiB; pid = 5:3
15:08:42.813 0 D syscall = "set_trap_handler"; dst = 1:2; trap_context = { { rip: 0v10011250, rsp: 0v7F7FFFFEB000 }, stack: [127.500 TiB, 127.500 TiB), size 16.000 KiB }
15:08:42.842 0 I syscall::set_state() done; child = 1:2; pid = 5:3
15:08:42.877 0 D syscall = "set_trap_handler"; dst = 5:3; trap_context = { { rip: 0v10011250, rsp: 0v7F7FFFFDF000 }, stack: [127.500 TiB, 127.500 TiB), size 16.000 KiB }
15:08:42.958 0 I page allocator init; free_page_count = 33554432000; block = [2.000 TiB, 127.000 TiB), size 125.000 TiB
15:08:42.966 0 I duplicate; address_space = "process" @ 0p308D000
15:08:42.980 0 I switch to; address_space = "process" @ 0p308D000
15:08:42.992 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:43.001 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:43.004 0 I allocate; slot = Process { pid: 9:2, address_space: "9:2" @ 0p308D000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD588 } }; process_count = 3
15:08:43.011 0 I syscall = "exofork"; process = 5:3; child = 9:2
15:08:43.018 0 D leaving the user mode; pid = 5:3
15:08:43.021 0 I the process was preempted; pid = 5:3; user_context = { mode: user, cs:rip: 0x0023:0v1000F3B3, ss:rsp: 0x001B:0v7F7FFFFFD510, rflags: IF ZF PF }
15:08:43.028 0 I returned
15:08:43.031 0 I dequeue; pid = Some(1:2)
15:08:43.040 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:43.051 0 D entering the user mode; pid = 1:2; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD588, rflags: IF } }
15:08:43.061 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF }
15:08:43.104 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7F7FFFFEAD98, rflags: IF ZF PF }
15:08:43.142 0 D leaving the user mode; pid = 1:2
15:08:43.156 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFEAD60, rflags: IF ZF PF }
15:08:43.165 0 I returned
15:08:43.178 0 I dequeue; pid = Some(5:3)
15:08:43.182 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:43.186 0 D entering the user mode; pid = 5:3; registers = { rax: 0x0, rdi: 0x7F7FFFFFE678, rsi: 0x7F7FFFFFE6A0, { mode: user, cs:rip: 0x0023:0v1000F3B3, ss:rsp: 0x001B:0v7F7FFFFFD510, rflags: IF ZF PF } }
15:08:43.196 0 I syscall::exofork() done; child = 9:2; pid = 5:3
15:08:43.292 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100102A6, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:43.321 0 D leaving the user mode; pid = 5:3
15:08:43.336 0 I the process was preempted; pid = 5:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF }
15:08:43.355 0 I returned
15:08:43.358 0 I dequeue; pid = Some(1:2)
15:08:43.361 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:43.364 0 D entering the user mode; pid = 1:2; registers = { rax: 0x7F7FFFFEAF18, rdi: 0x7F7FFFFEADC0, rsi: 0x7F7FFFFEADE8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFEAD60, rflags: IF ZF PF } }
15:08:43.386 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD4D8, rflags: IF }
15:08:43.437 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:43.483 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001B31A, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:43.535 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AF12, ss:rsp: 0x001B:0v7F7FFFFFBFB8, rflags: IF }
15:08:43.436 0 I syscall::exofork() done; child = <current>; pid = 1:2
15:08:43.583 0 I just created; child = <current>; pid = 1:2; pid = 1:2
15:08:43.588 0 I name = "cow_fork *0"; pedigree = [5:3, 1:2]; len = 2; capacity = 3; pid = 1:2
15:08:43.636 0 D syscall = "set_trap_handler"; dst = 1:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFF5000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:43.716 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:43.729 0 I duplicate; address_space = "process" @ 0p30A4000
15:08:43.733 0 I switch to; address_space = "process" @ 0p30A4000
15:08:43.747 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:43.762 0 I switch to; address_space = "4:2" @ 0p30A4000
15:08:43.767 0 I allocate; slot = Process { pid: 4:2, address_space: "4:2" @ 0p30A4000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD0C8 } }; process_count = 4
15:08:43.773 0 I syscall = "exofork"; process = 1:2; child = 4:2
15:08:43.780 0 I syscall::exofork() done; child = 4:2; pid = 1:2
15:08:43.870 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBAB8, rflags: IF }
15:08:43.925 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFBCB8, rflags: IF }
15:08:43.973 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFCB88, rflags: IF }
15:08:44.012 0 D leaving the user mode; pid = 1:2
15:08:44.026 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v1002AF03, ss:rsp: 0x001B:0v7EFFFFFF4C98, rflags: IF ZF PF }
15:08:44.035 0 I returned
15:08:44.038 0 I dequeue; pid = Some(5:3)
15:08:44.041 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:44.044 0 D entering the user mode; pid = 5:3; registers = { rax: 0x0, rdi: 0x0, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF } }
15:08:44.068 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:44.121 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAB4, ss:rsp: 0x001B:0v7F7FFFFFCB58, rflags: IF ZF PF }
15:08:44.164 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF ZF AF PF CF }
15:08:44.213 0 D leaving the user mode; pid = 5:3
15:08:44.226 0 I the process was preempted; pid = 5:3; user_context = { mode: user, cs:rip: 0x0023:0v1000B922, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF PF }
15:08:44.235 0 I returned
15:08:44.238 0 I dequeue; pid = Some(1:2)
15:08:44.241 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:44.245 0 D entering the user mode; pid = 1:2; registers = { rax: 0x300, rdi: 0x7EFFFFFEE000, rsi: 0x7F7FFFFFD000, { mode: user, cs:rip: 0x0023:0v1002AF03, ss:rsp: 0x001B:0v7EFFFFFF4C98, rflags: IF ZF PF } }
15:08:44.264 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:44.307 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100286DF, ss:rsp: 0x001B:0v7F7FFFFFCE68, rflags: IF ZF PF }
15:08:44.335 0 D leaving the user mode; pid = 1:2
15:08:44.353 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF ZF PF }
15:08:44.364 0 I returned
15:08:44.367 0 I dequeue; pid = Some(5:3)
15:08:44.371 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:44.374 0 D entering the user mode; pid = 5:3; registers = { rax: 0x7F7FFFFFD848, rdi: 0x7F7FFFFFD848, rsi: 0x7F7FFFFFDCB8, { mode: user, cs:rip: 0x0023:0v1000B922, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF PF } }
15:08:44.383 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:44.416 0 D leaving the user mode; pid = 5:3
15:08:44.430 0 I the process was preempted; pid = 5:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF PF }
15:08:44.438 0 I returned
15:08:44.441 0 I dequeue; pid = Some(1:2)
15:08:44.444 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:44.448 0 D entering the user mode; pid = 1:2; registers = { rax: 0x0, rdi: 0x10055E80, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF ZF PF } }
15:08:44.484 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10028ABA, ss:rsp: 0x001B:0v7F7FFFFFCD98, rflags: IF ZF PF }
15:08:44.513 0 D leaving the user mode; pid = 1:2
15:08:44.526 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF ZF PF }
15:08:44.540 0 I returned
15:08:44.549 0 I dequeue; pid = Some(5:3)
15:08:44.552 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:44.556 0 D entering the user mode; pid = 5:3; registers = { rax: 0x1, rdi: 0x100567E0, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF PF } }
15:08:44.588 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10033E87, ss:rsp: 0x001B:0v7F7FFFFFAC08, rflags: IF AF }
15:08:44.617 0 D leaving the user mode; pid = 5:3
15:08:44.630 0 I the process was preempted; pid = 5:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF AF }
15:08:44.639 0 I returned
15:08:44.642 0 I dequeue; pid = Some(1:2)
15:08:44.645 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:44.649 0 D entering the user mode; pid = 1:2; registers = { rax: 0x100561A8, rdi: 0x100585F8, rsi: 0x100561A8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF ZF PF } }
15:08:44.671 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:44.731 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100305F7, ss:rsp: 0x001B:0v7F7FFFFFAE98, rflags: IF AF }
15:08:44.780 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10045DFF, ss:rsp: 0x001B:0v7F7FFFFF9FE8, rflags: IF AF PF }
15:08:44.670 0 I copy_address_space done; child = 4:2; trap_stack = [0x7effffff1, 0x7effffff5), size 16.000 KiB; pid = 1:2
15:08:44.855 0 D syscall = "set_trap_handler"; dst = 4:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFF5000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:44.890 0 I syscall::set_state() done; child = 4:2; pid = 1:2
15:08:44.926 0 D syscall = "set_trap_handler"; dst = 1:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFE8000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:45.016 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:45.039 0 I duplicate; address_space = "process" @ 0p2D02000
15:08:45.048 0 I switch to; address_space = "process" @ 0p2D02000
15:08:45.059 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:45.063 0 I switch to; address_space = "0:10" @ 0p2D02000
15:08:45.068 0 I allocate; slot = Process { pid: 0:10, address_space: "0:10" @ 0p2D02000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD0C8 } }; process_count = 5
15:08:45.074 0 I syscall = "exofork"; process = 1:2; child = 0:10
15:08:45.080 0 I syscall::exofork() done; child = 0:10; pid = 1:2
15:08:45.184 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBAB8, rflags: IF }
15:08:45.230 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFBCB8, rflags: IF }
15:08:45.289 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFCB88, rflags: IF }
15:08:45.321 0 D leaving the user mode; pid = 1:2
15:08:45.335 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE7FC8, rflags: IF }
15:08:45.343 0 I returned
15:08:45.346 0 I dequeue; pid = Some(5:3)
15:08:45.349 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:45.353 0 D entering the user mode; pid = 5:3; registers = { rax: 0x7F7FFFFFB700, rdi: 0x7F7FFFFFB7F0, rsi: 0x4030000000000000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF AF } }
15:08:44.388 0 I copy_address_space done; child = 9:2; trap_stack = [0x7f7ffffdb, 0x7f7ffffdf), size 16.000 KiB; pid = 5:3
15:08:45.422 0 D syscall = "set_trap_handler"; dst = 9:2; trap_context = { { rip: 0v10011250, rsp: 0v7F7FFFFDF000 }, stack: [127.500 TiB, 127.500 TiB), size 16.000 KiB }
15:08:45.447 0 I syscall::set_state() done; child = 9:2; pid = 5:3
15:08:45.489 0 D syscall = "set_trap_handler"; dst = 5:3; trap_context = { { rip: 0v10011250, rsp: 0v7F7FFFFD5000 }, stack: [127.500 TiB, 127.500 TiB), size 16.000 KiB }
15:08:45.566 0 I page allocator init; free_page_count = 33554432000; block = [2.000 TiB, 127.000 TiB), size 125.000 TiB
15:08:45.588 0 I duplicate; address_space = "process" @ 0p2CEC000
15:08:45.592 0 I switch to; address_space = "process" @ 0p2CEC000
15:08:45.603 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:45.607 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:45.611 0 I allocate; slot = Process { pid: 8:1, address_space: "8:1" @ 0p2CEC000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD588 } }; process_count = 6
15:08:45.618 0 I syscall = "exofork"; process = 5:3; child = 8:1
15:08:45.625 0 I syscall::exofork() done; child = 8:1; pid = 5:3
15:08:45.726 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100102A6, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:45.773 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:45.833 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAB4, ss:rsp: 0x001B:0v7F7FFFFFCB58, rflags: IF ZF PF }
15:08:45.879 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF ZF AF PF CF }
15:08:45.927 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:45.986 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10033E87, ss:rsp: 0x001B:0v7F7FFFFFAC08, rflags: IF AF }
15:08:46.001 0 D leaving the user mode; pid = 5:3
15:08:46.016 0 I the process was preempted; pid = 5:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFD4FC8, rflags: IF AF }
15:08:46.034 0 I returned
15:08:46.038 0 I dequeue; pid = Some(4:2)
15:08:46.041 0 I switch to; address_space = "4:2" @ 0p30A4000
15:08:46.044 0 D entering the user mode; pid = 4:2; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD0C8, rflags: IF ZF PF } }
15:08:46.053 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF PF }
15:08:46.100 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFF4D98, rflags: IF ZF PF }
15:08:46.143 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000F944, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:46.192 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD018, rflags: IF }
15:08:46.223 0 D leaving the user mode; pid = 4:2
15:08:46.237 0 I the process was preempted; pid = 4:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF }
15:08:46.245 0 I returned
15:08:46.249 0 I dequeue; pid = Some(1:2)
15:08:46.252 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:46.255 0 D entering the user mode; pid = 1:2; registers = { rax: 0xFF, rdi: 0x7F7FFFFFCC78, rsi: 0x100, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE7FC8, rflags: IF } }
15:08:46.284 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:46.315 0 D leaving the user mode; pid = 1:2
15:08:46.329 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE7FC8, rflags: IF ZF AF PF CF }
15:08:46.339 0 I returned
15:08:46.343 0 I dequeue; pid = Some(9:2)
15:08:46.346 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:46.349 0 D entering the user mode; pid = 9:2; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD588, rflags: IF } }
15:08:46.358 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF }
15:08:46.402 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7F7FFFFDED98, rflags: IF ZF PF }
15:08:46.452 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD4D8, rflags: IF }
15:08:46.497 0 D leaving the user mode; pid = 9:2
15:08:46.514 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v1001D3D3, ss:rsp: 0x001B:0v7F7FFFFFD388, rflags: IF AF }
15:08:46.528 0 I returned
15:08:46.531 0 I dequeue; pid = Some(5:3)
15:08:46.534 0 I switch to; address_space = "5:3" @ 0p2EC9000
15:08:46.538 0 D entering the user mode; pid = 5:3; registers = { rax: 0x7F7FFFFFB700, rdi: 0x7F7FFFFFB7F0, rsi: 0x4030000000000000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFD4FC8, rflags: IF AF } }
15:08:45.905 0 I copy_address_space done; child = 8:1; trap_stack = [0x7f7ffffd1, 0x7f7ffffd5), size 16.000 KiB; pid = 5:3
15:08:46.595 0 D syscall = "set_trap_handler"; dst = 8:1; trap_context = { { rip: 0v10011250, rsp: 0v7F7FFFFD5000 }, stack: [127.500 TiB, 127.500 TiB), size 16.000 KiB }
15:08:46.625 0 I syscall::set_state() done; child = 8:1; pid = 5:3
15:08:46.653 0 I free; slot = Process { pid: 5:3, address_space: "5:3" @ 0p2EC9000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 5
15:08:46.664 0 I switch to; address_space = "base" @ 0p1000
15:08:46.667 0 I drop the current address space; address_space = "5:3" @ 0p2EC9000; switch_to = "base" @ 0p1000
15:08:46.710 0 I syscall = "exit"; pid = 5:3; code = 0; reason = Some(OK)
15:08:46.716 0 D leaving the user mode; pid = 5:3
15:08:46.719 0 I dequeue; pid = Some(4:2)
15:08:46.722 0 I switch to; address_space = "4:2" @ 0p30A4000
15:08:46.725 0 D entering the user mode; pid = 4:2; registers = { rax: 0x100585E8, rdi: 0x100585E8, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF } }
15:08:46.755 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:46.803 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AD37, ss:rsp: 0x001B:0v7F7FFFFFBF98, rflags: IF AF }
15:08:46.754 0 I syscall::exofork() done; child = <current>; pid = 4:2
15:08:46.851 0 I just created; child = <current>; pid = 4:2; pid = 4:2
15:08:46.854 0 I name = "cow_fork *00"; pedigree = [5:3, 1:2, 4:2]; len = 3; capacity = 3; pid = 4:2
15:08:46.901 0 I free; slot = Process { pid: 4:2, address_space: "4:2" @ 0p30A4000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 4
15:08:46.915 0 I switch to; address_space = "base" @ 0p1000
15:08:46.918 0 I drop the current address space; address_space = "4:2" @ 0p30A4000; switch_to = "base" @ 0p1000
15:08:46.967 0 I syscall = "exit"; pid = 4:2; code = 0; reason = Some(OK)
15:08:46.972 0 D leaving the user mode; pid = 4:2
15:08:46.976 0 I dequeue; pid = Some(1:2)
15:08:47.001 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:47.003 0 D entering the user mode; pid = 1:2; registers = { rax: 0x10001208, rdi: 0x7F7FFFFFD5E0, rsi: 0x7F7FFFFFD600, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE7FC8, rflags: IF ZF AF PF CF } }
15:08:47.031 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:47.084 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100305F7, ss:rsp: 0x001B:0v7F7FFFFFAE98, rflags: IF AF }
15:08:47.136 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10045DFF, ss:rsp: 0x001B:0v7F7FFFFF9FE8, rflags: IF AF PF }
15:08:47.030 0 I copy_address_space done; child = 0:10; trap_stack = [0x7efffffe4, 0x7efffffe8), size 16.000 KiB; pid = 1:2
15:08:47.216 0 D syscall = "set_trap_handler"; dst = 0:10; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFE8000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:47.253 0 I syscall::set_state() done; child = 0:10; pid = 1:2
15:08:47.290 0 D syscall = "set_trap_handler"; dst = 1:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFDD000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:47.374 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:47.388 0 I duplicate; address_space = "process" @ 0p2EF3000
15:08:47.392 0 I switch to; address_space = "process" @ 0p2EF3000
15:08:47.405 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:47.420 0 I switch to; address_space = "4:3" @ 0p2EF3000
15:08:47.424 0 I allocate; slot = Process { pid: 4:3, address_space: "4:3" @ 0p2EF3000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD0C8 } }; process_count = 5
15:08:47.431 0 I syscall = "exofork"; process = 1:2; child = 4:3
15:08:47.437 0 I syscall::exofork() done; child = 4:3; pid = 1:2
15:08:47.533 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBAB8, rflags: IF }
15:08:47.589 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFBCB8, rflags: IF }
15:08:47.620 0 D leaving the user mode; pid = 1:2
15:08:47.634 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF }
15:08:47.642 0 I returned
15:08:47.645 0 I dequeue; pid = Some(9:2)
15:08:47.649 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:47.652 0 D entering the user mode; pid = 9:2; registers = { rax: 0x0, rdi: 0x100567E0, rsi: 0x112D65DDED, { mode: user, cs:rip: 0x0023:0v1001D3D3, ss:rsp: 0x001B:0v7F7FFFFFD388, rflags: IF AF } }
15:08:47.661 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:47.706 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001B31A, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:47.734 0 D leaving the user mode; pid = 9:2
15:08:47.752 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF AF }
15:08:47.764 0 I returned
15:08:47.767 0 I dequeue; pid = Some(8:1)
15:08:47.770 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:47.773 0 D entering the user mode; pid = 8:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD588, rflags: IF AF } }
15:08:47.782 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF AF }
15:08:47.816 0 D leaving the user mode; pid = 8:1
15:08:47.830 0 I the process was preempted; pid = 8:1; user_context = { mode: user, cs:rip: 0x0023:0v1001222D, ss:rsp: 0x001B:0v7F7FFFFD4AC8, rflags: IF ZF PF }
15:08:47.838 0 I returned
15:08:47.841 0 I dequeue; pid = Some(0:10)
15:08:47.844 0 I switch to; address_space = "0:10" @ 0p2D02000
15:08:47.854 0 D entering the user mode; pid = 0:10; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD0C8, rflags: IF ZF PF } }
15:08:47.871 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF PF }
15:08:47.914 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFE7D98, rflags: IF ZF PF }
15:08:47.947 0 D leaving the user mode; pid = 0:10
15:08:47.962 0 I the process was preempted; pid = 0:10; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE7D60, rflags: IF ZF PF }
15:08:47.976 0 I returned
15:08:47.986 0 I dequeue; pid = Some(1:2)
15:08:47.990 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:47.994 0 D entering the user mode; pid = 1:2; registers = { rax: 0x1FD, rdi: 0x7F7FFFFFBDA8, rsi: 0x1FE, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF } }
15:08:48.029 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFCB88, rflags: IF }
15:08:48.074 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:48.122 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:48.186 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100305F7, ss:rsp: 0x001B:0v7F7FFFFFAE98, rflags: IF AF }
15:08:48.218 0 D leaving the user mode; pid = 1:2
15:08:48.232 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF AF }
15:08:48.241 0 I returned
15:08:48.255 0 I dequeue; pid = Some(9:2)
15:08:48.259 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:48.263 0 D entering the user mode; pid = 9:2; registers = { rax: 0x7F7FFFFFD102, rdi: 0x7EFFFFFFB008, rsi: 0x2, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF AF } }
15:08:48.292 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AF12, ss:rsp: 0x001B:0v7F7FFFFFBFB8, rflags: IF }
15:08:48.320 0 D leaving the user mode; pid = 9:2
15:08:48.335 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF }
15:08:48.346 0 I returned
15:08:48.349 0 I dequeue; pid = Some(8:1)
15:08:48.353 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:48.356 0 D entering the user mode; pid = 8:1; registers = { rax: 0x0, rdi: 0x7F7FFFFD4B98, rsi: 0x7F7FFFFD4BC0, { mode: user, cs:rip: 0x0023:0v1001222D, ss:rsp: 0x001B:0v7F7FFFFD4AC8, rflags: IF ZF PF } }
15:08:48.377 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7F7FFFFD4D98, rflags: IF ZF PF }
15:08:48.428 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD4D8, rflags: IF }
15:08:48.474 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:48.521 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001B31A, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:48.576 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AF12, ss:rsp: 0x001B:0v7F7FFFFFBFB8, rflags: IF }
15:08:48.473 0 I syscall::exofork() done; child = <current>; pid = 8:1
15:08:48.625 0 I just created; child = <current>; pid = 8:1; pid = 8:1
15:08:48.633 0 I name = "cow_fork *2"; pedigree = [5:3, 8:1]; len = 2; capacity = 3; pid = 8:1
15:08:48.687 0 D syscall = "set_trap_handler"; dst = 8:1; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFF5000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:48.775 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:48.788 0 I duplicate; address_space = "process" @ 0p2D2E000
15:08:48.792 0 I switch to; address_space = "process" @ 0p2D2E000
15:08:48.806 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:48.821 0 I switch to; address_space = "5:4" @ 0p2D2E000
15:08:48.825 0 I allocate; slot = Process { pid: 5:4, address_space: "5:4" @ 0p2D2E000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD0C8 } }; process_count = 6
15:08:48.831 0 I syscall = "exofork"; process = 8:1; child = 5:4
15:08:48.837 0 I syscall::exofork() done; child = 5:4; pid = 8:1
15:08:48.931 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBAB8, rflags: IF }
15:08:48.986 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFBCB8, rflags: IF }
15:08:49.001 0 D leaving the user mode; pid = 8:1
15:08:49.015 0 I the process was preempted; pid = 8:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF }
15:08:49.023 0 I returned
15:08:49.026 0 I dequeue; pid = Some(0:10)
15:08:49.030 0 I switch to; address_space = "0:10" @ 0p2D02000
15:08:49.033 0 D entering the user mode; pid = 0:10; registers = { rax: 0x7EFFFFFE7F18, rdi: 0x7EFFFFFE7DC0, rsi: 0x7EFFFFFE7DE8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE7D60, rflags: IF ZF PF } }
15:08:49.061 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000F944, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:49.106 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD018, rflags: IF }
15:08:49.153 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:49.194 0 D leaving the user mode; pid = 0:10
15:08:49.207 0 I the process was preempted; pid = 0:10; user_context = { mode: user, cs:rip: 0x0023:0v1000E890, ss:rsp: 0x001B:0v7EFFFFFE7710, rflags: IF AF PF }
15:08:49.217 0 I returned
15:08:49.220 0 I dequeue; pid = Some(1:2)
15:08:49.224 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:49.227 0 D entering the user mode; pid = 1:2; registers = { rax: 0x7F7FFFFFBD00, rdi: 0x7F7FFFFFBDB0, rsi: 0x7F7FFFFFC0D8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF AF } }
15:08:49.248 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10045DFF, ss:rsp: 0x001B:0v7F7FFFFF9FE8, rflags: IF AF PF }
15:08:48.103 0 I copy_address_space done; child = 4:3; trap_stack = [0x7efffffd9, 0x7efffffdd), size 16.000 KiB; pid = 1:2
15:08:49.330 0 D syscall = "set_trap_handler"; dst = 4:3; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFDD000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:49.359 0 I syscall::set_state() done; child = 4:3; pid = 1:2
15:08:49.394 0 D leaving the user mode; pid = 1:2
15:08:49.402 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011310, ss:rsp: 0x001B:0v7F7FFFFFD090, rflags: IF }
15:08:49.416 0 I returned
15:08:49.419 0 I dequeue; pid = Some(9:2)
15:08:49.423 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:49.426 0 D entering the user mode; pid = 9:2; registers = { rax: 0x51, rdi: 0x7F7FFFFFC0C8, rsi: 0x7F7FFFFFD190, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7F7FFFFDEFC8, rflags: IF } }
15:08:46.495 0 I syscall::exofork() done; child = <current>; pid = 9:2
15:08:49.451 0 I just created; child = <current>; pid = 9:2; pid = 9:2
15:08:49.457 0 I name = "cow_fork *1"; pedigree = [5:3, 9:2]; len = 2; capacity = 3; pid = 9:2
15:08:49.512 0 D syscall = "set_trap_handler"; dst = 9:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFF5000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:49.598 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:49.611 0 I duplicate; address_space = "process" @ 0p3027000
15:08:49.615 0 I switch to; address_space = "process" @ 0p3027000
15:08:49.629 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:49.644 0 I switch to; address_space = "6:2" @ 0p3027000
15:08:49.648 0 I allocate; slot = Process { pid: 6:2, address_space: "6:2" @ 0p3027000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD0C8 } }; process_count = 7
15:08:49.655 0 I syscall = "exofork"; process = 9:2; child = 6:2
15:08:49.661 0 I syscall::exofork() done; child = 6:2; pid = 9:2
15:08:49.753 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBAB8, rflags: IF }
15:08:49.793 0 D leaving the user mode; pid = 9:2
15:08:49.807 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10044A70, ss:rsp: 0x001B:0v7EFFFFFF4BC0, rflags: IF AF }
15:08:49.816 0 I returned
15:08:49.819 0 I dequeue; pid = Some(8:1)
15:08:49.822 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:49.826 0 D entering the user mode; pid = 8:1; registers = { rax: 0x1FD, rdi: 0x7F7FFFFFBDA8, rsi: 0x1FE, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF } }
15:08:49.850 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFCB88, rflags: IF }
15:08:49.900 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:49.946 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:50.025 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100305F7, ss:rsp: 0x001B:0v7F7FFFFFAE98, rflags: IF AF }
15:08:50.072 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10045DFF, ss:rsp: 0x001B:0v7F7FFFFF9FE8, rflags: IF AF PF }
15:08:49.965 0 I copy_address_space done; child = 5:4; trap_stack = [0x7effffff1, 0x7effffff5), size 16.000 KiB; pid = 8:1
15:08:50.153 0 D syscall = "set_trap_handler"; dst = 5:4; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFF5000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:50.184 0 I syscall::set_state() done; child = 5:4; pid = 8:1
15:08:50.221 0 D syscall = "set_trap_handler"; dst = 8:1; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFEA000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:50.306 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:50.320 0 I duplicate; address_space = "process" @ 0p303B000
15:08:50.323 0 I switch to; address_space = "process" @ 0p303B000
15:08:50.337 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:50.352 0 I switch to; address_space = "2:1" @ 0p303B000
15:08:50.357 0 I allocate; slot = Process { pid: 2:1, address_space: "2:1" @ 0p303B000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD0C8 } }; process_count = 8
15:08:50.363 0 I syscall = "exofork"; process = 8:1; child = 2:1
15:08:50.370 0 I syscall::exofork() done; child = 2:1; pid = 8:1
15:08:50.466 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBAB8, rflags: IF }
15:08:50.521 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFBCB8, rflags: IF }
15:08:50.568 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFCB88, rflags: IF }
15:08:50.615 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:50.665 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:50.713 0 D leaving the user mode; pid = 8:1
15:08:50.730 0 I the process was preempted; pid = 8:1; user_context = { mode: user, cs:rip: 0x0023:0v10026800, ss:rsp: 0x001B:0v7F7FFFFFCBC0, rflags: IF ZF PF }
15:08:50.742 0 I returned
15:08:50.745 0 I dequeue; pid = Some(0:10)
15:08:50.748 0 I switch to; address_space = "0:10" @ 0p2D02000
15:08:50.752 0 D entering the user mode; pid = 0:10; registers = { rax: 0x7EFFFFFE7D18, rdi: 0x7EFFFFFE7748, rsi: 0x7E7FFFFF6000, { mode: user, cs:rip: 0x0023:0v1000E890, ss:rsp: 0x001B:0v7EFFFFFE7710, rflags: IF AF PF } }
15:08:50.777 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AD37, ss:rsp: 0x001B:0v7F7FFFFFBF98, rflags: IF AF }
15:08:49.171 0 I syscall::exofork() done; child = <current>; pid = 0:10
15:08:50.829 0 I just created; child = <current>; pid = 0:10; pid = 0:10
15:08:50.833 0 I name = "cow_fork *01"; pedigree = [5:3, 1:2, 0:10]; len = 3; capacity = 3; pid = 0:10
15:08:50.875 0 I free; slot = Process { pid: 0:10, address_space: "0:10" @ 0p2D02000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 7
15:08:50.883 0 I switch to; address_space = "base" @ 0p1000
15:08:50.886 0 I drop the current address space; address_space = "0:10" @ 0p2D02000; switch_to = "base" @ 0p1000
15:08:50.936 0 I syscall = "exit"; pid = 0:10; code = 0; reason = Some(OK)
15:08:50.940 0 D leaving the user mode; pid = 0:10
15:08:50.943 0 I dequeue; pid = Some(4:3)
15:08:50.947 0 I switch to; address_space = "4:3" @ 0p2EF3000
15:08:50.950 0 D entering the user mode; pid = 4:3; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD0C8, rflags: IF ZF AF PF CF } }
15:08:50.961 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:51.019 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFDCD98, rflags: IF ZF PF }
15:08:51.063 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000F944, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:51.111 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD018, rflags: IF }
15:08:51.139 0 D leaving the user mode; pid = 4:3
15:08:51.157 0 I the process was preempted; pid = 4:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF }
15:08:51.170 0 I returned
15:08:51.173 0 I dequeue; pid = Some(1:2)
15:08:51.176 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:51.180 0 D entering the user mode; pid = 1:2; registers = { rax: 0x0, rdi: 0x0, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10011310, ss:rsp: 0x001B:0v7F7FFFFFD090, rflags: IF } }
15:08:51.194 0 D syscall = "set_trap_handler"; dst = 1:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFD2000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:51.263 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:51.284 0 I duplicate; address_space = "process" @ 0p2F4E000
15:08:51.287 0 I switch to; address_space = "process" @ 0p2F4E000
15:08:51.297 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:51.301 0 I switch to; address_space = "0:11" @ 0p2F4E000
15:08:51.305 0 I allocate; slot = Process { pid: 0:11, address_space: "0:11" @ 0p2F4E000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD588 } }; process_count = 8
15:08:51.312 0 I syscall = "exofork"; process = 1:2; child = 0:11
15:08:51.330 0 I syscall::exofork() done; child = 0:11; pid = 1:2
15:08:51.434 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100102A6, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:51.489 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:51.521 0 D leaving the user mode; pid = 1:2
15:08:51.534 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1FC8, rflags: IF }
15:08:51.542 0 I returned
15:08:51.545 0 I dequeue; pid = Some(9:2)
15:08:51.549 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:51.552 0 D entering the user mode; pid = 9:2; registers = { rax: 0x7EFFFFFF1, rdi: 0x7EFFFFFF4CE0, rsi: 0x7EFFFFFF1, { mode: user, cs:rip: 0x0023:0v10044A70, ss:rsp: 0x001B:0v7EFFFFFF4BC0, rflags: IF AF } }
15:08:51.581 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFBCB8, rflags: IF }
15:08:51.628 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFCB88, rflags: IF }
15:08:51.675 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:51.726 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:51.779 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100305F7, ss:rsp: 0x001B:0v7F7FFFFFAE98, rflags: IF AF }
15:08:51.818 0 D leaving the user mode; pid = 9:2
15:08:51.832 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v1000FA4F, ss:rsp: 0x001B:0v7EFFFFFF4758, rflags: IF AF PF }
15:08:51.840 0 I returned
15:08:51.843 0 I dequeue; pid = Some(5:4)
15:08:51.846 0 I switch to; address_space = "5:4" @ 0p2D2E000
15:08:51.850 0 D entering the user mode; pid = 5:4; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD0C8, rflags: IF ZF PF } }
15:08:51.859 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF PF }
15:08:51.906 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFF4D98, rflags: IF ZF PF }
15:08:51.935 0 D leaving the user mode; pid = 5:4
15:08:51.950 0 I the process was preempted; pid = 5:4; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4D60, rflags: IF ZF PF }
15:08:51.969 0 I returned
15:08:51.973 0 I dequeue; pid = Some(8:1)
15:08:51.976 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:51.979 0 D entering the user mode; pid = 8:1; registers = { rax: 0x7F7FFFFFD6C8, rdi: 0x7F7FFFFFD6D0, rsi: 0x7F7FFFFFD728, { mode: user, cs:rip: 0x0023:0v10026800, ss:rsp: 0x001B:0v7F7FFFFFCBC0, rflags: IF ZF PF } }
15:08:51.996 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100305F7, ss:rsp: 0x001B:0v7F7FFFFFAE98, rflags: IF AF }
15:08:52.001 0 D leaving the user mode; pid = 8:1
15:08:52.019 0 I the process was preempted; pid = 8:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9FC8, rflags: IF AF }
15:08:52.033 0 I returned
15:08:52.037 0 I dequeue; pid = Some(4:3)
15:08:52.040 0 I switch to; address_space = "4:3" @ 0p2EF3000
15:08:52.043 0 D entering the user mode; pid = 4:3; registers = { rax: 0x100585E8, rdi: 0x100585E8, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF } }
15:08:52.065 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:52.094 0 D leaving the user mode; pid = 4:3
15:08:52.111 0 I the process was preempted; pid = 4:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF PF }
15:08:52.125 0 I returned
15:08:52.128 0 I dequeue; pid = Some(1:2)
15:08:52.132 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:52.135 0 D entering the user mode; pid = 1:2; registers = { rax: 0x0, rdi: 0x0, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1FC8, rflags: IF } }
15:08:52.160 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAB4, ss:rsp: 0x001B:0v7F7FFFFFCB58, rflags: IF ZF PF }
15:08:52.209 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF ZF AF PF CF }
15:08:52.255 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:52.311 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10033E87, ss:rsp: 0x001B:0v7F7FFFFFAC08, rflags: IF AF }
15:08:52.254 0 I copy_address_space done; child = 0:11; trap_stack = [0x7efffffce, 0x7efffffd2), size 16.000 KiB; pid = 1:2
15:08:52.393 0 D syscall = "set_trap_handler"; dst = 0:11; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFD2000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:52.433 0 I syscall::set_state() done; child = 0:11; pid = 1:2
15:08:52.470 0 D syscall = "set_trap_handler"; dst = 1:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFC8000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:52.556 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:52.569 0 I duplicate; address_space = "process" @ 0p3054000
15:08:52.573 0 I switch to; address_space = "process" @ 0p3054000
15:08:52.587 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:52.602 0 I switch to; address_space = "7:1" @ 0p3054000
15:08:52.606 0 I allocate; slot = Process { pid: 7:1, address_space: "7:1" @ 0p3054000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD588 } }; process_count = 9
15:08:52.613 0 I syscall = "exofork"; process = 1:2; child = 7:1
15:08:52.619 0 I syscall::exofork() done; child = 7:1; pid = 1:2
15:08:52.718 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100102A6, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:52.773 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:08:52.805 0 D leaving the user mode; pid = 1:2
15:08:52.819 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7FC8, rflags: IF }
15:08:52.827 0 I returned
15:08:52.830 0 I dequeue; pid = Some(9:2)
15:08:52.833 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:52.837 0 D entering the user mode; pid = 9:2; registers = { rax: 0x7EFFFFFEB, rdi: 0x7EFFFFFF4708, rsi: 0x7EFFFFFEB000, { mode: user, cs:rip: 0x0023:0v1000FA4F, ss:rsp: 0x001B:0v7EFFFFFF4758, rflags: IF AF PF } }
15:08:52.865 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10045DFF, ss:rsp: 0x001B:0v7F7FFFFF9FE8, rflags: IF AF PF }
15:08:52.897 0 D leaving the user mode; pid = 9:2
15:08:52.910 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF AF PF }
15:08:52.918 0 I returned
15:08:52.921 0 I dequeue; pid = Some(5:4)
15:08:52.925 0 I switch to; address_space = "5:4" @ 0p2D2E000
15:08:52.928 0 D entering the user mode; pid = 5:4; registers = { rax: 0x7EFFFFFF4F18, rdi: 0x7EFFFFFF4DC0, rsi: 0x7EFFFFFF4DE8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4D60, rflags: IF ZF PF } }
15:08:52.958 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000F944, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:53.001 0 D leaving the user mode; pid = 5:4
15:08:53.015 0 I the process was preempted; pid = 5:4; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF AF }
15:08:53.023 0 I returned
15:08:53.026 0 I dequeue; pid = Some(8:1)
15:08:53.029 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:53.033 0 D entering the user mode; pid = 8:1; registers = { rax: 0x7F7FFFFFBD00, rdi: 0x7F7FFFFFBDB0, rsi: 0x7F7FFFFFC0D8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9FC8, rflags: IF AF } }
15:08:53.062 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10045DFF, ss:rsp: 0x001B:0v7F7FFFFF9FE8, rflags: IF AF PF }
15:08:50.651 0 I copy_address_space done; child = 2:1; trap_stack = [0x7efffffe6, 0x7efffffea), size 16.000 KiB; pid = 8:1
15:08:53.146 0 D syscall = "set_trap_handler"; dst = 2:1; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFEA000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:53.182 0 I syscall::set_state() done; child = 2:1; pid = 8:1
15:08:53.219 0 D syscall = "set_trap_handler"; dst = 8:1; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFDF000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:53.305 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:53.318 0 I duplicate; address_space = "process" @ 0p2D9C000
15:08:53.322 0 I switch to; address_space = "process" @ 0p2D9C000
15:08:53.335 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:53.351 0 I switch to; address_space = "3:1" @ 0p2D9C000
15:08:53.355 0 I allocate; slot = Process { pid: 3:1, address_space: "3:1" @ 0p2D9C000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD0C8 } }; process_count = 10
15:08:53.361 0 I syscall = "exofork"; process = 8:1; child = 3:1
15:08:53.368 0 I syscall::exofork() done; child = 3:1; pid = 8:1
15:08:53.466 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBAB8, rflags: IF }
15:08:53.521 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFBCB8, rflags: IF }
15:08:53.568 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFCB88, rflags: IF }
15:08:53.600 0 D leaving the user mode; pid = 8:1
15:08:53.614 0 I the process was preempted; pid = 8:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF }
15:08:53.623 0 I returned
15:08:53.636 0 I dequeue; pid = Some(4:3)
15:08:53.640 0 I switch to; address_space = "4:3" @ 0p2EF3000
15:08:53.645 0 D entering the user mode; pid = 4:3; registers = { rax: 0x1, rdi: 0x100567E0, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF PF } }
15:08:53.673 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AD37, ss:rsp: 0x001B:0v7F7FFFFFBF98, rflags: IF AF }
15:08:53.701 0 D leaving the user mode; pid = 4:3
15:08:53.716 0 I the process was preempted; pid = 4:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF AF }
15:08:53.727 0 I returned
15:08:53.730 0 I dequeue; pid = Some(0:11)
15:08:53.734 0 I switch to; address_space = "0:11" @ 0p2F4E000
15:08:53.737 0 D entering the user mode; pid = 0:11; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD588, rflags: IF } }
15:08:53.746 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF }
15:08:53.793 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFD1D98, rflags: IF ZF PF }
15:08:53.822 0 D leaving the user mode; pid = 0:11
15:08:53.836 0 I the process was preempted; pid = 0:11; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1D60, rflags: IF ZF PF }
15:08:53.852 0 I returned
15:08:53.861 0 I dequeue; pid = Some(1:2)
15:08:53.864 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:53.868 0 D entering the user mode; pid = 1:2; registers = { rax: 0x0, rdi: 0x0, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7FC8, rflags: IF } }
15:08:53.892 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAB4, ss:rsp: 0x001B:0v7F7FFFFFCB58, rflags: IF ZF PF }
15:08:53.921 0 D leaving the user mode; pid = 1:2
15:08:53.939 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7FC8, rflags: IF ZF PF }
15:08:53.952 0 I returned
15:08:53.955 0 I dequeue; pid = Some(9:2)
15:08:53.958 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:53.962 0 D entering the user mode; pid = 9:2; registers = { rax: 0x5, rdi: 0x7F7FFFFFAED0, rsi: 0x3A, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF AF PF } }
15:08:51.724 0 I copy_address_space done; child = 6:2; trap_stack = [0x7effffff1, 0x7effffff5), size 16.000 KiB; pid = 9:2
15:08:54.039 0 D syscall = "set_trap_handler"; dst = 6:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFF5000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:54.071 0 I syscall::set_state() done; child = 6:2; pid = 9:2
15:08:54.107 0 D syscall = "set_trap_handler"; dst = 9:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFEA000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:54.192 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:54.206 0 I duplicate; address_space = "process" @ 0p2D70000
15:08:54.209 0 I switch to; address_space = "process" @ 0p2D70000
15:08:54.223 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:54.239 0 I switch to; address_space = "10:0" @ 0p2D70000
15:08:54.243 0 I allocate; slot = Process { pid: 10:0, address_space: "10:0" @ 0p2D70000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD0C8 } }; process_count = 11
15:08:54.249 0 I syscall = "exofork"; process = 9:2; child = 10:0
15:08:54.255 0 I syscall::exofork() done; child = 10:0; pid = 9:2
15:08:54.350 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBAB8, rflags: IF }
15:08:54.405 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFBCB8, rflags: IF }
15:08:54.436 0 D leaving the user mode; pid = 9:2
15:08:54.450 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9FC8, rflags: IF }
15:08:54.458 0 I returned
15:08:54.461 0 I dequeue; pid = Some(5:4)
15:08:54.464 0 I switch to; address_space = "5:4" @ 0p2D2E000
15:08:54.468 0 D entering the user mode; pid = 5:4; registers = { rax: 0x7E7FFFFFB000, rdi: 0x7F7FFFFFE188, rsi: 0x7F7FFFFFE190, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF AF } }
15:08:54.497 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD018, rflags: IF }
15:08:54.528 0 D leaving the user mode; pid = 5:4
15:08:54.541 0 I the process was preempted; pid = 5:4; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF }
15:08:54.550 0 I returned
15:08:54.553 0 I dequeue; pid = Some(2:1)
15:08:54.556 0 I switch to; address_space = "2:1" @ 0p303B000
15:08:54.560 0 D entering the user mode; pid = 2:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD0C8, rflags: IF } }
15:08:54.569 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF }
15:08:54.613 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFE9D98, rflags: IF ZF PF }
15:08:54.641 0 D leaving the user mode; pid = 2:1
15:08:54.659 0 I the process was preempted; pid = 2:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9D60, rflags: IF ZF PF }
15:08:54.671 0 I returned
15:08:54.674 0 I dequeue; pid = Some(8:1)
15:08:54.678 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:54.681 0 D entering the user mode; pid = 8:1; registers = { rax: 0xFF, rdi: 0x7F7FFFFFCC78, rsi: 0x100, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF } }
15:08:54.702 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:54.731 0 D leaving the user mode; pid = 8:1
15:08:54.748 0 I the process was preempted; pid = 8:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF ZF AF PF CF }
15:08:54.765 0 I returned
15:08:54.768 0 I dequeue; pid = Some(4:3)
15:08:54.771 0 I switch to; address_space = "4:3" @ 0p2EF3000
15:08:54.774 0 D entering the user mode; pid = 4:3; registers = { rax: 0x7F7FFFFFC0CF, rdi: 0x7F7FFFFFC0A8, rsi: 0x7F7FFFFFCCD0, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDCFC8, rflags: IF AF } }
15:08:52.093 0 I syscall::exofork() done; child = <current>; pid = 4:3
15:08:54.801 0 I just created; child = <current>; pid = 4:3; pid = 4:3
15:08:54.805 0 I name = "cow_fork *02"; pedigree = [5:3, 1:2, 4:3]; len = 3; capacity = 3; pid = 4:3
15:08:54.851 0 I free; slot = Process { pid: 4:3, address_space: "4:3" @ 0p2EF3000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 10
15:08:54.865 0 I switch to; address_space = "base" @ 0p1000
15:08:54.868 0 I drop the current address space; address_space = "4:3" @ 0p2EF3000; switch_to = "base" @ 0p1000
15:08:54.916 0 I syscall = "exit"; pid = 4:3; code = 0; reason = Some(OK)
15:08:54.922 0 D leaving the user mode; pid = 4:3
15:08:54.925 0 I dequeue; pid = Some(0:11)
15:08:54.928 0 I switch to; address_space = "0:11" @ 0p2F4E000
15:08:54.931 0 D entering the user mode; pid = 0:11; registers = { rax: 0x7EFFFFFD1F18, rdi: 0x7EFFFFFD1DC0, rsi: 0x7EFFFFFD1DE8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1D60, rflags: IF ZF PF } }
15:08:54.960 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD4D8, rflags: IF }
15:08:55.008 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:55.041 0 D leaving the user mode; pid = 0:11
15:08:55.055 0 I the process was preempted; pid = 0:11; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1FC8, rflags: IF PF }
15:08:55.070 0 I returned
15:08:55.078 0 I dequeue; pid = Some(1:2)
15:08:55.082 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:55.085 0 D entering the user mode; pid = 1:2; registers = { rax: 0x7F7FFFFFD450, rdi: 0x7F7FFFFFCC48, rsi: 0x7F7FFFFFCC50, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7FC8, rflags: IF ZF PF } }
15:08:55.107 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF ZF AF PF CF }
15:08:55.136 0 D leaving the user mode; pid = 1:2
15:08:55.154 0 I the process was preempted; pid = 1:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7FC8, rflags: IF ZF AF PF CF }
15:08:55.171 0 I returned
15:08:55.174 0 I dequeue; pid = Some(6:2)
15:08:55.178 0 I switch to; address_space = "6:2" @ 0p3027000
15:08:55.181 0 D entering the user mode; pid = 6:2; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD0C8, rflags: IF } }
15:08:55.190 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF }
15:08:55.224 0 D leaving the user mode; pid = 6:2
15:08:55.237 0 I the process was preempted; pid = 6:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF }
15:08:55.245 0 I returned
15:08:55.248 0 I dequeue; pid = Some(9:2)
15:08:55.252 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:55.256 0 D entering the user mode; pid = 9:2; registers = { rax: 0x1FD, rdi: 0x7F7FFFFFBDA8, rsi: 0x1FE, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9FC8, rflags: IF } }
15:08:55.293 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFCB88, rflags: IF }
15:08:55.322 0 D leaving the user mode; pid = 9:2
15:08:55.337 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9FC8, rflags: IF }
15:08:55.355 0 I returned
15:08:55.358 0 I dequeue; pid = Some(5:4)
15:08:55.361 0 I switch to; address_space = "5:4" @ 0p2D2E000
15:08:55.365 0 D entering the user mode; pid = 5:4; registers = { rax: 0x100585E8, rdi: 0x100585E8, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF } }
15:08:55.387 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:55.441 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AD37, ss:rsp: 0x001B:0v7F7FFFFFBF98, rflags: IF AF }
15:08:55.386 0 I syscall::exofork() done; child = <current>; pid = 5:4
15:08:55.491 0 I just created; child = <current>; pid = 5:4; pid = 5:4
15:08:55.498 0 I name = "cow_fork *20"; pedigree = [5:3, 8:1, 5:4]; len = 3; capacity = 3; pid = 5:4
15:08:55.545 0 I free; slot = Process { pid: 5:4, address_space: "5:4" @ 0p2D2E000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 9
15:08:55.559 0 I switch to; address_space = "base" @ 0p1000
15:08:55.562 0 I drop the current address space; address_space = "5:4" @ 0p2D2E000; switch_to = "base" @ 0p1000
15:08:55.610 0 I syscall = "exit"; pid = 5:4; code = 0; reason = Some(OK)
15:08:55.616 0 D leaving the user mode; pid = 5:4
15:08:55.620 0 I dequeue; pid = Some(2:1)
15:08:55.623 0 I switch to; address_space = "2:1" @ 0p303B000
15:08:55.626 0 D entering the user mode; pid = 2:1; registers = { rax: 0x7EFFFFFE9F18, rdi: 0x7EFFFFFE9DC0, rsi: 0x7EFFFFFE9DE8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9D60, rflags: IF ZF PF } }
15:08:55.654 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000F944, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:55.700 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD018, rflags: IF }
15:08:55.733 0 D leaving the user mode; pid = 2:1
15:08:55.747 0 I the process was preempted; pid = 2:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9FC8, rflags: IF }
15:08:55.756 0 I returned
15:08:55.770 0 I dequeue; pid = Some(8:1)
15:08:55.774 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:55.778 0 D entering the user mode; pid = 8:1; registers = { rax: 0x10001208, rdi: 0x7F7FFFFFD5E0, rsi: 0x7F7FFFFFD600, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF ZF AF PF CF } }
15:08:55.801 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:55.830 0 D leaving the user mode; pid = 8:1
15:08:55.847 0 I the process was preempted; pid = 8:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF PF }
15:08:55.861 0 I returned
15:08:55.865 0 I dequeue; pid = Some(0:11)
15:08:55.868 0 I switch to; address_space = "0:11" @ 0p2F4E000
15:08:55.871 0 D entering the user mode; pid = 0:11; registers = { rax: 0x1, rdi: 0x100567E0, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1FC8, rflags: IF PF } }
15:08:55.893 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001B31A, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:55.922 0 D leaving the user mode; pid = 0:11
15:08:55.939 0 I the process was preempted; pid = 0:11; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1FC8, rflags: IF AF }
15:08:55.953 0 I returned
15:08:55.956 0 I dequeue; pid = Some(1:2)
15:08:55.959 0 I switch to; address_space = "1:2" @ 0p30A1000
15:08:55.963 0 D entering the user mode; pid = 1:2; registers = { rax: 0x10001208, rdi: 0x7F7FFFFFDAA0, rsi: 0x7F7FFFFFDAC0, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7FC8, rflags: IF ZF AF PF CF } }
15:08:55.986 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:56.031 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10033E87, ss:rsp: 0x001B:0v7F7FFFFFAC08, rflags: IF AF }
15:08:55.969 0 I copy_address_space done; child = 7:1; trap_stack = [0x7efffffc4, 0x7efffffc8), size 16.000 KiB; pid = 1:2
15:08:56.113 0 D syscall = "set_trap_handler"; dst = 7:1; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFC8000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:56.145 0 I syscall::set_state() done; child = 7:1; pid = 1:2
15:08:56.173 0 I free; slot = Process { pid: 1:2, address_space: "1:2" @ 0p30A1000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 8
15:08:56.181 0 I switch to; address_space = "base" @ 0p1000
15:08:56.184 0 I drop the current address space; address_space = "1:2" @ 0p30A1000; switch_to = "base" @ 0p1000
15:08:56.227 0 I syscall = "exit"; pid = 1:2; code = 0; reason = Some(OK)
15:08:56.233 0 D leaving the user mode; pid = 1:2
15:08:56.236 0 I dequeue; pid = Some(6:2)
15:08:56.239 0 I switch to; address_space = "6:2" @ 0p3027000
15:08:56.242 0 D entering the user mode; pid = 6:2; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFF4FC8, rflags: IF } }
15:08:56.271 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFF4D98, rflags: IF ZF PF }
15:08:56.315 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000F944, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:56.363 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD018, rflags: IF }
15:08:56.413 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:56.462 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AD37, ss:rsp: 0x001B:0v7F7FFFFFBF98, rflags: IF AF }
15:08:56.502 0 D leaving the user mode; pid = 6:2
15:08:56.517 0 I the process was preempted; pid = 6:2; user_context = { mode: user, cs:rip: 0x0023:0v1002AF03, ss:rsp: 0x001B:0v7EFFFFFF4C98, rflags: IF ZF PF }
15:08:56.526 0 I returned
15:08:56.529 0 I dequeue; pid = Some(9:2)
15:08:56.532 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:56.535 0 D entering the user mode; pid = 9:2; registers = { rax: 0xFF, rdi: 0x7F7FFFFFCC78, rsi: 0x100, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9FC8, rflags: IF } }
15:08:56.557 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:56.608 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:56.662 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100305F7, ss:rsp: 0x001B:0v7F7FFFFFAE98, rflags: IF AF }
15:08:56.703 0 D leaving the user mode; pid = 9:2
15:08:56.717 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10011BF9, ss:rsp: 0x001B:0v7EFFFFFE9D28, rflags: IF AF }
15:08:56.725 0 I returned
15:08:56.728 0 I dequeue; pid = Some(2:1)
15:08:56.731 0 I switch to; address_space = "2:1" @ 0p303B000
15:08:56.734 0 D entering the user mode; pid = 2:1; registers = { rax: 0x100585E8, rdi: 0x100585E8, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFE9FC8, rflags: IF } }
15:08:56.757 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:56.811 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AD37, ss:rsp: 0x001B:0v7F7FFFFFBF98, rflags: IF AF }
15:08:56.756 0 I syscall::exofork() done; child = <current>; pid = 2:1
15:08:56.862 0 I just created; child = <current>; pid = 2:1; pid = 2:1
15:08:56.869 0 I name = "cow_fork *21"; pedigree = [5:3, 8:1, 2:1]; len = 3; capacity = 3; pid = 2:1
15:08:56.914 0 I free; slot = Process { pid: 2:1, address_space: "2:1" @ 0p303B000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 7
15:08:56.928 0 I switch to; address_space = "base" @ 0p1000
15:08:56.931 0 I drop the current address space; address_space = "2:1" @ 0p303B000; switch_to = "base" @ 0p1000
15:08:56.979 0 I syscall = "exit"; pid = 2:1; code = 0; reason = Some(OK)
15:08:57.002 0 D leaving the user mode; pid = 2:1
15:08:57.005 0 I dequeue; pid = Some(8:1)
15:08:57.008 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:57.011 0 D entering the user mode; pid = 8:1; registers = { rax: 0x1, rdi: 0x100567E0, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF PF } }
15:08:57.047 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100305F7, ss:rsp: 0x001B:0v7F7FFFFFAE98, rflags: IF AF }
15:08:57.096 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10045DFF, ss:rsp: 0x001B:0v7F7FFFFF9FE8, rflags: IF AF PF }
15:08:57.123 0 D leaving the user mode; pid = 8:1
15:08:57.140 0 I the process was preempted; pid = 8:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF AF PF }
15:08:57.152 0 I returned
15:08:57.155 0 I dequeue; pid = Some(0:11)
15:08:57.158 0 I switch to; address_space = "0:11" @ 0p2F4E000
15:08:57.162 0 D entering the user mode; pid = 0:11; registers = { rax: 0x7F7FFFFFD102, rdi: 0x7E7FFFFFB008, rsi: 0x2, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1FC8, rflags: IF AF } }
15:08:57.190 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AF12, ss:rsp: 0x001B:0v7F7FFFFFBFB8, rflags: IF }
15:08:57.218 0 D leaving the user mode; pid = 0:11
15:08:57.233 0 I the process was preempted; pid = 0:11; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1FC8, rflags: IF }
15:08:57.245 0 I returned
15:08:57.248 0 I dequeue; pid = Some(7:1)
15:08:57.251 0 I switch to; address_space = "7:1" @ 0p3054000
15:08:57.254 0 D entering the user mode; pid = 7:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD588, rflags: IF } }
15:08:57.264 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF }
15:08:57.311 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFC7D98, rflags: IF ZF PF }
15:08:57.340 0 D leaving the user mode; pid = 7:1
15:08:57.354 0 I the process was preempted; pid = 7:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7D60, rflags: IF ZF PF }
15:08:57.373 0 I returned
15:08:57.377 0 I dequeue; pid = Some(6:2)
15:08:57.380 0 I switch to; address_space = "6:2" @ 0p3027000
15:08:57.383 0 D entering the user mode; pid = 6:2; registers = { rax: 0xD00, rdi: 0x7E7FFFFF5000, rsi: 0x7F7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1002AF03, ss:rsp: 0x001B:0v7EFFFFFF4C98, rflags: IF ZF PF } }
15:08:56.427 0 I syscall::exofork() done; child = <current>; pid = 6:2
15:08:57.405 0 I just created; child = <current>; pid = 6:2; pid = 6:2
15:08:57.412 0 I name = "cow_fork *10"; pedigree = [5:3, 9:2, 6:2]; len = 3; capacity = 3; pid = 6:2
15:08:57.458 0 I free; slot = Process { pid: 6:2, address_space: "6:2" @ 0p3027000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 6
15:08:57.472 0 I switch to; address_space = "base" @ 0p1000
15:08:57.475 0 I drop the current address space; address_space = "6:2" @ 0p3027000; switch_to = "base" @ 0p1000
15:08:57.521 0 I syscall = "exit"; pid = 6:2; code = 0; reason = Some(OK)
15:08:57.527 0 D leaving the user mode; pid = 6:2
15:08:57.530 0 I dequeue; pid = Some(9:2)
15:08:57.534 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:57.536 0 D entering the user mode; pid = 9:2; registers = { rax: 0x7EFFFFFE0000, rdi: 0x7EFFFFFE0000, rsi: 0x7F7FFFFFA000, { mode: user, cs:rip: 0x0023:0v10011BF9, ss:rsp: 0x001B:0v7EFFFFFE9D28, rflags: IF AF } }
15:08:57.563 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10045DFF, ss:rsp: 0x001B:0v7F7FFFFF9FE8, rflags: IF AF PF }
15:08:56.622 0 I copy_address_space done; child = 10:0; trap_stack = [0x7efffffe6, 0x7efffffea), size 16.000 KiB; pid = 9:2
15:08:57.645 0 D syscall = "set_trap_handler"; dst = 10:0; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFEA000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:57.683 0 I syscall::set_state() done; child = 10:0; pid = 9:2
15:08:57.720 0 D syscall = "set_trap_handler"; dst = 9:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFDF000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:57.806 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:57.820 0 I duplicate; address_space = "process" @ 0p30AF000
15:08:57.824 0 I switch to; address_space = "process" @ 0p30AF000
15:08:57.838 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:57.853 0 I switch to; address_space = "6:3" @ 0p30AF000
15:08:57.857 0 I allocate; slot = Process { pid: 6:3, address_space: "6:3" @ 0p30AF000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD0C8 } }; process_count = 7
15:08:57.863 0 I syscall = "exofork"; process = 9:2; child = 6:3
15:08:57.870 0 I syscall::exofork() done; child = 6:3; pid = 9:2
15:08:57.966 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBAB8, rflags: IF }
15:08:58.018 0 D leaving the user mode; pid = 9:2
15:08:58.031 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v1000EB6D, ss:rsp: 0x001B:0v7EFFFFFDEB58, rflags: IF ZF PF }
15:08:58.038 0 I returned
15:08:58.041 0 I dequeue; pid = Some(8:1)
15:08:58.044 0 I switch to; address_space = "8:1" @ 0p2CEC000
15:08:58.048 0 D entering the user mode; pid = 8:1; registers = { rax: 0x5, rdi: 0x7F7FFFFFAED0, rsi: 0x3A, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF AF PF } }
15:08:55.800 0 I copy_address_space done; child = 3:1; trap_stack = [0x7efffffdb, 0x7efffffdf), size 16.000 KiB; pid = 8:1
15:08:58.096 0 D syscall = "set_trap_handler"; dst = 3:1; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFDF000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:58.126 0 I syscall::set_state() done; child = 3:1; pid = 8:1
15:08:58.159 0 I free; slot = Process { pid: 8:1, address_space: "8:1" @ 0p2CEC000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 6
15:08:58.171 0 I switch to; address_space = "base" @ 0p1000
15:08:58.174 0 I drop the current address space; address_space = "8:1" @ 0p2CEC000; switch_to = "base" @ 0p1000
15:08:58.219 0 I syscall = "exit"; pid = 8:1; code = 0; reason = Some(OK)
15:08:58.225 0 D leaving the user mode; pid = 8:1
15:08:58.228 0 I dequeue; pid = Some(0:11)
15:08:58.231 0 I switch to; address_space = "0:11" @ 0p2F4E000
15:08:58.234 0 D entering the user mode; pid = 0:11; registers = { rax: 0x51, rdi: 0x7F7FFFFFC0C8, rsi: 0x7F7FFFFFD190, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD1FC8, rflags: IF } }
15:08:55.007 0 I syscall::exofork() done; child = <current>; pid = 0:11
15:08:58.265 0 I just created; child = <current>; pid = 0:11; pid = 0:11
15:08:58.270 0 I name = "cow_fork *01"; pedigree = [5:3, 1:2, 0:11]; len = 3; capacity = 3; pid = 0:11
15:08:58.311 0 I free; slot = Process { pid: 0:11, address_space: "0:11" @ 0p2F4E000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 5
15:08:58.319 0 I switch to; address_space = "base" @ 0p1000
15:08:58.322 0 I drop the current address space; address_space = "0:11" @ 0p2F4E000; switch_to = "base" @ 0p1000
15:08:58.371 0 I syscall = "exit"; pid = 0:11; code = 0; reason = Some(OK)
15:08:58.375 0 D leaving the user mode; pid = 0:11
15:08:58.378 0 I dequeue; pid = Some(7:1)
15:08:58.381 0 I switch to; address_space = "7:1" @ 0p3054000
15:08:58.384 0 D entering the user mode; pid = 7:1; registers = { rax: 0x7EFFFFFC7F18, rdi: 0x7EFFFFFC7DC0, rsi: 0x7EFFFFFC7DE8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7D60, rflags: IF ZF PF } }
15:08:58.411 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD4D8, rflags: IF }
15:08:58.442 0 D leaving the user mode; pid = 7:1
15:08:58.455 0 I the process was preempted; pid = 7:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7FC8, rflags: IF }
15:08:58.464 0 I returned
15:08:58.467 0 I dequeue; pid = Some(10:0)
15:08:58.471 0 I switch to; address_space = "10:0" @ 0p2D70000
15:08:58.475 0 D entering the user mode; pid = 10:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD0C8, rflags: IF AF PF } }
15:08:58.484 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF AF PF }
15:08:58.528 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFE9D98, rflags: IF ZF PF }
15:08:58.578 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000F944, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:58.622 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD018, rflags: IF }
15:08:58.670 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:58.724 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AD37, ss:rsp: 0x001B:0v7F7FFFFFBF98, rflags: IF AF }
15:08:58.668 0 I syscall::exofork() done; child = <current>; pid = 10:0
15:08:58.775 0 I just created; child = <current>; pid = 10:0; pid = 10:0
15:08:58.782 0 I name = "cow_fork *11"; pedigree = [5:3, 9:2, 10:0]; len = 3; capacity = 3; pid = 10:0
15:08:58.828 0 I free; slot = Process { pid: 10:0, address_space: "10:0" @ 0p2D70000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 4
15:08:58.841 0 I switch to; address_space = "base" @ 0p1000
15:08:58.844 0 I drop the current address space; address_space = "10:0" @ 0p2D70000; switch_to = "base" @ 0p1000
15:08:58.892 0 I syscall = "exit"; pid = 10:0; code = 0; reason = Some(OK)
15:08:58.898 0 D leaving the user mode; pid = 10:0
15:08:58.901 0 I dequeue; pid = Some(9:2)
15:08:58.904 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:58.907 0 D entering the user mode; pid = 9:2; registers = { rax: 0x0, rdi: 0x7EFFFFFDEE90, rsi: 0x7EFFFFFDEC58, { mode: user, cs:rip: 0x0023:0v1000EB6D, ss:rsp: 0x001B:0v7EFFFFFDEB58, rflags: IF ZF PF } }
15:08:58.935 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFBCB8, rflags: IF }
15:08:58.983 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAC9, ss:rsp: 0x001B:0v7F7FFFFFCB88, rflags: IF }
15:08:59.002 0 D leaving the user mode; pid = 9:2
15:08:59.016 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10014DD0, ss:rsp: 0x001B:0v7EFFFFFDED10, rflags: IF AF }
15:08:59.034 0 I returned
15:08:59.038 0 I dequeue; pid = Some(3:1)
15:08:59.041 0 I switch to; address_space = "3:1" @ 0p2D9C000
15:08:59.045 0 D entering the user mode; pid = 3:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD0C8, rflags: IF AF } }
15:08:59.054 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF AF }
15:08:59.101 0 D leaving the user mode; pid = 3:1
15:08:59.116 0 I the process was preempted; pid = 3:1; user_context = { mode: user, cs:rip: 0x0023:0v10012000, ss:rsp: 0x001B:0v7EFFFFFDECC0, rflags: IF ZF PF }
15:08:59.127 0 I returned
15:08:59.130 0 I dequeue; pid = Some(7:1)
15:08:59.133 0 I switch to; address_space = "7:1" @ 0p3054000
15:08:59.136 0 D entering the user mode; pid = 7:1; registers = { rax: 0x100585E8, rdi: 0x100585E8, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFC7FC8, rflags: IF } }
15:08:59.159 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:08:59.210 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001B31A, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:08:59.259 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AF12, ss:rsp: 0x001B:0v7F7FFFFFBFB8, rflags: IF }
15:08:59.158 0 I syscall::exofork() done; child = <current>; pid = 7:1
15:08:59.305 0 I just created; child = <current>; pid = 7:1; pid = 7:1
15:08:59.310 0 I name = "cow_fork *02"; pedigree = [5:3, 1:2, 7:1]; len = 3; capacity = 3; pid = 7:1
15:08:59.357 0 I free; slot = Process { pid: 7:1, address_space: "7:1" @ 0p3054000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 3
15:08:59.371 0 I switch to; address_space = "base" @ 0p1000
15:08:59.374 0 I drop the current address space; address_space = "7:1" @ 0p3054000; switch_to = "base" @ 0p1000
15:08:59.423 0 I syscall = "exit"; pid = 7:1; code = 0; reason = Some(OK)
15:08:59.427 0 D leaving the user mode; pid = 7:1
15:08:59.431 0 I dequeue; pid = Some(9:2)
15:08:59.434 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:59.437 0 D entering the user mode; pid = 9:2; registers = { rax: 0x7EFFFFFDED70, rdi: 0x7EFFFFFDED48, rsi: 0x7EFFFFFDED70, { mode: user, cs:rip: 0x0023:0v10014DD0, ss:rsp: 0x001B:0v7EFFFFFDED10, rflags: IF AF } }
15:08:59.466 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF ZF AF PF CF }
15:08:59.511 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:08:59.567 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100305F7, ss:rsp: 0x001B:0v7F7FFFFFAE98, rflags: IF AF }
15:08:59.612 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10045DFF, ss:rsp: 0x001B:0v7F7FFFFF9FE8, rflags: IF AF PF }
15:08:59.510 0 I copy_address_space done; child = 6:3; trap_stack = [0x7efffffdb, 0x7efffffdf), size 16.000 KiB; pid = 9:2
15:08:59.690 0 D syscall = "set_trap_handler"; dst = 6:3; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFDF000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:59.728 0 I syscall::set_state() done; child = 6:3; pid = 9:2
15:08:59.766 0 D syscall = "set_trap_handler"; dst = 9:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFD4000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:08:59.852 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:59.865 0 I duplicate; address_space = "process" @ 0p3088000
15:08:59.869 0 I switch to; address_space = "process" @ 0p3088000
15:08:59.883 0 I switch to; address_space = "9:2" @ 0p308D000
15:08:59.898 0 I switch to; address_space = "7:2" @ 0p3088000
15:08:59.902 0 I allocate; slot = Process { pid: 7:2, address_space: "7:2" @ 0p3088000, { rip: 0v1000A669, rsp: 0v7F7FFFFFD588 } }; process_count = 4
15:08:59.908 0 I syscall = "exofork"; process = 9:2; child = 7:2
15:08:59.915 0 I syscall::exofork() done; child = 7:2; pid = 9:2
15:09:00.032 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v100102A6, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:09:00.086 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10010286, ss:rsp: 0x001B:0v7F7FFFFFBF78, rflags: IF }
15:09:00.118 0 D leaving the user mode; pid = 9:2
15:09:00.132 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v1000FAE0, ss:rsp: 0x001B:0v7EFFFFFD3780, rflags: IF AF PF }
15:09:00.140 0 I returned
15:09:00.143 0 I dequeue; pid = Some(3:1)
15:09:00.146 0 I switch to; address_space = "3:1" @ 0p2D9C000
15:09:00.150 0 D entering the user mode; pid = 3:1; registers = { rax: 0x7EFFFFFDEFE8, rdi: 0x7EFFFFFDEE38, rsi: 0x7F7FFFFFD0D0, { mode: user, cs:rip: 0x0023:0v10012000, ss:rsp: 0x001B:0v7EFFFFFDECC0, rflags: IF ZF PF } }
15:09:00.159 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFDED98, rflags: IF ZF PF }
15:09:00.203 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000F944, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:09:00.232 0 D leaving the user mode; pid = 3:1
15:09:00.249 0 I the process was preempted; pid = 3:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF AF }
15:09:00.261 0 I returned
15:09:00.264 0 I dequeue; pid = Some(6:3)
15:09:00.268 0 I switch to; address_space = "6:3" @ 0p30AF000
15:09:00.271 0 D entering the user mode; pid = 6:3; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD0C8, rflags: IF AF } }
15:09:00.281 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD0D8, rflags: IF AF }
15:09:00.327 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFDED98, rflags: IF ZF PF }
15:09:00.371 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000F944, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:09:00.419 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD018, rflags: IF }
15:09:00.464 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:09:00.516 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AD37, ss:rsp: 0x001B:0v7F7FFFFFBF98, rflags: IF AF }
15:09:00.544 0 D leaving the user mode; pid = 6:3
15:09:00.559 0 I the process was preempted; pid = 6:3; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF AF }
15:09:00.571 0 I returned
15:09:00.574 0 I dequeue; pid = Some(9:2)
15:09:00.577 0 I switch to; address_space = "9:2" @ 0p308D000
15:09:00.581 0 D entering the user mode; pid = 9:2; registers = { rax: 0x0, rdi: 0x7EFFFFFD3818, rsi: 0x10053ED0, { mode: user, cs:rip: 0x0023:0v1000FAE0, ss:rsp: 0x001B:0v7EFFFFFD3780, rflags: IF AF PF } }
15:09:00.605 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000CAB4, ss:rsp: 0x001B:0v7F7FFFFFCB58, rflags: IF ZF PF }
15:09:00.633 0 D leaving the user mode; pid = 9:2
15:09:00.650 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3FC8, rflags: IF ZF PF }
15:09:00.664 0 I returned
15:09:00.667 0 I dequeue; pid = Some(3:1)
15:09:00.671 0 I switch to; address_space = "3:1" @ 0p2D9C000
15:09:00.674 0 D entering the user mode; pid = 3:1; registers = { rax: 0x7E7FFFFFB000, rdi: 0x7F7FFFFFE188, rsi: 0x7F7FFFFFE190, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF AF } }
15:09:00.696 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD018, rflags: IF }
15:09:00.725 0 D leaving the user mode; pid = 3:1
15:09:00.742 0 I the process was preempted; pid = 3:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF }
15:09:00.756 0 I returned
15:09:00.759 0 I dequeue; pid = Some(6:3)
15:09:00.762 0 I switch to; address_space = "6:3" @ 0p30AF000
15:09:00.766 0 D entering the user mode; pid = 6:3; registers = { rax: 0x7F7FFFFFC0CF, rdi: 0x7F7FFFFFC0A8, rsi: 0x7F7FFFFFCCD0, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF AF } }
15:09:00.462 0 I syscall::exofork() done; child = <current>; pid = 6:3
15:09:00.793 0 I just created; child = <current>; pid = 6:3; pid = 6:3
15:09:00.797 0 I name = "cow_fork *12"; pedigree = [5:3, 9:2, 6:3]; len = 3; capacity = 3; pid = 6:3
15:09:00.842 0 I free; slot = Process { pid: 6:3, address_space: "6:3" @ 0p30AF000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 3
15:09:00.856 0 I switch to; address_space = "base" @ 0p1000
15:09:00.859 0 I drop the current address space; address_space = "6:3" @ 0p30AF000; switch_to = "base" @ 0p1000
15:09:00.906 0 I syscall = "exit"; pid = 6:3; code = 0; reason = Some(OK)
15:09:00.912 0 D leaving the user mode; pid = 6:3
15:09:00.915 0 I dequeue; pid = Some(9:2)
15:09:00.918 0 I switch to; address_space = "9:2" @ 0p308D000
15:09:00.921 0 D entering the user mode; pid = 9:2; registers = { rax: 0x7F7FFFFFD450, rdi: 0x7F7FFFFFCC48, rsi: 0x7F7FFFFFCC50, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3FC8, rflags: IF ZF PF } }
15:09:00.950 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000B400, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF ZF AF PF CF }
15:09:00.996 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:09:01.001 0 D leaving the user mode; pid = 9:2
15:09:01.015 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3FC8, rflags: IF PF }
15:09:01.035 0 I returned
15:09:01.038 0 I dequeue; pid = Some(3:1)
15:09:01.041 0 I switch to; address_space = "3:1" @ 0p2D9C000
15:09:01.045 0 D entering the user mode; pid = 3:1; registers = { rax: 0x100585E8, rdi: 0x100585E8, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF } }
15:09:01.067 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFCE00, rflags: IF PF }
15:09:01.096 0 D leaving the user mode; pid = 3:1
15:09:01.113 0 I the process was preempted; pid = 3:1; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF PF }
15:09:01.126 0 I returned
15:09:01.129 0 I dequeue; pid = Some(9:2)
15:09:01.133 0 I switch to; address_space = "9:2" @ 0p308D000
15:09:01.136 0 D entering the user mode; pid = 9:2; registers = { rax: 0x1, rdi: 0x100567E0, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3FC8, rflags: IF PF } }
15:09:01.168 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10033E87, ss:rsp: 0x001B:0v7F7FFFFFAC08, rflags: IF AF }
15:09:01.196 0 D leaving the user mode; pid = 9:2
15:09:01.210 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3FC8, rflags: IF AF }
15:09:01.218 0 I returned
15:09:01.221 0 I dequeue; pid = Some(3:1)
15:09:01.224 0 I switch to; address_space = "3:1" @ 0p2D9C000
15:09:01.228 0 D entering the user mode; pid = 3:1; registers = { rax: 0x1, rdi: 0x100567E0, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFDEFC8, rflags: IF PF } }
15:09:01.255 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AD37, ss:rsp: 0x001B:0v7F7FFFFFBF98, rflags: IF AF }
15:09:01.066 0 I syscall::exofork() done; child = <current>; pid = 3:1
15:09:01.305 0 I just created; child = <current>; pid = 3:1; pid = 3:1
15:09:01.308 0 I name = "cow_fork *22"; pedigree = [5:3, 8:1, 3:1]; len = 3; capacity = 3; pid = 3:1
15:09:01.350 0 I free; slot = Process { pid: 3:1, address_space: "3:1" @ 0p2D9C000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 2
15:09:01.358 0 I switch to; address_space = "base" @ 0p1000
15:09:01.361 0 I drop the current address space; address_space = "3:1" @ 0p2D9C000; switch_to = "base" @ 0p1000
15:09:01.409 0 I syscall = "exit"; pid = 3:1; code = 0; reason = Some(OK)
15:09:01.413 0 D leaving the user mode; pid = 3:1
15:09:01.416 0 I dequeue; pid = Some(9:2)
15:09:01.419 0 I switch to; address_space = "9:2" @ 0p308D000
15:09:01.422 0 D entering the user mode; pid = 9:2; registers = { rax: 0x7F7FFFFFB700, rdi: 0x7F7FFFFFB7F0, rsi: 0x4030000000000000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3FC8, rflags: IF AF } }
15:09:00.965 0 I copy_address_space done; child = 7:2; trap_stack = [0x7efffffd0, 0x7efffffd4), size 16.000 KiB; pid = 9:2
15:09:01.487 0 D leaving the user mode; pid = 9:2
15:09:01.497 0 I the process was preempted; pid = 9:2; user_context = { mode: user, cs:rip: 0x0023:0v1001105F, ss:rsp: 0x001B:0v7F7FFFFFD3A8, rflags: IF AF PF }
15:09:01.504 0 I returned
15:09:01.507 0 I dequeue; pid = Some(9:2)
15:09:01.510 0 I switch to; address_space = "9:2" @ 0p308D000
15:09:01.513 0 D entering the user mode; pid = 9:2; registers = { rax: 0x4000, rdi: 0x7F7FFFFFD3F8, rsi: 0x10053ED0, { mode: user, cs:rip: 0x0023:0v1001105F, ss:rsp: 0x001B:0v7F7FFFFFD3A8, rflags: IF AF PF } }
15:09:01.524 0 D syscall = "set_trap_handler"; dst = 7:2; trap_context = { { rip: 0v10011250, rsp: 0v7EFFFFFD4000 }, stack: [127.000 TiB, 127.000 TiB), size 16.000 KiB }
15:09:01.556 0 I syscall::set_state() done; child = 7:2; pid = 9:2
15:09:01.583 0 I free; slot = Process { pid: 9:2, address_space: "9:2" @ 0p308D000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 1
15:09:01.592 0 I switch to; address_space = "base" @ 0p1000
15:09:01.595 0 I drop the current address space; address_space = "9:2" @ 0p308D000; switch_to = "base" @ 0p1000
15:09:01.638 0 I syscall = "exit"; pid = 9:2; code = 0; reason = Some(OK)
15:09:01.645 0 D leaving the user mode; pid = 9:2
15:09:01.648 0 I dequeue; pid = Some(7:2)
15:09:01.651 0 I switch to; address_space = "7:2" @ 0p3088000
15:09:01.654 0 D entering the user mode; pid = 7:2; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v1000A669, ss:rsp: 0x001B:0v7F7FFFFFD588, rflags: IF AF } }
15:09:01.664 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A66B, ss:rsp: 0x001B:0v7F7FFFFFD598, rflags: IF AF }
15:09:01.692 0 D leaving the user mode; pid = 7:2
15:09:01.706 0 I the process was preempted; pid = 7:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3FC8, rflags: IF AF }
15:09:01.720 0 I returned
15:09:01.729 0 I dequeue; pid = Some(7:2)
15:09:01.733 0 I switch to; address_space = "7:2" @ 0p3088000
15:09:01.737 0 D entering the user mode; pid = 7:2; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3FC8, rflags: IF AF } }
15:09:01.759 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10019EF0, ss:rsp: 0x001B:0v7EFFFFFD3D98, rflags: IF ZF PF }
15:09:01.788 0 D leaving the user mode; pid = 7:2
15:09:01.805 0 I the process was preempted; pid = 7:2; user_context = { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3D60, rflags: IF ZF PF }
15:09:01.819 0 I returned
15:09:01.822 0 I dequeue; pid = Some(7:2)
15:09:01.826 0 I switch to; address_space = "7:2" @ 0p3088000
15:09:01.829 0 D entering the user mode; pid = 7:2; registers = { rax: 0x7EFFFFFD3F18, rdi: 0x7EFFFFFD3DC0, rsi: 0x7EFFFFFD3DE8, { mode: user, cs:rip: 0x0023:0v10011250, ss:rsp: 0x001B:0v7EFFFFFD3D60, rflags: IF ZF PF } }
15:09:01.851 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001D159, ss:rsp: 0x001B:0v7F7FFFFFD4D8, rflags: IF }
15:09:01.903 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10044B41, ss:rsp: 0x001B:0v7F7FFFFFD2C0, rflags: IF PF }
15:09:01.949 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001B31A, ss:rsp: 0x001B:0v7F7FFFFFCFF8, rflags: IF AF }
15:09:02.023 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1001AF12, ss:rsp: 0x001B:0v7F7FFFFFBFB8, rflags: IF }
15:09:01.919 0 I syscall::exofork() done; child = <current>; pid = 7:2
15:09:02.068 0 I just created; child = <current>; pid = 7:2; pid = 7:2
15:09:02.072 0 I name = "cow_fork *12"; pedigree = [5:3, 9:2, 7:2]; len = 3; capacity = 3; pid = 7:2
15:09:02.113 0 I free; slot = Process { pid: 7:2, address_space: "7:2" @ 0p3088000, { rip: 0v1000FE26, rsp: 0v7F7FFFFFEE28 } }; process_count = 0
15:09:02.121 0 I switch to; address_space = "base" @ 0p1000
15:09:02.125 0 I drop the current address space; address_space = "7:2" @ 0p3088000; switch_to = "base" @ 0p1000
15:09:02.174 0 I syscall = "exit"; pid = 7:2; code = 0; reason = Some(OK)
15:09:02.179 0 D leaving the user mode; pid = 7:2
15:09:02.182 0 I dequeue; pid = None
kernel::tests::process::cow_fork------------------- [passed]
```

```console
$ grep 'pedigree' log
15:08:42.027 0 I name = "cow_fork *"; pedigree = [5:3]; len = 1; capacity = 3; pid = 5:3
15:08:43.588 0 I name = "cow_fork *0"; pedigree = [5:3, 1:2]; len = 2; capacity = 3; pid = 1:2
15:08:46.854 0 I name = "cow_fork *00"; pedigree = [5:3, 1:2, 4:2]; len = 3; capacity = 3; pid = 4:2
15:08:48.633 0 I name = "cow_fork *2"; pedigree = [5:3, 8:1]; len = 2; capacity = 3; pid = 8:1
15:08:49.457 0 I name = "cow_fork *1"; pedigree = [5:3, 9:2]; len = 2; capacity = 3; pid = 9:2
15:08:50.833 0 I name = "cow_fork *01"; pedigree = [5:3, 1:2, 0:10]; len = 3; capacity = 3; pid = 0:10
15:08:54.805 0 I name = "cow_fork *02"; pedigree = [5:3, 1:2, 4:3]; len = 3; capacity = 3; pid = 4:3
15:08:55.498 0 I name = "cow_fork *20"; pedigree = [5:3, 8:1, 5:4]; len = 3; capacity = 3; pid = 5:4
15:08:56.869 0 I name = "cow_fork *21"; pedigree = [5:3, 8:1, 2:1]; len = 3; capacity = 3; pid = 2:1
15:08:57.412 0 I name = "cow_fork *10"; pedigree = [5:3, 9:2, 6:2]; len = 3; capacity = 3; pid = 6:2
15:08:58.270 0 I name = "cow_fork *01"; pedigree = [5:3, 1:2, 0:11]; len = 3; capacity = 3; pid = 0:11
15:08:58.782 0 I name = "cow_fork *11"; pedigree = [5:3, 9:2, 10:0]; len = 3; capacity = 3; pid = 10:0
15:08:59.310 0 I name = "cow_fork *02"; pedigree = [5:3, 1:2, 7:1]; len = 3; capacity = 3; pid = 7:1
15:09:00.797 0 I name = "cow_fork *12"; pedigree = [5:3, 9:2, 6:3]; len = 3; capacity = 3; pid = 6:3
15:09:01.308 0 I name = "cow_fork *22"; pedigree = [5:3, 8:1, 3:1]; len = 3; capacity = 3; pid = 3:1
15:09:02.072 0 I name = "cow_fork *12"; pedigree = [5:3, 9:2, 7:2]; len = 3; capacity = 3; pid = 7:2
```


### Ориентировочный объём работ этой части лабораторки

```console
 user/cow_fork/src/main.rs |   77 ++++++++++++++++++++++++++++++++++++++++++++--
 1 file changed, 74 insertions(+), 3 deletions(-)
```
