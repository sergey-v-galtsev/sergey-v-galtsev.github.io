## Eager `fork()`

Системный вызов форк долгое время считался удачной абстракцией.
Но время показало, что у него есть и большое количество недостатков,
см. статью
[A `fork()` in the road](https://www.microsoft.com/en-us/research/uploads/prod/2019/04/fork-hotos19.pdf).
Хотя не стоит воспринимать `fork()` как удачный интерфейс порождения процессов,
его реализация является хорошим упражнением.

Nikka воплощает некоторые идеи [экзоядра](https://en.wikipedia.org/wiki/Exokernel),
поэтому реализовывать `fork()` будем в пространстве пользователя.
Естественно, от ядра потребуется небольшая помощь.
Тем более то, что реализует ядро, пригодится и для других целей.
Например, можно будет реализовать аналог современного системного вызова для порождения процессов ---
[`posix_spawn()`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/posix_spawn.html).
Естественно, также в пространстве пользователя.


### Системный вызов `exofork()`

Реализуйте системный вызов

```rust
fn exofork(process: MutexGuard<Process>) -> Result<SyscallResult>
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Он создаёт копию вызывающего процесса `process` и возвращает его `Pid`.
При этом новый процесс создаётся практически без адресного пространства и не готовый к работе.
Поэтому он, в частности, не ставится в очередь планировщика.

Этот системный вызов использует создание копии системной части адресного пространства процесса `process`,
которое
[вы реализовали ранее](../../lab/book/2-mm-6-address-space-2-translate.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-6--%D1%81%D0%BE%D0%B7%D0%B4%D0%B0%D0%BD%D0%B8%D0%B5-%D0%BF%D0%BE%D0%BB%D0%BD%D0%BE%D0%B9-%D0%BA%D0%BE%D0%BF%D0%B8%D0%B8-%D0%B2%D0%B8%D1%80%D1%82%D1%83%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B3%D0%BE-%D0%BE%D1%82%D0%BE%D0%B1%D1%80%D0%B0%D0%B6%D0%B5%D0%BD%D0%B8%D1%8F).
А вот пользовательскую часть адресного пространства он не копирует.
Этим займётся код на стороне пользователя.

`exofork()` возвращает `Pid::Id` с идентификатором потомка в процессе родителя и константу `Pid::Current` в процессе потомка.


### Системный вызов `set_state()`

Реализуйте системный вызов

```rust
fn set_state(
    process: MutexGuard<Process>,
    dst_pid: usize,
    state: usize,
) -> Result<SyscallResult>
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Он переводит целевой процесс, заданный идентификатором `dst_pid`, в заданное состояние `state`.
И ставит его в очередь планировщика в случае `State::Runnable`.
Не забудьте [проверить права доступа](../../lab/book/5-um-2-memory.html#check_process_permissions) процесса `process` к процессу `dst_pid`.


### Рекурсивное отображение памяти

Для того чтобы в пространстве пользователя процесс мог прочитать собственное отображение страниц адресного пространства,
удобно использовать старый джедайский трюк ---
[рекурсивное отображение памяти](https://os.phil-opp.com/page-tables/#recursive-mapping).

Реализуйте [метод](../../doc/kernel/memory/mapping/struct.Mapping.html#method.make_recursive_mapping)

```rust
fn Mapping::make_recursive_mapping(&mut self) -> Result<usize>
```

в файле [`kernel/src/memory/mapping.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/mapping.rs).
Выберете, например ближе к концу таблицы страниц корневого уровня свободную запись,
которую используйте как рекурсивную.
Сохраните её в поле `Mapping::recursive_mapping` и верните наружу.
Поправьте методы
[`Mapping::duplicate_page_table()`](../../doc/kernel/memory/mapping/struct.Mapping.html#method.duplicate_page_table) и
[`Mapping::drop_page_table()`](../../doc/kernel/memory/mapping/struct.Mapping.html#method.drop_page_table),
чтобы они игнорировали эту запись корневой таблицы страниц.


### Библиотечные функции

В файле [`user/lib/src/memory/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/lib/src/memory/mod.rs) реализуйте вспомогательные функции кода пользователя.


#### `temp_page()`

```rust
fn temp_page() -> Result<Page>
```

Заводит в адресном пространстве страницу памяти для временных нужд.
Использует системный вызов `syscall::map()`, определённый в файле [`user/lib/src/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/lib/src/syscall.rs), реализацию которого в ядре [вы уже написали](../../lab/book/5-um-2-memory.html#map).


#### `copy_page()`

```rust
unsafe fn copy_page(src: Page, dst: Page)
```

Копирует содержимое страницы `src` в страницу `dst` с помощью
[core::ptr::copy_nonoverlapping()](https://doc.rust-lang.org/nightly/core/ptr/fn.copy_nonoverlapping.html).


#### `page_table()`

```rust
fn page_table(address: Virt, level: u32) -> &'static PageTable
```

Пользуясь рекурсивной записью таблицы страниц, узнать номер которой в пространстве пользователя можно методом
`ku::process_info().recursive_mapping()`,
выдаёт ссылку на таблицу страниц заданного уровня `level` для заданного виртуального адреса `address`.


### Основной код пользовательского процесса `eager_fork`

В файле [`user/eager_fork/src/main.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/eager_fork/src/main.rs) пользовательского процесса `eager_fork` реализуйте следующие функции.


#### `copy_page_table()`

```rust
fn copy_page_table(
    child: Pid,
    level: u32,
    virt_addr: Virt,
) -> Result<()>
```

Копирует таблицу страниц уровня `level` для виртуального адреса `virt_addr` из своего адресного пространства в пространство дочернего процесса `child`.
Работает рекурсивно, корень рекурсии запускает функция

```rust
fn copy_address_space(child: Pid) -> Result<()> {
    copy_page_table(child, PAGE_DIRECTORY_LEVEL, Virt::default())
}
```

Проходится по таблице страниц, получая ссылку на неё с помощью
[реализованной вами ранее](../../lab/book/5-um-3-eager-fork.html#page_table)
`lib::memory::page_table()`.
На записях `PageTableEntry`, которые доступны для пользовательского кода, либо рекурсивно спускается на следующий уровень таблицы страниц, либо на листьевом уровне копирует содержимое отображённой страницы.
Адрес отображаемой страницы строит поэтапно на рекурсивных вызовах с помощью аргумента `virt_addr` и номера обрабатываемой записи `PageTableEntry`.

Для копирования страницы в целевой процесс, сначала выделяет временную страницу в собственном адресном пространстве с помощью функции `lib::memory::temp_page()`.
Копирует текущую отображаемую страницу туда с помощью
[реализованной вами ранее](../../lab/book/5-um-3-eager-fork.html#copy_page)
функции `lib::memory::copy_page()`.
Затем, с помощью системных вызовов `syscall::copy_mapping()` и `syscall::unmap()`
передаёт скопированную временную страницу потомку `child`, отображая её в его адресном пространстве
по адресу исходной страницы в своём адресном пространстве.

Запись номер `ku::process_info().recursive_mapping()` корневой таблицы страниц, а также страницы,
предоставляющие пользовательскому процессу информацию о нём, системе и `RingBuffer` для логирования,
нужно проигнорировать.
То есть, страницы для которых `ku::process_info().contains_address()` возвращает `true`.


#### `eager_fork()`

```rust
fn eager_fork() -> Result<bool>
```

Создаёт процесс потомка с помощью
[реализованного вами ранее](../../lab/book/5-um-3-eager-fork.html#%D0%A1%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D0%BD%D1%8B%D0%B9-%D0%B2%D1%8B%D0%B7%D0%BE%D0%B2-exofork)
системного вызова `syscall::exofork()`.
Далее копирует своё адресное пространство в пространство потомка с помощью функции `fn copy_address_space()`.
И запускает потомка системным вызовом `syscall::set_state()`, устанавливая его состояние в `State::Runnable`.
В потомке ничего не делает.
Возвращает `true` в процессе потомка и `false` в процессе родителя.


### Проверьте себя

Теперь должен заработать тест `eager_fork()` в файле [`kernel/src/tests/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/process.rs):

```console
kernel::tests::process::eager_fork--------------------------
15:08:34.830 0 I page allocator init; free_page_count = 33688649728; block = [2.000 TiB, 127.500 TiB), size 125.500 TiB
15:08:34.852 0 I duplicate; address_space = "process" @ 0p30B0000
15:08:34.855 0 I switch to; address_space = "process" @ 0p30B0000
15:08:34.866 0 D extend mapping; block = [0x10000000, 0x10005997), size 22.397 KiB; page_block = [0x10000, 0x10006), size 24.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:34.894 0 D elf loadable program header; file_block = [0x4632f4, 0x468c8b), size 22.397 KiB; memory_block = [0x10000000, 0x10005997), size 22.397 KiB; flags =   R
15:08:34.930 0 D extend mapping; block = [0x10006000, 0x1003a07a), size 208.119 KiB; page_block = [0x10006, 0x1003b), size 212.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:34.938 0 D elf loadable program header; file_block = [0x468c94, 0x49d36e), size 209.713 KiB; memory_block = [0x100059a0, 0x1003a07a), size 209.713 KiB; flags = X R
15:08:34.958 0 D elf loadable program header; file_block = [0x49d374, 0x49d474), size 256 B; memory_block = [0x1003a080, 0x1003a180), size 256 B; flags =  WR
15:08:34.965 0 D extend mapping; block = [0x1003b000, 0x1003d6c8), size 9.695 KiB; page_block = [0x1003b, 0x1003e), size 12.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:34.973 0 D elf loadable program header; file_block = [0x49d474, 0x4a0994), size 13.281 KiB; memory_block = [0x1003a180, 0x1003d6c8), size 13.320 KiB; flags =  WR
15:08:35.003 0 I switch to; address_space = "base" @ 0p1000
15:08:35.018 0 I loaded ELF file; context = { rip: 0v1002C480, rsp: 0v7F7FFFFFF000 }; file_size = 504.703 KiB; process = { pid: <current>, address_space: "process" @ 0p30B0000, { rip: 0v1002C480, rsp: 0v7F7FFFFFF000 } }
15:08:35.031 0 I switch to; address_space = "0:8" @ 0p30B0000
15:08:35.035 0 I allocate; slot = Process { pid: 0:8, address_space: "0:8" @ 0p30B0000, { rip: 0v1002C480, rsp: 0v7F7FFFFFF000 } }; process_count = 1
15:08:35.043 0 I user process page table entry; entry_point = 0v1002C480; frame = Frame(12328 @ 0p3028000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
15:08:35.057 0 D process_frames = 103
15:08:35.067 0 I dequeue; pid = Some(0:8)
15:08:35.071 0 I switch to; address_space = "0:8" @ 0p30B0000
15:08:35.075 0 D entering the user mode; pid = 0:8; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v1002C480, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
15:08:35.087 0 I name = "eager_fork *"; pedigree = [0:8]; len = 1; capacity = 3; pid = 0:8
15:08:35.171 0 I page allocator init; free_page_count = 33554432000; block = [2.000 TiB, 127.000 TiB), size 125.000 TiB
15:08:35.192 0 I duplicate; address_space = "process" @ 0p301F000
15:08:35.203 0 I switch to; address_space = "process" @ 0p301F000
15:08:35.214 0 I switch to; address_space = "0:8" @ 0p30B0000
15:08:35.218 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:35.222 0 I allocate; slot = Process { pid: 1:1, address_space: "1:1" @ 0p301F000, { rip: 0v10009117, rsp: 0v7F7FFFFFDB98 } }; process_count = 2
15:08:35.229 0 I syscall = "exofork"; process = 0:8; child = 1:1
15:08:35.237 0 I syscall::exofork() done; child = 1:1; pid = 0:8
15:08:35.356 0 I syscall::set_state() done; child = 1:1; pid = 0:8
15:08:35.432 0 I page allocator init; free_page_count = 33554432000; block = [2.000 TiB, 127.000 TiB), size 125.000 TiB
15:08:35.447 0 I duplicate; address_space = "process" @ 0p2FFA000
15:08:35.451 0 I switch to; address_space = "process" @ 0p2FFA000
15:08:35.462 0 I switch to; address_space = "0:8" @ 0p30B0000
15:08:35.478 0 I switch to; address_space = "2:0" @ 0p2FFA000
15:08:35.484 0 I allocate; slot = Process { pid: 2:0, address_space: "2:0" @ 0p2FFA000, { rip: 0v10009117, rsp: 0v7F7FFFFFDB98 } }; process_count = 3
15:08:35.490 0 I syscall = "exofork"; process = 0:8; child = 2:0
15:08:35.496 0 I syscall::exofork() done; child = 2:0; pid = 0:8
15:08:35.605 0 I syscall::set_state() done; child = 2:0; pid = 0:8
15:08:35.684 0 I page allocator init; free_page_count = 33554432000; block = [2.000 TiB, 127.000 TiB), size 125.000 TiB
15:08:35.706 0 I duplicate; address_space = "process" @ 0p2F90000
15:08:35.710 0 I switch to; address_space = "process" @ 0p2F90000
15:08:35.721 0 I switch to; address_space = "0:8" @ 0p30B0000
15:08:35.726 0 I switch to; address_space = "3:0" @ 0p2F90000
15:08:35.730 0 I allocate; slot = Process { pid: 3:0, address_space: "3:0" @ 0p2F90000, { rip: 0v10009117, rsp: 0v7F7FFFFFDB98 } }; process_count = 4
15:08:35.736 0 I syscall = "exofork"; process = 0:8; child = 3:0
15:08:35.743 0 I syscall::exofork() done; child = 3:0; pid = 0:8
15:08:35.818 0 D leaving the user mode; pid = 0:8
15:08:35.831 0 I the process was preempted; pid = 0:8; user_context = { mode: user, cs:rip: 0x0023:0v10026673, ss:rsp: 0x001B:0v7F7FFFFFC698, rflags: IF ZF PF }
15:08:35.838 0 I returned
15:08:35.842 0 I dequeue; pid = Some(1:1)
15:08:35.845 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:35.848 0 D entering the user mode; pid = 1:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFDB98, rflags: IF } }
15:08:35.858 0 I syscall::exofork() done; child = <current>; pid = 1:1
15:08:35.864 0 I just created; child = <current>; pid = 1:1; pid = 1:1
15:08:35.867 0 I name = "eager_fork *0"; pedigree = [0:8, 1:1]; len = 2; capacity = 3; pid = 1:1
15:08:35.963 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:35.980 0 I duplicate; address_space = "process" @ 0p2F55000
15:08:35.984 0 I switch to; address_space = "process" @ 0p2F55000
15:08:36.001 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:36.015 0 I switch to; address_space = "4:0" @ 0p2F55000
15:08:36.019 0 I allocate; slot = Process { pid: 4:0, address_space: "4:0" @ 0p2F55000, { rip: 0v10009117, rsp: 0v7F7FFFFFD6D8 } }; process_count = 5
15:08:36.026 0 I syscall = "exofork"; process = 1:1; child = 4:0
15:08:36.032 0 I syscall::exofork() done; child = 4:0; pid = 1:1
15:08:36.118 0 D leaving the user mode; pid = 1:1
15:08:36.131 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v1000FBA0, ss:rsp: 0x001B:0v7F7FFFFFBEE0, rflags: IF AF }
15:08:36.138 0 I returned
15:08:36.142 0 I dequeue; pid = Some(2:0)
15:08:36.145 0 I switch to; address_space = "2:0" @ 0p2FFA000
15:08:36.148 0 D entering the user mode; pid = 2:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFDB98, rflags: IF } }
15:08:36.158 0 I syscall::exofork() done; child = <current>; pid = 2:0
15:08:36.164 0 I just created; child = <current>; pid = 2:0; pid = 2:0
15:08:36.166 0 I name = "eager_fork *1"; pedigree = [0:8, 2:0]; len = 2; capacity = 3; pid = 2:0
15:08:36.263 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:36.280 0 I duplicate; address_space = "process" @ 0p2F0F000
15:08:36.284 0 I switch to; address_space = "process" @ 0p2F0F000
15:08:36.298 0 I switch to; address_space = "2:0" @ 0p2FFA000
15:08:36.313 0 I switch to; address_space = "5:0" @ 0p2F0F000
15:08:36.317 0 I allocate; slot = Process { pid: 5:0, address_space: "5:0" @ 0p2F0F000, { rip: 0v10009117, rsp: 0v7F7FFFFFD6D8 } }; process_count = 6
15:08:36.324 0 I syscall = "exofork"; process = 2:0; child = 5:0
15:08:36.330 0 I syscall::exofork() done; child = 5:0; pid = 2:0
15:08:36.436 0 I syscall::set_state() done; child = 5:0; pid = 2:0
15:08:36.519 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:36.541 0 I duplicate; address_space = "process" @ 0p2EA2000
15:08:36.545 0 I switch to; address_space = "process" @ 0p2EA2000
15:08:36.557 0 I switch to; address_space = "2:0" @ 0p2FFA000
15:08:36.561 0 I switch to; address_space = "6:0" @ 0p2EA2000
15:08:36.565 0 I allocate; slot = Process { pid: 6:0, address_space: "6:0" @ 0p2EA2000, { rip: 0v10009117, rsp: 0v7F7FFFFFD6D8 } }; process_count = 7
15:08:36.572 0 I syscall = "exofork"; process = 2:0; child = 6:0
15:08:36.578 0 I syscall::exofork() done; child = 6:0; pid = 2:0
15:08:36.696 0 I syscall::set_state() done; child = 6:0; pid = 2:0
15:08:36.775 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:36.790 0 I duplicate; address_space = "process" @ 0p2E35000
15:08:36.794 0 I switch to; address_space = "process" @ 0p2E35000
15:08:36.805 0 I switch to; address_space = "2:0" @ 0p2FFA000
15:08:36.822 0 I switch to; address_space = "7:0" @ 0p2E35000
15:08:36.827 0 I allocate; slot = Process { pid: 7:0, address_space: "7:0" @ 0p2E35000, { rip: 0v10009117, rsp: 0v7F7FFFFFD6D8 } }; process_count = 8
15:08:36.833 0 I syscall = "exofork"; process = 2:0; child = 7:0
15:08:36.840 0 I syscall::exofork() done; child = 7:0; pid = 2:0
15:08:36.918 0 D leaving the user mode; pid = 2:0
15:08:36.922 0 I the process was preempted; pid = 2:0; user_context = { mode: user, cs:rip: 0x0023:0v100150A0, ss:rsp: 0x001B:0v7F7FFFFFBFF0, rflags: IF AF }
15:08:36.936 0 I returned
15:08:36.945 0 I dequeue; pid = Some(0:8)
15:08:36.949 0 I switch to; address_space = "0:8" @ 0p30B0000
15:08:36.953 0 D entering the user mode; pid = 0:8; registers = { rax: 0x500, rdi: 0x7F7FFFF33000, rsi: 0x1001D000, { mode: user, cs:rip: 0x0023:0v10026673, ss:rsp: 0x001B:0v7F7FFFFFC698, rflags: IF ZF PF } }
15:08:37.034 0 I syscall::set_state() done; child = 3:0; pid = 0:8
15:08:37.064 0 I free; slot = Process { pid: 0:8, address_space: "0:8" @ 0p30B0000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 7
15:08:37.076 0 I switch to; address_space = "base" @ 0p1000
15:08:37.079 0 I drop the current address space; address_space = "0:8" @ 0p30B0000; switch_to = "base" @ 0p1000
15:08:37.119 0 I syscall = "exit"; pid = 0:8; code = 0; reason = Some(OK)
15:08:37.125 0 D leaving the user mode; pid = 0:8
15:08:37.128 0 I dequeue; pid = Some(1:1)
15:08:37.131 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:37.134 0 D entering the user mode; pid = 1:1; registers = { rax: 0x1, rdi: 0x7F7FFFFFBF40, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v1000FBA0, ss:rsp: 0x001B:0v7F7FFFFFBEE0, rflags: IF AF } }
15:08:37.200 0 I syscall::set_state() done; child = 4:0; pid = 1:1
15:08:37.279 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:37.294 0 I duplicate; address_space = "process" @ 0p3063000
15:08:37.298 0 I switch to; address_space = "process" @ 0p3063000
15:08:37.309 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:37.325 0 I switch to; address_space = "0:9" @ 0p3063000
15:08:37.330 0 I allocate; slot = Process { pid: 0:9, address_space: "0:9" @ 0p3063000, { rip: 0v10009117, rsp: 0v7F7FFFFFD6D8 } }; process_count = 8
15:08:37.336 0 I syscall = "exofork"; process = 1:1; child = 0:9
15:08:37.343 0 I syscall::exofork() done; child = 0:9; pid = 1:1
15:08:37.418 0 D leaving the user mode; pid = 1:1
15:08:37.422 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v10026673, ss:rsp: 0x001B:0v7F7FFFFFC1D8, rflags: IF ZF PF }
15:08:37.436 0 I returned
15:08:37.445 0 I dequeue; pid = Some(5:0)
15:08:37.449 0 I switch to; address_space = "5:0" @ 0p2F0F000
15:08:37.452 0 D entering the user mode; pid = 5:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFD6D8, rflags: IF } }
15:08:37.463 0 I syscall::exofork() done; child = <current>; pid = 5:0
15:08:37.468 0 I just created; child = <current>; pid = 5:0; pid = 5:0
15:08:37.470 0 I name = "eager_fork *10"; pedigree = [0:8, 2:0, 5:0]; len = 3; capacity = 3; pid = 5:0
15:08:37.507 0 I free; slot = Process { pid: 5:0, address_space: "5:0" @ 0p2F0F000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 7
15:08:37.515 0 I switch to; address_space = "base" @ 0p1000
15:08:37.518 0 I drop the current address space; address_space = "5:0" @ 0p2F0F000; switch_to = "base" @ 0p1000
15:08:37.564 0 I syscall = "exit"; pid = 5:0; code = 0; reason = Some(OK)
15:08:37.569 0 D leaving the user mode; pid = 5:0
15:08:37.572 0 I dequeue; pid = Some(6:0)
15:08:37.575 0 I switch to; address_space = "6:0" @ 0p2EA2000
15:08:37.578 0 D entering the user mode; pid = 6:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFD6D8, rflags: IF } }
15:08:37.588 0 I syscall::exofork() done; child = <current>; pid = 6:0
15:08:37.595 0 I just created; child = <current>; pid = 6:0; pid = 6:0
15:08:37.597 0 I name = "eager_fork *11"; pedigree = [0:8, 2:0, 6:0]; len = 3; capacity = 3; pid = 6:0
15:08:37.644 0 I free; slot = Process { pid: 6:0, address_space: "6:0" @ 0p2EA2000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 6
15:08:37.658 0 I switch to; address_space = "base" @ 0p1000
15:08:37.661 0 I drop the current address space; address_space = "6:0" @ 0p2EA2000; switch_to = "base" @ 0p1000
15:08:37.711 0 I syscall = "exit"; pid = 6:0; code = 0; reason = Some(OK)
15:08:37.717 0 D leaving the user mode; pid = 6:0
15:08:37.720 0 I dequeue; pid = Some(2:0)
15:08:37.723 0 I switch to; address_space = "2:0" @ 0p2FFA000
15:08:37.726 0 D entering the user mode; pid = 2:0; registers = { rax: 0x7F7FFFFFC110, rdi: 0x7F7FFFFFC110, rsi: 0x7EFFFFFFBFFF, { mode: user, cs:rip: 0x0023:0v100150A0, ss:rsp: 0x001B:0v7F7FFFFFBFF0, rflags: IF AF } }
15:08:37.790 0 I syscall::set_state() done; child = 7:0; pid = 2:0
15:08:37.871 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:37.886 0 I duplicate; address_space = "process" @ 0p2E99000
15:08:37.890 0 I switch to; address_space = "process" @ 0p2E99000
15:08:37.901 0 I switch to; address_space = "2:0" @ 0p2FFA000
15:08:37.917 0 I switch to; address_space = "6:1" @ 0p2E99000
15:08:37.922 0 I allocate; slot = Process { pid: 6:1, address_space: "6:1" @ 0p2E99000, { rip: 0v10009117, rsp: 0v7F7FFFFFDB98 } }; process_count = 7
15:08:37.928 0 I syscall = "exofork"; process = 2:0; child = 6:1
15:08:37.935 0 I syscall::exofork() done; child = 6:1; pid = 2:0
15:08:38.018 0 D leaving the user mode; pid = 2:0
15:08:38.032 0 I the process was preempted; pid = 2:0; user_context = { mode: user, cs:rip: 0x0023:0v10026673, ss:rsp: 0x001B:0v7F7FFFFFC698, rflags: IF ZF PF }
15:08:38.041 0 I returned
15:08:38.044 0 I dequeue; pid = Some(3:0)
15:08:38.047 0 I switch to; address_space = "3:0" @ 0p2F90000
15:08:38.051 0 D entering the user mode; pid = 3:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFDB98, rflags: IF } }
15:08:38.060 0 I syscall::exofork() done; child = <current>; pid = 3:0
15:08:38.067 0 I just created; child = <current>; pid = 3:0; pid = 3:0
15:08:38.069 0 I name = "eager_fork *2"; pedigree = [0:8, 3:0]; len = 2; capacity = 3; pid = 3:0
15:08:38.163 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:38.184 0 I duplicate; address_space = "process" @ 0p2EA3000
15:08:38.194 0 I switch to; address_space = "process" @ 0p2EA3000
15:08:38.205 0 I switch to; address_space = "3:0" @ 0p2F90000
15:08:38.210 0 I switch to; address_space = "5:1" @ 0p2EA3000
15:08:38.214 0 I allocate; slot = Process { pid: 5:1, address_space: "5:1" @ 0p2EA3000, { rip: 0v10009117, rsp: 0v7F7FFFFFD6D8 } }; process_count = 8
15:08:38.220 0 I syscall = "exofork"; process = 3:0; child = 5:1
15:08:38.226 0 I syscall::exofork() done; child = 5:1; pid = 3:0
15:08:38.345 0 I syscall::set_state() done; child = 5:1; pid = 3:0
15:08:38.424 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:38.439 0 I duplicate; address_space = "process" @ 0p2DAD000
15:08:38.443 0 I switch to; address_space = "process" @ 0p2DAD000
15:08:38.455 0 I switch to; address_space = "3:0" @ 0p2F90000
15:08:38.471 0 I switch to; address_space = "8:0" @ 0p2DAD000
15:08:38.476 0 I allocate; slot = Process { pid: 8:0, address_space: "8:0" @ 0p2DAD000, { rip: 0v10009117, rsp: 0v7F7FFFFFD6D8 } }; process_count = 9
15:08:38.482 0 I syscall = "exofork"; process = 3:0; child = 8:0
15:08:38.489 0 I syscall::exofork() done; child = 8:0; pid = 3:0
15:08:38.598 0 I syscall::set_state() done; child = 8:0; pid = 3:0
15:08:38.681 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:38.703 0 I duplicate; address_space = "process" @ 0p2D40000
15:08:38.707 0 I switch to; address_space = "process" @ 0p2D40000
15:08:38.718 0 I switch to; address_space = "3:0" @ 0p2F90000
15:08:38.722 0 I switch to; address_space = "9:0" @ 0p2D40000
15:08:38.726 0 I allocate; slot = Process { pid: 9:0, address_space: "9:0" @ 0p2D40000, { rip: 0v10009117, rsp: 0v7F7FFFFFD6D8 } }; process_count = 10
15:08:38.732 0 I syscall = "exofork"; process = 3:0; child = 9:0
15:08:38.739 0 I syscall::exofork() done; child = 9:0; pid = 3:0
15:08:38.858 0 I syscall::set_state() done; child = 9:0; pid = 3:0
15:08:38.887 0 I free; slot = Process { pid: 3:0, address_space: "3:0" @ 0p2F90000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 9
15:08:38.899 0 I switch to; address_space = "base" @ 0p1000
15:08:38.902 0 I drop the current address space; address_space = "3:0" @ 0p2F90000; switch_to = "base" @ 0p1000
15:08:38.946 0 I syscall = "exit"; pid = 3:0; code = 0; reason = Some(OK)
15:08:38.953 0 D leaving the user mode; pid = 3:0
15:08:38.956 0 I dequeue; pid = Some(4:0)
15:08:38.960 0 I switch to; address_space = "4:0" @ 0p2F55000
15:08:38.963 0 D entering the user mode; pid = 4:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFD6D8, rflags: IF } }
15:08:38.973 0 I syscall::exofork() done; child = <current>; pid = 4:0
15:08:38.981 0 I just created; child = <current>; pid = 4:0; pid = 4:0
15:08:38.985 0 I name = "eager_fork *00"; pedigree = [0:8, 1:1, 4:0]; len = 3; capacity = 3; pid = 4:0
15:08:39.032 0 I free; slot = Process { pid: 4:0, address_space: "4:0" @ 0p2F55000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 8
15:08:39.046 0 I switch to; address_space = "base" @ 0p1000
15:08:39.050 0 I drop the current address space; address_space = "4:0" @ 0p2F55000; switch_to = "base" @ 0p1000
15:08:39.097 0 I syscall = "exit"; pid = 4:0; code = 0; reason = Some(OK)
15:08:39.101 0 D leaving the user mode; pid = 4:0
15:08:39.104 0 I dequeue; pid = Some(1:1)
15:08:39.107 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:39.110 0 D entering the user mode; pid = 1:1; registers = { rax: 0x0, rdi: 0x7EFFFFF84000, rsi: 0x10029000, { mode: user, cs:rip: 0x0023:0v10026673, ss:rsp: 0x001B:0v7F7FFFFFC1D8, rflags: IF ZF PF } }
15:08:39.173 0 I syscall::set_state() done; child = 0:9; pid = 1:1
15:08:39.252 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:39.267 0 I duplicate; address_space = "process" @ 0p2F48000
15:08:39.271 0 I switch to; address_space = "process" @ 0p2F48000
15:08:39.282 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:39.298 0 I switch to; address_space = "4:1" @ 0p2F48000
15:08:39.303 0 I allocate; slot = Process { pid: 4:1, address_space: "4:1" @ 0p2F48000, { rip: 0v10009117, rsp: 0v7F7FFFFFD6D8 } }; process_count = 9
15:08:39.310 0 I syscall = "exofork"; process = 1:1; child = 4:1
15:08:39.318 0 D leaving the user mode; pid = 1:1
15:08:39.321 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v10013693, ss:rsp: 0x001B:0v7F7FFFFFD4A8, rflags: IF }
15:08:39.327 0 I returned
15:08:39.330 0 I dequeue; pid = Some(7:0)
15:08:39.333 0 I switch to; address_space = "7:0" @ 0p2E35000
15:08:39.336 0 D entering the user mode; pid = 7:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFD6D8, rflags: IF } }
15:08:39.346 0 I syscall::exofork() done; child = <current>; pid = 7:0
15:08:39.354 0 I just created; child = <current>; pid = 7:0; pid = 7:0
15:08:39.357 0 I name = "eager_fork *12"; pedigree = [0:8, 2:0, 7:0]; len = 3; capacity = 3; pid = 7:0
15:08:39.402 0 I free; slot = Process { pid: 7:0, address_space: "7:0" @ 0p2E35000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 8
15:08:39.416 0 I switch to; address_space = "base" @ 0p1000
15:08:39.419 0 I drop the current address space; address_space = "7:0" @ 0p2E35000; switch_to = "base" @ 0p1000
15:08:39.467 0 I syscall = "exit"; pid = 7:0; code = 0; reason = Some(OK)
15:08:39.473 0 D leaving the user mode; pid = 7:0
15:08:39.476 0 I dequeue; pid = Some(2:0)
15:08:39.479 0 I switch to; address_space = "2:0" @ 0p2FFA000
15:08:39.482 0 D entering the user mode; pid = 2:0; registers = { rax: 0x300, rdi: 0x7EFFFFEE5000, rsi: 0x1002E000, { mode: user, cs:rip: 0x0023:0v10026673, ss:rsp: 0x001B:0v7F7FFFFFC698, rflags: IF ZF PF } }
15:08:39.541 0 I syscall::set_state() done; child = 6:1; pid = 2:0
15:08:39.571 0 I free; slot = Process { pid: 2:0, address_space: "2:0" @ 0p2FFA000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 7
15:08:39.583 0 I switch to; address_space = "base" @ 0p1000
15:08:39.586 0 I drop the current address space; address_space = "2:0" @ 0p2FFA000; switch_to = "base" @ 0p1000
15:08:39.631 0 I syscall = "exit"; pid = 2:0; code = 0; reason = Some(OK)
15:08:39.637 0 D leaving the user mode; pid = 2:0
15:08:39.640 0 I dequeue; pid = Some(5:1)
15:08:39.643 0 I switch to; address_space = "5:1" @ 0p2EA3000
15:08:39.646 0 D entering the user mode; pid = 5:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFD6D8, rflags: IF } }
15:08:39.657 0 I syscall::exofork() done; child = <current>; pid = 5:1
15:08:39.666 0 I just created; child = <current>; pid = 5:1; pid = 5:1
15:08:39.669 0 I name = "eager_fork *20"; pedigree = [0:8, 3:0, 5:1]; len = 3; capacity = 3; pid = 5:1
15:08:39.715 0 I free; slot = Process { pid: 5:1, address_space: "5:1" @ 0p2EA3000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 6
15:08:39.728 0 I switch to; address_space = "base" @ 0p1000
15:08:39.732 0 I drop the current address space; address_space = "5:1" @ 0p2EA3000; switch_to = "base" @ 0p1000
15:08:39.780 0 I syscall = "exit"; pid = 5:1; code = 0; reason = Some(OK)
15:08:39.785 0 D leaving the user mode; pid = 5:1
15:08:39.789 0 I dequeue; pid = Some(8:0)
15:08:39.792 0 I switch to; address_space = "8:0" @ 0p2DAD000
15:08:39.795 0 D entering the user mode; pid = 8:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFD6D8, rflags: IF } }
15:08:39.818 0 D leaving the user mode; pid = 8:0
15:08:39.832 0 I the process was preempted; pid = 8:0; user_context = { mode: user, cs:rip: 0x0023:0v100060D9, ss:rsp: 0x001B:0v7F7FFFFFE008, rflags: IF ZF PF }
15:08:39.841 0 I returned
15:08:39.844 0 I dequeue; pid = Some(9:0)
15:08:39.847 0 I switch to; address_space = "9:0" @ 0p2D40000
15:08:39.851 0 D entering the user mode; pid = 9:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFD6D8, rflags: IF } }
15:08:39.861 0 I syscall::exofork() done; child = <current>; pid = 9:0
15:08:39.870 0 I just created; child = <current>; pid = 9:0; pid = 9:0
15:08:39.873 0 I name = "eager_fork *22"; pedigree = [0:8, 3:0, 9:0]; len = 3; capacity = 3; pid = 9:0
15:08:39.918 0 I free; slot = Process { pid: 9:0, address_space: "9:0" @ 0p2D40000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 5
15:08:39.932 0 I switch to; address_space = "base" @ 0p1000
15:08:39.935 0 I drop the current address space; address_space = "9:0" @ 0p2D40000; switch_to = "base" @ 0p1000
15:08:39.983 0 I syscall = "exit"; pid = 9:0; code = 0; reason = Some(OK)
15:08:39.989 0 D leaving the user mode; pid = 9:0
15:08:39.992 0 I dequeue; pid = Some(0:9)
15:08:39.995 0 I switch to; address_space = "0:9" @ 0p3063000
15:08:40.001 0 D entering the user mode; pid = 0:9; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFD6D8, rflags: IF AF } }
15:08:40.018 0 D leaving the user mode; pid = 0:9
15:08:40.032 0 I the process was preempted; pid = 0:9; user_context = { mode: user, cs:rip: 0x0023:0v1001A380, ss:rsp: 0x001B:0v7F7FFFFFC930, rflags: IF AF }
15:08:40.040 0 I returned
15:08:40.043 0 I dequeue; pid = Some(1:1)
15:08:40.046 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:40.050 0 D entering the user mode; pid = 1:1; registers = { rax: 0x2, rdi: 0x7F7FFFFFD58C, rsi: 0x7F7FFFFFD58C, { mode: user, cs:rip: 0x0023:0v10013693, ss:rsp: 0x001B:0v7F7FFFFFD4A8, rflags: IF } }
15:08:39.316 0 I syscall::exofork() done; child = 4:1; pid = 1:1
15:08:40.166 0 I syscall::set_state() done; child = 4:1; pid = 1:1
15:08:40.247 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:40.270 0 I duplicate; address_space = "process" @ 0p2D05000
15:08:40.274 0 I switch to; address_space = "process" @ 0p2D05000
15:08:40.285 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:40.289 0 I switch to; address_space = "9:1" @ 0p2D05000
15:08:40.293 0 I allocate; slot = Process { pid: 9:1, address_space: "9:1" @ 0p2D05000, { rip: 0v10009117, rsp: 0v7F7FFFFFDB98 } }; process_count = 6
15:08:40.299 0 I syscall = "exofork"; process = 1:1; child = 9:1
15:08:40.305 0 I syscall::exofork() done; child = 9:1; pid = 1:1
15:08:40.423 0 I syscall::set_state() done; child = 9:1; pid = 1:1
15:08:40.503 0 I page allocator init; free_page_count = 33420214272; block = [2.000 TiB, 126.500 TiB), size 124.500 TiB
15:08:40.518 0 I duplicate; address_space = "process" @ 0p2EC9000
15:08:40.522 0 I switch to; address_space = "process" @ 0p2EC9000
15:08:40.533 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:40.549 0 I switch to; address_space = "5:2" @ 0p2EC9000
15:08:40.555 0 I allocate; slot = Process { pid: 5:2, address_space: "5:2" @ 0p2EC9000, { rip: 0v10009117, rsp: 0v7F7FFFFFDB98 } }; process_count = 7
15:08:40.561 0 I syscall = "exofork"; process = 1:1; child = 5:2
15:08:40.568 0 I syscall::exofork() done; child = 5:2; pid = 1:1
15:08:40.618 0 D leaving the user mode; pid = 1:1
15:08:40.622 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v1000FBD2, ss:rsp: 0x001B:0v7F7FFFFFC568, rflags: IF }
15:08:40.635 0 I returned
15:08:40.644 0 I dequeue; pid = Some(6:1)
15:08:40.648 0 I switch to; address_space = "6:1" @ 0p2E99000
15:08:40.652 0 D entering the user mode; pid = 6:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFDB98, rflags: IF AF } }
15:08:40.662 0 I syscall::exofork() done; child = <current>; pid = 6:1
15:08:40.667 0 I just created; child = <current>; pid = 6:1; pid = 6:1
15:08:40.669 0 I name = "eager_fork *12"; pedigree = [0:8, 2:0, 6:1]; len = 3; capacity = 3; pid = 6:1
15:08:40.706 0 I free; slot = Process { pid: 6:1, address_space: "6:1" @ 0p2E99000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 6
15:08:40.714 0 I switch to; address_space = "base" @ 0p1000
15:08:40.718 0 I drop the current address space; address_space = "6:1" @ 0p2E99000; switch_to = "base" @ 0p1000
15:08:40.764 0 I syscall = "exit"; pid = 6:1; code = 0; reason = Some(OK)
15:08:40.768 0 D leaving the user mode; pid = 6:1
15:08:40.771 0 I dequeue; pid = Some(8:0)
15:08:40.774 0 I switch to; address_space = "8:0" @ 0p2DAD000
15:08:40.777 0 D entering the user mode; pid = 8:0; registers = { rax: 0x0, rdi: 0x7F7FFFFFEF58, rsi: 0x80001, { mode: user, cs:rip: 0x0023:0v100060D9, ss:rsp: 0x001B:0v7F7FFFFFE008, rflags: IF ZF PF } }
15:08:39.805 0 I syscall::exofork() done; child = <current>; pid = 8:0
15:08:39.813 0 I just created; child = <current>; pid = 8:0; pid = 8:0
15:08:40.786 0 I name = "eager_fork *21"; pedigree = [0:8, 3:0, 8:0]; len = 3; capacity = 3; pid = 8:0
15:08:40.831 0 I free; slot = Process { pid: 8:0, address_space: "8:0" @ 0p2DAD000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 5
15:08:40.844 0 I switch to; address_space = "base" @ 0p1000
15:08:40.854 0 I drop the current address space; address_space = "8:0" @ 0p2DAD000; switch_to = "base" @ 0p1000
15:08:40.900 0 I syscall = "exit"; pid = 8:0; code = 0; reason = Some(OK)
15:08:40.906 0 D leaving the user mode; pid = 8:0
15:08:40.909 0 I dequeue; pid = Some(0:9)
15:08:40.913 0 I switch to; address_space = "0:9" @ 0p3063000
15:08:40.916 0 D entering the user mode; pid = 0:9; registers = { rax: 0x1003B0F0, rdi: 0x7F7FFFFFD2E0, rsi: 0x10001909, { mode: user, cs:rip: 0x0023:0v1001A380, ss:rsp: 0x001B:0v7F7FFFFFC930, rflags: IF AF } }
15:08:40.010 0 I syscall::exofork() done; child = <current>; pid = 0:9
15:08:40.928 0 I just created; child = <current>; pid = 0:9; pid = 0:9
15:08:40.932 0 I name = "eager_fork *01"; pedigree = [0:8, 1:1, 0:9]; len = 3; capacity = 3; pid = 0:9
15:08:40.971 0 I free; slot = Process { pid: 0:9, address_space: "0:9" @ 0p3063000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 4
15:08:40.979 0 I switch to; address_space = "base" @ 0p1000
15:08:40.982 0 I drop the current address space; address_space = "0:9" @ 0p3063000; switch_to = "base" @ 0p1000
15:08:41.031 0 I syscall = "exit"; pid = 0:9; code = 0; reason = Some(OK)
15:08:41.038 0 D leaving the user mode; pid = 0:9
15:08:41.050 0 I dequeue; pid = Some(4:1)
15:08:41.054 0 I switch to; address_space = "4:1" @ 0p2F48000
15:08:41.058 0 D entering the user mode; pid = 4:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFD6D8, rflags: IF ZF PF } }
15:08:41.069 0 I syscall::exofork() done; child = <current>; pid = 4:1
15:08:41.074 0 I just created; child = <current>; pid = 4:1; pid = 4:1
15:08:41.076 0 I name = "eager_fork *02"; pedigree = [0:8, 1:1, 4:1]; len = 3; capacity = 3; pid = 4:1
15:08:41.113 0 I free; slot = Process { pid: 4:1, address_space: "4:1" @ 0p2F48000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 3
15:08:41.122 0 I switch to; address_space = "base" @ 0p1000
15:08:41.125 0 I drop the current address space; address_space = "4:1" @ 0p2F48000; switch_to = "base" @ 0p1000
15:08:41.172 0 I syscall = "exit"; pid = 4:1; code = 0; reason = Some(OK)
15:08:41.177 0 D leaving the user mode; pid = 4:1
15:08:41.180 0 I dequeue; pid = Some(9:1)
15:08:41.183 0 I switch to; address_space = "9:1" @ 0p2D05000
15:08:41.186 0 D entering the user mode; pid = 9:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFDB98, rflags: IF } }
15:08:41.196 0 I syscall::exofork() done; child = <current>; pid = 9:1
15:08:41.203 0 I just created; child = <current>; pid = 9:1; pid = 9:1
15:08:41.206 0 I name = "eager_fork *01"; pedigree = [0:8, 1:1, 9:1]; len = 3; capacity = 3; pid = 9:1
15:08:41.251 0 I free; slot = Process { pid: 9:1, address_space: "9:1" @ 0p2D05000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 2
15:08:41.265 0 I switch to; address_space = "base" @ 0p1000
15:08:41.268 0 I drop the current address space; address_space = "9:1" @ 0p2D05000; switch_to = "base" @ 0p1000
15:08:41.315 0 I syscall = "exit"; pid = 9:1; code = 0; reason = Some(OK)
15:08:41.320 0 D leaving the user mode; pid = 9:1
15:08:41.324 0 I dequeue; pid = Some(1:1)
15:08:41.327 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:41.330 0 D entering the user mode; pid = 1:1; registers = { rax: 0x1, rdi: 0x7F7FFFFFC628, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v1000FBD2, ss:rsp: 0x001B:0v7F7FFFFFC568, rflags: IF } }
15:08:41.418 0 D leaving the user mode; pid = 1:1
15:08:41.431 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v1003588E, ss:rsp: 0x001B:0v7F7FFFFFD188, rflags: IF AF }
15:08:41.439 0 I returned
15:08:41.442 0 I dequeue; pid = Some(1:1)
15:08:41.445 0 I switch to; address_space = "1:1" @ 0p301F000
15:08:41.450 0 D entering the user mode; pid = 1:1; registers = { rax: 0x0, rdi: 0x7F7FFFFFD280, rsi: 0x7F7FFFFFD288, { mode: user, cs:rip: 0x0023:0v1003588E, ss:rsp: 0x001B:0v7F7FFFFFD188, rflags: IF AF } }
15:08:41.479 0 I syscall::set_state() done; child = 5:2; pid = 1:1
15:08:41.500 0 I free; slot = Process { pid: 1:1, address_space: "1:1" @ 0p301F000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 1
15:08:41.514 0 I switch to; address_space = "base" @ 0p1000
15:08:41.517 0 I drop the current address space; address_space = "1:1" @ 0p301F000; switch_to = "base" @ 0p1000
15:08:41.561 0 I syscall = "exit"; pid = 1:1; code = 0; reason = Some(OK)
15:08:41.567 0 D leaving the user mode; pid = 1:1
15:08:41.570 0 I dequeue; pid = Some(5:2)
15:08:41.573 0 I switch to; address_space = "5:2" @ 0p2EC9000
15:08:41.576 0 D entering the user mode; pid = 5:2; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009117, ss:rsp: 0x001B:0v7F7FFFFFDB98, rflags: IF } }
15:08:41.586 0 I syscall::exofork() done; child = <current>; pid = 5:2
15:08:41.595 0 I just created; child = <current>; pid = 5:2; pid = 5:2
15:08:41.598 0 I name = "eager_fork *02"; pedigree = [0:8, 1:1, 5:2]; len = 3; capacity = 3; pid = 5:2
15:08:41.644 0 I free; slot = Process { pid: 5:2, address_space: "5:2" @ 0p2EC9000, { rip: 0v1000CBA6, rsp: 0v7F7FFFFFEE28 } }; process_count = 0
15:08:41.658 0 I switch to; address_space = "base" @ 0p1000
15:08:41.661 0 I drop the current address space; address_space = "5:2" @ 0p2EC9000; switch_to = "base" @ 0p1000
15:08:41.711 0 I syscall = "exit"; pid = 5:2; code = 0; reason = Some(OK)
15:08:41.717 0 D leaving the user mode; pid = 5:2
15:08:41.720 0 I dequeue; pid = None
kernel::tests::process::eager_fork----------------- [passed]
```

В этом запуске видно, что корневым явился процесс с идентификатором `0:8`:

```console
$ grep 'pedigree' log
15:08:35.087 0 I name = "eager_fork *"; pedigree = [0:8]; len = 1; capacity = 3; pid = 0:8
15:08:35.867 0 I name = "eager_fork *0"; pedigree = [0:8, 1:1]; len = 2; capacity = 3; pid = 1:1
15:08:36.166 0 I name = "eager_fork *1"; pedigree = [0:8, 2:0]; len = 2; capacity = 3; pid = 2:0
15:08:37.470 0 I name = "eager_fork *10"; pedigree = [0:8, 2:0, 5:0]; len = 3; capacity = 3; pid = 5:0
15:08:37.597 0 I name = "eager_fork *11"; pedigree = [0:8, 2:0, 6:0]; len = 3; capacity = 3; pid = 6:0
15:08:38.069 0 I name = "eager_fork *2"; pedigree = [0:8, 3:0]; len = 2; capacity = 3; pid = 3:0
15:08:38.985 0 I name = "eager_fork *00"; pedigree = [0:8, 1:1, 4:0]; len = 3; capacity = 3; pid = 4:0
15:08:39.357 0 I name = "eager_fork *12"; pedigree = [0:8, 2:0, 7:0]; len = 3; capacity = 3; pid = 7:0
15:08:39.669 0 I name = "eager_fork *20"; pedigree = [0:8, 3:0, 5:1]; len = 3; capacity = 3; pid = 5:1
15:08:39.873 0 I name = "eager_fork *22"; pedigree = [0:8, 3:0, 9:0]; len = 3; capacity = 3; pid = 9:0
15:08:40.669 0 I name = "eager_fork *12"; pedigree = [0:8, 2:0, 6:1]; len = 3; capacity = 3; pid = 6:1
15:08:40.786 0 I name = "eager_fork *21"; pedigree = [0:8, 3:0, 8:0]; len = 3; capacity = 3; pid = 8:0
15:08:40.932 0 I name = "eager_fork *01"; pedigree = [0:8, 1:1, 0:9]; len = 3; capacity = 3; pid = 0:9
15:08:41.076 0 I name = "eager_fork *02"; pedigree = [0:8, 1:1, 4:1]; len = 3; capacity = 3; pid = 4:1
15:08:41.206 0 I name = "eager_fork *01"; pedigree = [0:8, 1:1, 9:1]; len = 3; capacity = 3; pid = 9:1
15:08:41.598 0 I name = "eager_fork *02"; pedigree = [0:8, 1:1, 5:2]; len = 3; capacity = 3; pid = 5:2
```

Он запустил трёх потомков --- `1:1`, `2:0` и `3:0`.
А, например, родословная процесса `9:0` --- `pedigree = [0:8, 3:0, 9:0]`.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/memory/mapping.rs  |   21 +++++++++++++++++-
 kernel/src/process/syscall.rs |   23 ++++++++++++++++++-
 user/eager_fork/src/main.rs   |   49 ++++++++++++++++++++++++++++++++++++++++--
 user/lib/src/memory/mod.rs    |   31 ++++++++++++++++++++++++--
 4 files changed, 116 insertions(+), 8 deletions(-)
```
