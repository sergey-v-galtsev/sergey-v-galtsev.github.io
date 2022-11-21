## Системные вызовы для работы с виртуальной памятью

Добавим новые системные вызовы в файл [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Эти системные вызовы будут принимать идентификатор `Pid` целевого процесса.
То есть они будут позволять вызывающему процессу выполнить действие как над самим собой, задав `Pid::Current` или явно собственный идентификатор `Pid::Id`.
Так и над другим процессом, указав его `Pid::Id`.


### Валидация аргументов

Реализуйте функции валидации аргументов системных вызовов.


#### `check_block()`

```rust
fn check_block(
    address: usize,
    size: usize,
) -> Result<Block<Page>>
```

Проверяет, что `address` и `size` задают корректно выровненный диапазон страниц, целиком лежащий внутри одной из
[двух непрерывных половин](../../lab/book/2-mm-1-types.html#%D0%94%D0%B2%D0%B5-%D0%BF%D0%BE%D0%BB%D0%BE%D0%B2%D0%B8%D0%BD%D1%8B-%D0%B2%D0%B8%D1%80%D1%82%D1%83%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B3%D0%BE-%D0%B0%D0%B4%D1%80%D0%B5%D1%81%D0%BD%D0%BE%D0%B3%D0%BE-%D0%BF%D1%80%D0%BE%D1%81%D1%82%D1%80%D0%B0%D0%BD%D1%81%D1%82%D0%B2%D0%B0)
адресного пространства.


#### `check_page()`

```rust
fn check_page(address: usize) -> Result<Page>
```

Проверяет, что адрес выровнен на границу страниц и возвращает соответствующую виртуальную страницу.


#### `check_page_flags()`

```rust
fn check_page_flags(flags: usize) -> Result<PageTableFlags>
```

Проверяет, что `flags` задаёт валидный набор флагов отображения страниц, в котором обязательно должны быть включены флаги присутствия страницы в памяти и разрешения доступа со стороны кода пользователя.


#### `check_frame()`

```rust
fn check_frame(
    process: &mut MutexGuard<Process>,
    page: Page,
    flags: PageTableFlags,
) -> Result<Frame>
```

Проверяет, что заданная виртуальная страница `page` отображена в адресное пространство процесса `process` с корректно заданными флагами `flags` и возвращает физический фрейм, в который она отображена.
Используйте предыдущую проверку флагов.


#### `check_process_permissions()`

```rust
fn check_process_permissions(
    process: MutexGuard<Process>,
    dst_pid: usize,
) -> Result<MutexGuard<Process>>
```

Проверяет, что процесс `process` имеет право модифицировать целевой процесс, заданный своим идентификатором `dst_pid`.
Модифицировать можно либо самого себя, задавая `Pid::Current` или явно собственный идентификатор `Pid::Id`.
Либо свой непосредственно дочерний процесс, задавая его идентификатор.
Поглотите блокировку `process`, выдав взамен блокировку на целевой процесс.
Если он совпадает с `process` необходимо избежать
[взаимоблокировку](https://en.wikipedia.org/wiki/Deadlock)
себя же.
Вам пригодится метод `Pid::from_usize()`.


### Системные вызовы для работы с памятью

Используя написанные вспомогательные функции реализуйте системные вызовы.


#### `map()`

```rust
fn map(
    process: MutexGuard<Process>,
    dst_pid: usize,
    dst_address: usize,
    dst_size: usize,
    flags: usize,
) -> Result<SyscallResult>
```

Отображает в памяти процесса, заданного `dst_pid`, блок страниц размера `dst_size` байт начиная с виртуального адреса `dst_address` с флагами доступа `flags`.
Если `dst_address` равен нулю, ядро само выбирает свободный участок адресного пространства размера `dst_size`.


### `unmap()`

```rust
fn unmap(
    process: MutexGuard<Process>,
    dst_pid: usize,
    dst_address: usize,
    dst_size: usize,
) -> Result<SyscallResult>
```

Выполняет противоположную `map()` операцию --- удаляет заданный диапазон из виртуальной памяти целевого процесса.


### `copy_mapping()`

```rust
fn copy_mapping(
    process: MutexGuard<Process>,
    dst_pid: usize,
    src_address: usize,
    dst_address: usize,
    dst_size: usize,
    flags: usize,
) -> Result<SyscallResult>
```

Создаёт копию отображения виртуальной памяти из вызывающего процесса в процесс, заданный `dst_pid`.
Исходный диапазон начинается с виртуального адреса `src_address`, целевой --- с виртуального адреса `dst_address`.
Размер диапазона --- `dst_size` байт.
В целевом процессе диапазон должен быть отображён с флагами `flags`.
Естественно, `copy_mapping()` не должен допускать целевое отображение с более широким набором флагов, чем исходное.
После его выполнения у процессов появляется область [разделяемой памяти](https://en.wikipedia.org/wiki/Shared_memory).


### Проверьте себя

Теперь должены заработать тесты `map_syscall_group()` и `user_space_memory_allocator()` в файле
[`kernel/src/tests/5-um-2-memory-allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/5-um-2-memory-allocator.rs):

```console
$ (cd kernel; cargo test --test 5-um-2-memory-allocator)
...
5_um_2_memory_allocator::map_syscall_group------------------
18:00:18 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
18:00:18 0 I duplicate; address_space = "process" @ 0p7E0A000
18:00:18 0 I switch to; address_space = "process" @ 0p7E0A000
18:00:18 0 D extend mapping; block = [0v10000000, 0v10008C5C), size 35.090 KiB; page_block = [0v10000000, 0v10009000), size 36.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:00:18 0 D elf loadable program header; file_block = [0v201FC8, 0v20AC24), size 35.090 KiB; memory_block = [0v10000000, 0v10008C5C), size 35.090 KiB; flags =   R
18:00:18 0 D extend mapping; block = [0v10009000, 0v1006679D), size 373.903 KiB; page_block = [0v10009000, 0v10067000), size 376.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:00:18 0 D elf loadable program header; file_block = [0v20AC28, 0v268765), size 374.810 KiB; memory_block = [0v10008C60, 0v1006679D), size 374.810 KiB; flags = X R
18:00:18 0 D elf loadable program header; file_block = [0v268768, 0v268880), size 280 B; memory_block = [0v100667A0, 0v100668B8), size 280 B; flags =  WR
18:00:18 0 D extend mapping; block = [0v10067000, 0v1006E240), size 28.562 KiB; page_block = [0v10067000, 0v1006F000), size 32.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:00:18 0 D elf loadable program header; file_block = [0v268880, 0v270198), size 30.273 KiB; memory_block = [0v100668B8, 0v1006E240), size 30.383 KiB; flags =  WR
18:00:18 0 I switch to; address_space = "base" @ 0p1000
18:00:18 0 I loaded ELF file; context = { rip: 0v1000FE40, rsp: 0v7F7FFFFFF000 }; file_size = 5.765 MiB; process = { pid: <current>, address_space: "process" @ 0p7E0A000, { rip: 0v1000FE40, rsp: 0v7F7FFFFFF000 } }
18:00:18 0 I user process page table entry; entry_point = 0v1000FE40; frame = Frame(32229 @ 0p7DE5000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
18:00:18 0 D process_frames = 169
18:00:18 0 I switch to; address_space = "0:0" @ 0p7E0A000
18:00:18 0 I switch to; address_space = "base" @ 0p1000
18:00:18 0 I drop the current address space; address_space = "0:0" @ 0p7E0A000; switch_to = "base" @ 0p1000
5_um_2_memory_allocator::map_syscall_group--------- [passed]

5_um_2_memory_allocator::user_space_memory_allocator--------
18:00:19.047 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
18:00:19.057 0 I duplicate; address_space = "process" @ 0p7E0A000
18:00:19.063 0 I switch to; address_space = "process" @ 0p7E0A000
18:00:19.071 0 D extend mapping; block = [0v10000000, 0v10008C5C), size 35.090 KiB; page_block = [0v10000000, 0v10009000), size 36.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:00:19.085 0 D elf loadable program header; file_block = [0v201FC8, 0v20AC24), size 35.090 KiB; memory_block = [0v10000000, 0v10008C5C), size 35.090 KiB; flags =   R
18:00:19.125 0 D extend mapping; block = [0v10009000, 0v1006679D), size 373.903 KiB; page_block = [0v10009000, 0v10067000), size 376.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:00:19.139 0 D elf loadable program header; file_block = [0v20AC28, 0v268765), size 374.810 KiB; memory_block = [0v10008C60, 0v1006679D), size 374.810 KiB; flags = X R
18:00:19.169 0 D elf loadable program header; file_block = [0v268768, 0v268880), size 280 B; memory_block = [0v100667A0, 0v100668B8), size 280 B; flags =  WR
18:00:19.181 0 D extend mapping; block = [0v10067000, 0v1006E240), size 28.562 KiB; page_block = [0v10067000, 0v1006F000), size 32.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:00:19.195 0 D elf loadable program header; file_block = [0v268880, 0v270198), size 30.273 KiB; memory_block = [0v100668B8, 0v1006E240), size 30.383 KiB; flags =  WR
18:00:19.223 0 I switch to; address_space = "base" @ 0p1000
18:00:19.229 0 I loaded ELF file; context = { rip: 0v1000FE40, rsp: 0v7F7FFFFFF000 }; file_size = 5.765 MiB; process = { pid: <current>, address_space: "process" @ 0p7E0A000, { rip: 0v1000FE40, rsp: 0v7F7FFFFFF000 } }
18:00:19.245 0 I allocate; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E0A000, { rip: 0v1000FE40, rsp: 0v7F7FFFFFF000 } }; process_count = 1
18:00:19.255 0 I user process page table entry; entry_point = 0v1000FE40; frame = Frame(32123 @ 0p7D7B000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
18:00:19.269 0 D process_frames = 169
18:00:19.275 0 I dequeue; pid = Some(0:0)
18:00:19.281 0 I switch to; address_space = "0:0" @ 0p7E0A000
18:00:19.287 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFDB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v1000FE40, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
18:00:19.305 0 I test_case = "basic"; pid = 0:0
18:00:19.313 0 D start_info = { allocations: 0 - 0 = 0, requested: 0 B - 0 B = 0 B, allocated: 0 B - 0 B = 0 B, pages: 0 - 0 = 0, loss: 0 B = 0.000% }; pid = 0:0
18:00:19.355 0 D box_contents = 2; pid = 0:0
18:00:19.355 0 D info = { allocations: 1 - 0 = 1, requested: 4.000 KiB - 0 B = 4.000 KiB, allocated: 4.000 KiB - 0 B = 4.000 KiB, pages: 1 - 0 = 1, loss: 0 B = 0.000% }; pid = 0:0
18:00:19.363 0 D info_diff = { allocations: 1 - 0 = 1, requested: 4.000 KiB - 0 B = 4.000 KiB, allocated: 4.000 KiB - 0 B = 4.000 KiB, pages: 1 - 0 = 1, loss: 0 B = 0.000% }; pid = 0:0
18:00:19.403 0 D end_info = { allocations: 1 - 1 = 0, requested: 4.000 KiB - 4.000 KiB = 0 B, allocated: 4.000 KiB - 4.000 KiB = 0 B, pages: 1 - 1 = 0, loss: 0 B = 0.000% }; pid = 0:0
18:00:19.405 0 D end_info_diff = { allocations: 1 - 1 = 0, requested: 4.000 KiB - 4.000 KiB = 0 B, allocated: 4.000 KiB - 4.000 KiB = 0 B, pages: 1 - 1 = 0, loss: 0 B = 0.000% }; pid = 0:0
18:00:19.407 0 I test_case = "grow_and_shrink"; pid = 0:0
18:00:19.409 0 D start_info = { allocations: 1 - 1 = 0, requested: 4.000 KiB - 4.000 KiB = 0 B, allocated: 4.000 KiB - 4.000 KiB = 0 B, pages: 1 - 1 = 0, loss: 0 B = 0.000% }; pid = 0:0
18:00:19.481 0 D leaving the user mode; pid = 0:0
18:00:19.487 0 I the process was preempted; pid = 0:0; user_context = { mode: user, cs:rip: 0x0023:0v1000DFE3, ss:rsp: 0x001B:0v7F7FFFFFDB58, rflags: IF }
18:00:19.497 0 I returned
18:00:19.501 0 I dequeue; pid = Some(0:0)
18:00:19.505 0 I switch to; address_space = "0:0" @ 0p7E0A000
18:00:19.511 0 D entering the user mode; pid = 0:0; registers = { rax: 0x1, rdi: 0x7F7FFFFFDF20, rsi: 0x2455, { mode: user, cs:rip: 0x0023:0v1000DFE3, ss:rsp: 0x001B:0v7F7FFFFFDB58, rflags: IF } }
18:00:19.533 0 D contents_sum = 75491328; push_sum = 75491328; pid = 0:0
18:00:19.535 0 D info = { allocations: 7 - 6 = 1, requested: 256.000 KiB - 128.000 KiB = 128.000 KiB, allocated: 256.000 KiB - 128.000 KiB = 128.000 KiB, pages: 64 - 32 = 32, loss: 0 B = 0.000% }; pid = 0:0
18:00:19.537 0 D info_diff = { allocations: 6 - 5 = 1, requested: 252.000 KiB - 124.000 KiB = 128.000 KiB, allocated: 252.000 KiB - 124.000 KiB = 128.000 KiB, pages: 63 - 31 = 32, loss: 0 B = 0.000% }; pid = 0:0
18:00:19.589 0 D contents_sum = 75491328; pop_sum = 75491328; pid = 0:0
18:00:19.591 0 D end_info = { allocations: 12 - 12 = 0, requested: 380.000 KiB - 380.000 KiB = 0 B, allocated: 380.000 KiB - 380.000 KiB = 0 B, pages: 95 - 95 = 0, loss: 0 B = 0.000% }; pid = 0:0
18:00:19.615 0 I free; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E0A000, { rip: 0v1000DFE3, rsp: 0v7F7FFFFFDB58 } }; process_count = 0
18:00:19.625 0 I switch to; address_space = "base" @ 0p1000
18:00:19.629 0 I drop the current address space; address_space = "0:0" @ 0p7E0A000; switch_to = "base" @ 0p1000
18:00:19.687 0 I syscall = "exit"; pid = 0:0; code = 0; reason = Some(OK)
18:00:19.693 0 D leaving the user mode; pid = 0:0
18:00:19.697 0 I dequeue; pid = None
5_um_2_memory_allocator::user_space_memory_allocator [passed]
18:00:19.707 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/syscall.rs |  123 +++++++++++++++++++++++++++++++++++++++---
 1 file changed, 115 insertions(+), 8 deletions(-)
```
