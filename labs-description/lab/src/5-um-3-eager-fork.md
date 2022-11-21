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

Теперь должены заработать тесты `exofork_syscall()` и `eager_fork()` в файле
[`kernel/src/tests/5-um-3-eager-fork.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/5-um-3-eager-fork.rs):

```console
$ (cd kernel; cargo test --test 5-um-3-eager-fork)
...
5_um_3_eager_fork::exofork_syscall--------------------------
18:24:16 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
18:24:16 0 I duplicate; address_space = "process" @ 0p7E0A000
18:24:16 0 I switch to; address_space = "process" @ 0p7E0A000
18:24:16 0 D extend mapping; block = [0v10000000, 0v10007634), size 29.551 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:24:16 0 D elf loadable program header; file_block = [0v201499, 0v208ACD), size 29.551 KiB; memory_block = [0v10000000, 0v10007634), size 29.551 KiB; flags =   R
18:24:16 0 D extend mapping; block = [0v10008000, 0v100547BD), size 305.935 KiB; page_block = [0v10008000, 0v10055000), size 308.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:24:16 0 D elf loadable program header; file_block = [0v208AD9, 0v255C56), size 308.372 KiB; memory_block = [0v10007640, 0v100547BD), size 308.372 KiB; flags = X R
18:24:16 0 D elf loadable program header; file_block = [0v255C59, 0v255D49), size 240 B; memory_block = [0v100547C0, 0v100548B0), size 240 B; flags =  WR
18:24:16 0 D extend mapping; block = [0v10055000, 0v1005AAD0), size 22.703 KiB; page_block = [0v10055000, 0v1005B000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:24:16 0 D elf loadable program header; file_block = [0v255D49, 0v25BF41), size 24.492 KiB; memory_block = [0v100548B0, 0v1005AAD0), size 24.531 KiB; flags =  WR
18:24:16 0 I switch to; address_space = "base" @ 0p1000
18:24:16 0 I loaded ELF file; context = { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 }; file_size = 5.474 MiB; process = { pid: <current>, address_space: "process" @ 0p7E0A000, { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 } }
18:24:16 0 I allocate; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E0A000, { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 } }; process_count = 1
18:24:16 0 I user process page table entry; entry_point = 0v10007BB0; frame = Frame(32234 @ 0p7DEA000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
18:24:16 0 D process_frames = 152
18:24:16 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
18:24:16 0 I duplicate; address_space = "process" @ 0p7D72000
18:24:16 0 I switch to; address_space = "process" @ 0p7D72000
18:24:17.003 0 D extend mapping; block = [0v10000000, 0v10007634), size 29.551 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:24:17.017 0 D elf loadable program header; file_block = [0v201499, 0v208ACD), size 29.551 KiB; memory_block = [0v10000000, 0v10007634), size 29.551 KiB; flags =   R
18:24:17.053 0 D extend mapping; block = [0v10008000, 0v100547BD), size 305.935 KiB; page_block = [0v10008000, 0v10055000), size 308.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:24:17.067 0 D elf loadable program header; file_block = [0v208AD9, 0v255C56), size 308.372 KiB; memory_block = [0v10007640, 0v100547BD), size 308.372 KiB; flags = X R
18:24:17.093 0 D elf loadable program header; file_block = [0v255C59, 0v255D49), size 240 B; memory_block = [0v100547C0, 0v100548B0), size 240 B; flags =  WR
18:24:17.105 0 D extend mapping; block = [0v10055000, 0v1005AAD0), size 22.703 KiB; page_block = [0v10055000, 0v1005B000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:24:17.119 0 D elf loadable program header; file_block = [0v255D49, 0v25BF41), size 24.492 KiB; memory_block = [0v100548B0, 0v1005AAD0), size 24.531 KiB; flags =  WR
18:24:17.145 0 I switch to; address_space = "base" @ 0p1000
18:24:17.151 0 I loaded ELF file; context = { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 }; file_size = 5.474 MiB; process = { pid: <current>, address_space: "process" @ 0p7D72000, { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 } }
18:24:17.165 0 I allocate; slot = Process { pid: 1:0, address_space: "1:0" @ 0p7D72000, { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 } }; process_count = 2
18:24:17.175 0 I user process page table entry; entry_point = 0v10007BB0; frame = Frame(32082 @ 0p7D52000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
18:24:17.187 0 D process_frames = 152
18:24:17.191 0 I switch to; address_space = "0:0" @ 0p7E0A000
18:24:17.287 0 I page allocator init; free_page_count = 33688649728; block = [0v18000000000, 0v7F0000000000), size 125.500 TiB
18:24:17.297 0 I duplicate; address_space = "process" @ 0p7CDA000
18:24:17.301 0 I switch to; address_space = "process" @ 0p7CDA000
18:24:17.307 0 I switch to; address_space = "0:0" @ 0p7E0A000
18:24:17.313 0 I allocate; slot = Process { pid: 2:0, address_space: "2:0" @ 0p7CDA000, { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 } }; process_count = 3
18:24:17.323 0 I syscall = "exofork"; process = 0:0; child = 2:0
18:24:17.329 0 D child_pid = 2:0
18:24:17.333 0 D child = { pid: 2:0, address_space: "2:0" @ 0p7CDA000, { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 } }
18:24:17.345 0 I free; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E0A000, { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 } }; process_count = 2
18:24:17.355 0 I switch to; address_space = "base" @ 0p1000
18:24:17.361 0 I drop the current address space; address_space = "0:0" @ 0p7E0A000; switch_to = "base" @ 0p1000
18:24:17.427 0 I free; slot = Process { pid: 1:0, address_space: "1:0" @ 0p7D72000, { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 } }; process_count = 1
18:24:17.437 0 I drop; address_space = "1:0" @ 0p7D72000
18:24:17.497 0 I dequeue; pid = Some(2:0)
18:24:17.503 0 I switch to; address_space = "2:0" @ 0p7CDA000
18:24:17.509 0 D entering the user mode; pid = 2:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v10007BB0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
18:24:17.525 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10007BB0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF }; info = { code: 0b10100 = non-present page | execute | user, address: 0v10007BB0 }
18:24:17.557 0 I user mode trap; trap = "Page Fault"; number = 14; info = { code: 0b10100 = non-present page | execute | user, address: 0v10007BB0 }; context = { mode: user, cs:rip: 0x0023:0v10007BB0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF }; pid = 2:0
18:24:17.579 0 I free; slot = Process { pid: 2:0, address_space: "2:0" @ 0p7CDA000, { rip: 0v10007BB0, rsp: 0v7F7FFFFFF000 } }; process_count = 0
18:24:17.589 0 I switch to; address_space = "base" @ 0p1000
18:24:17.595 0 I drop the current address space; address_space = "2:0" @ 0p7CDA000; switch_to = "base" @ 0p1000
18:24:17.667 0 D leaving the user mode; pid = 2:0
18:24:17.671 0 I dequeue; pid = None
5_um_3_eager_fork::exofork_syscall----------------- [passed]

5_um_3_eager_fork::eager_fork-------------------------------
18:24:17.775 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
18:24:17.785 0 I duplicate; address_space = "process" @ 0p7CDA000
18:24:17.789 0 I switch to; address_space = "process" @ 0p7CDA000
18:24:17.797 0 D extend mapping; block = [0v10000000, 0v10007BB4), size 30.926 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:24:17.811 0 D elf loadable program header; file_block = [0v77B0F8, 0v782CAC), size 30.926 KiB; memory_block = [0v10000000, 0v10007BB4), size 30.926 KiB; flags =   R
18:24:17.847 0 D extend mapping; block = [0v10008000, 0v1005D992), size 342.393 KiB; page_block = [0v10008000, 0v1005E000), size 344.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:24:17.863 0 D elf loadable program header; file_block = [0v782CB8, 0v7D8A8A), size 343.455 KiB; memory_block = [0v10007BC0, 0v1005D992), size 343.455 KiB; flags = X R
18:24:17.889 0 D elf loadable program header; file_block = [0v7D8A90, 0v7D8B90), size 256 B; memory_block = [0v1005D998, 0v1005DA98), size 256 B; flags =  WR
18:24:17.901 0 D extend mapping; block = [0v1005E000, 0v100646E0), size 25.719 KiB; page_block = [0v1005E000, 0v10065000), size 28.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:24:17.915 0 D elf loadable program header; file_block = [0v7D8B90, 0v7DF7B0), size 27.031 KiB; memory_block = [0v1005DA98, 0v100646E0), size 27.070 KiB; flags =  WR
18:24:17.945 0 I switch to; address_space = "base" @ 0p1000
18:24:17.951 0 I loaded ELF file; context = { rip: 0v1000F7E0, rsp: 0v7F7FFFFFF000 }; file_size = 5.767 MiB; process = { pid: <current>, address_space: "process" @ 0p7CDA000, { rip: 0v1000F7E0, rsp: 0v7F7FFFFFF000 } }
18:24:17.965 0 I allocate; slot = Process { pid: 2:1, address_space: "2:1" @ 0p7CDA000, { rip: 0v1000F7E0, rsp: 0v7F7FFFFFF000 } }; process_count = 1
18:24:17.975 0 I user process page table entry; entry_point = 0v1000F7E0; frame = Frame(32099 @ 0p7D63000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
18:24:17.987 0 D process_frames = 162
18:24:18.001 0 I dequeue; pid = Some(2:1)
18:24:18.005 0 I switch to; address_space = "2:1" @ 0p7CDA000
18:24:18.011 0 D entering the user mode; pid = 2:1; registers = { rax: 0x0, rdi: 0x7F7FFFFDB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v1000F7E0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
18:24:18.029 0 I name = "eager_fork *"; pedigree = [2:1]; len = 1; capacity = 3; pid = 2:1
18:24:18.151 0 I page allocator init; free_page_count = 33688649728; block = [0v18000000000, 0v7F0000000000), size 125.500 TiB
18:24:18.161 0 I duplicate; address_space = "process" @ 0p7D4B000
18:24:18.165 0 I switch to; address_space = "process" @ 0p7D4B000
18:24:18.171 0 I switch to; address_space = "2:1" @ 0p7CDA000
18:24:18.177 0 I allocate; slot = Process { pid: 1:1, address_space: "1:1" @ 0p7D4B000, { rip: 0v10009B87, rsp: 0v7F7FFFFFDB08 } }; process_count = 2
18:24:18.187 0 I syscall = "exofork"; process = 2:1; child = 1:1
18:24:18.193 0 I syscall::exofork() done; child = Ok(1:1); pid = 2:1
18:24:18.375 0 I syscall::set_state(); child = 1:1; result = Ok(()); pid = 2:1
18:24:18.471 0 I page allocator init; free_page_count = 33688649728; block = [0v18000000000, 0v7F0000000000), size 125.500 TiB
18:24:18.481 0 I duplicate; address_space = "process" @ 0p7DF0000
18:24:18.485 0 I switch to; address_space = "process" @ 0p7DF0000
18:24:18.493 0 I switch to; address_space = "2:1" @ 0p7CDA000
18:24:18.497 0 I allocate; slot = Process { pid: 0:1, address_space: "0:1" @ 0p7DF0000, { rip: 0v10009B87, rsp: 0v7F7FFFFFDB08 } }; process_count = 3
18:24:18.507 0 I syscall = "exofork"; process = 2:1; child = 0:1
18:24:18.511 0 I syscall::exofork() done; child = Ok(0:1); pid = 2:1
18:24:18.681 0 I syscall::set_state(); child = 0:1; result = Ok(()); pid = 2:1
18:24:18.779 0 I page allocator init; free_page_count = 33688649728; block = [0v18000000000, 0v7F0000000000), size 125.500 TiB
18:24:18.787 0 I duplicate; address_space = "process" @ 0p7C1D000
18:24:18.793 0 I switch to; address_space = "process" @ 0p7C1D000
18:24:18.799 0 I switch to; address_space = "2:1" @ 0p7CDA000
18:24:18.805 0 I allocate; slot = Process { pid: 3:0, address_space: "3:0" @ 0p7C1D000, { rip: 0v10009B87, rsp: 0v7F7FFFFFDB08 } }; process_count = 4
18:24:18.813 0 I syscall = "exofork"; process = 2:1; child = 3:0
18:24:18.819 0 I syscall::exofork() done; child = Ok(3:0); pid = 2:1
18:24:18.987 0 I syscall::set_state(); child = 3:0; result = Ok(()); pid = 2:1
18:24:18.993 0 I free; slot = Process { pid: 2:1, address_space: "2:1" @ 0p7CDA000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 3
18:24:19.003 0 I switch to; address_space = "base" @ 0p1000
18:24:19.001 0 I drop the current address space; address_space = "2:1" @ 0p7CDA000; switch_to = "base" @ 0p1000
18:24:19.065 0 I syscall = "exit"; pid = 2:1; code = 0; reason = Some(OK)
18:24:19.071 0 D leaving the user mode; pid = 2:1
18:24:19.077 0 I dequeue; pid = Some(1:1)
18:24:19.081 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:19.085 0 D entering the user mode; pid = 1:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF } }
18:24:19.101 0 I syscall::exofork() done; child = Ok(<current>); pid = 1:1
18:24:19.113 0 I just created; child = <current>; pid = 1:1; pid = 1:1
18:24:19.117 0 I name = "eager_fork *0"; pedigree = [2:1, 1:1]; len = 2; capacity = 3; pid = 1:1
18:24:19.233 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:19.243 0 I duplicate; address_space = "process" @ 0p7CDA000
18:24:19.247 0 I switch to; address_space = "process" @ 0p7CDA000
18:24:19.255 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:19.259 0 I allocate; slot = Process { pid: 2:2, address_space: "2:2" @ 0p7CDA000, { rip: 0v10009B87, rsp: 0v7F7FFFFFD648 } }; process_count = 4
18:24:19.269 0 I syscall = "exofork"; process = 1:1; child = 2:2
18:24:19.275 0 D leaving the user mode; pid = 1:1
18:24:19.279 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF }
18:24:19.289 0 I returned
18:24:19.295 0 I dequeue; pid = Some(0:1)
18:24:19.299 0 I switch to; address_space = "0:1" @ 0p7DF0000
18:24:19.305 0 D entering the user mode; pid = 0:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF } }
18:24:19.321 0 I syscall::exofork() done; child = Ok(<current>); pid = 0:1
18:24:19.331 0 I just created; child = <current>; pid = 0:1; pid = 0:1
18:24:19.335 0 I name = "eager_fork *1"; pedigree = [2:1, 0:1]; len = 2; capacity = 3; pid = 0:1
18:24:19.453 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:19.463 0 I duplicate; address_space = "process" @ 0p7D32000
18:24:19.467 0 I switch to; address_space = "process" @ 0p7D32000
18:24:19.475 0 I switch to; address_space = "0:1" @ 0p7DF0000
18:24:19.481 0 I allocate; slot = Process { pid: 4:0, address_space: "4:0" @ 0p7D32000, { rip: 0v10009B87, rsp: 0v7F7FFFFFD648 } }; process_count = 5
18:24:19.489 0 I syscall = "exofork"; process = 0:1; child = 4:0
18:24:19.495 0 I syscall::exofork() done; child = Ok(4:0); pid = 0:1
18:24:19.567 0 D leaving the user mode; pid = 0:1
18:24:19.573 0 I the process was preempted; pid = 0:1; user_context = { mode: user, cs:rip: 0x0023:0v1004F6BE, ss:rsp: 0x001B:0v7F7FFFFFB9C8, rflags: IF AF PF }
18:24:19.583 0 I returned
18:24:19.587 0 I dequeue; pid = Some(3:0)
18:24:19.591 0 I switch to; address_space = "3:0" @ 0p7C1D000
18:24:19.597 0 D entering the user mode; pid = 3:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7EFFFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF } }
18:24:19.613 0 I syscall::exofork() done; child = Ok(<current>); pid = 3:0
18:24:19.625 0 I just created; child = <current>; pid = 3:0; pid = 3:0
18:24:19.627 0 I name = "eager_fork *2"; pedigree = [2:1, 3:0]; len = 2; capacity = 3; pid = 3:0
18:24:19.763 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:19.773 0 I duplicate; address_space = "process" @ 0p7CFA000
18:24:19.777 0 I switch to; address_space = "process" @ 0p7CFA000
18:24:19.787 0 I switch to; address_space = "3:0" @ 0p7C1D000
18:24:19.793 0 I allocate; slot = Process { pid: 5:0, address_space: "5:0" @ 0p7CFA000, { rip: 0v10009B87, rsp: 0v7F7FFFFFD648 } }; process_count = 6
18:24:19.803 0 I syscall = "exofork"; process = 3:0; child = 5:0
18:24:19.807 0 I syscall::exofork() done; child = Ok(5:0); pid = 3:0
18:24:19.967 0 D leaving the user mode; pid = 3:0
18:24:19.971 0 I the process was preempted; pid = 3:0; user_context = { mode: user, cs:rip: 0x0023:0v10008FF6, ss:rsp: 0x001B:0v7F7FFFFFC7B8, rflags: IF AF }
18:24:19.981 0 I returned
18:24:20.001 0 I dequeue; pid = Some(1:1)
18:24:20.005 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:20.009 0 D entering the user mode; pid = 1:1; registers = { rax: 0x0, rdi: 0x20002, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF } }
18:24:20.023 0 I syscall::exofork() done; child = Ok(2:2); pid = 1:1
18:24:20.201 0 I syscall::set_state(); child = 2:2; result = Ok(()); pid = 1:1
18:24:20.301 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:20.311 0 I duplicate; address_space = "process" @ 0p7AA5000
18:24:20.315 0 I switch to; address_space = "process" @ 0p7AA5000
18:24:20.323 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:20.327 0 I allocate; slot = Process { pid: 6:0, address_space: "6:0" @ 0p7AA5000, { rip: 0v10009B87, rsp: 0v7F7FFFFFD648 } }; process_count = 7
18:24:20.337 0 I syscall = "exofork"; process = 1:1; child = 6:0
18:24:20.343 0 I syscall::exofork() done; child = Ok(6:0); pid = 1:1
18:24:20.381 0 D leaving the user mode; pid = 1:1
18:24:20.385 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v10011AC5, ss:rsp: 0x001B:0v7F7FFFFFB508, rflags: IF }
18:24:20.395 0 I returned
18:24:20.401 0 I dequeue; pid = Some(0:1)
18:24:20.405 0 I switch to; address_space = "0:1" @ 0p7DF0000
18:24:20.409 0 D entering the user mode; pid = 0:1; registers = { rax: 0x1, rdi: 0x7F7FFFFFBA50, rsi: 0x7EFFFFFBF, { mode: user, cs:rip: 0x0023:0v1004F6BE, ss:rsp: 0x001B:0v7F7FFFFFB9C8, rflags: IF AF PF } }
18:24:20.481 0 D leaving the user mode; pid = 0:1
18:24:20.485 0 I the process was preempted; pid = 0:1; user_context = { mode: user, cs:rip: 0x0023:0v1002C8A7, ss:rsp: 0x001B:0v7F7FFFFFB9E8, rflags: IF SF PF CF }
18:24:20.499 0 I returned
18:24:20.503 0 I dequeue; pid = Some(3:0)
18:24:20.509 0 I switch to; address_space = "3:0" @ 0p7C1D000
18:24:20.513 0 D entering the user mode; pid = 3:0; registers = { rax: 0xFFFFFFFFFFEFDF10, rdi: 0xFFFFFFFFFFEFDF10, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10008FF6, ss:rsp: 0x001B:0v7F7FFFFFC7B8, rflags: IF AF } }
18:24:20.569 0 I syscall::set_state(); child = 5:0; result = Ok(()); pid = 3:0
18:24:20.675 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:20.683 0 I duplicate; address_space = "process" @ 0p7A18000
18:24:20.689 0 I switch to; address_space = "process" @ 0p7A18000
18:24:20.695 0 I switch to; address_space = "3:0" @ 0p7C1D000
18:24:20.701 0 I allocate; slot = Process { pid: 7:0, address_space: "7:0" @ 0p7A18000, { rip: 0v10009B87, rsp: 0v7F7FFFFFD648 } }; process_count = 8
18:24:20.709 0 I syscall = "exofork"; process = 3:0; child = 7:0
18:24:20.715 0 I syscall::exofork() done; child = Ok(7:0); pid = 3:0
18:24:20.887 0 I syscall::set_state(); child = 7:0; result = Ok(()); pid = 3:0
18:24:20.991 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:21.001 0 I duplicate; address_space = "process" @ 0p796E000
18:24:21.005 0 I switch to; address_space = "process" @ 0p796E000
18:24:21.003 0 I switch to; address_space = "3:0" @ 0p7C1D000
18:24:21.007 0 I allocate; slot = Process { pid: 8:0, address_space: "8:0" @ 0p796E000, { rip: 0v10009B87, rsp: 0v7F7FFFFFD648 } }; process_count = 9
18:24:21.017 0 I syscall = "exofork"; process = 3:0; child = 8:0
18:24:21.023 0 I syscall::exofork() done; child = Ok(8:0); pid = 3:0
18:24:21.071 0 D leaving the user mode; pid = 3:0
18:24:21.075 0 I the process was preempted; pid = 3:0; user_context = { mode: user, cs:rip: 0x0023:0v1001942D, ss:rsp: 0x001B:0v7F7FFFFFBAA8, rflags: IF AF PF }
18:24:21.085 0 I returned
18:24:21.091 0 I dequeue; pid = Some(2:2)
18:24:21.095 0 I switch to; address_space = "2:2" @ 0p7CDA000
18:24:21.099 0 D entering the user mode; pid = 2:2; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF } }
18:24:21.117 0 I syscall::exofork() done; child = Ok(<current>); pid = 2:2
18:24:21.127 0 I just created; child = <current>; pid = 2:2; pid = 2:2
18:24:21.129 0 I name = "eager_fork *00"; pedigree = [2:1, 1:1, 2:2]; len = 3; capacity = 3; pid = 2:2
18:24:21.153 0 I free; slot = Process { pid: 2:2, address_space: "2:2" @ 0p7CDA000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 8
18:24:21.163 0 I switch to; address_space = "base" @ 0p1000
18:24:21.167 0 I drop the current address space; address_space = "2:2" @ 0p7CDA000; switch_to = "base" @ 0p1000
18:24:21.239 0 I syscall = "exit"; pid = 2:2; code = 0; reason = Some(OK)
18:24:21.245 0 D leaving the user mode; pid = 2:2
18:24:21.249 0 I dequeue; pid = Some(1:1)
18:24:21.255 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:21.259 0 D entering the user mode; pid = 1:1; registers = { rax: 0x0, rdi: 0x7EFFFFEBE000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10011AC5, ss:rsp: 0x001B:0v7F7FFFFFB508, rflags: IF } }
18:24:21.273 0 D leaving the user mode; pid = 1:1
18:24:21.277 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v10011AC5, ss:rsp: 0x001B:0v7F7FFFFFB508, rflags: IF }
18:24:21.287 0 I returned
18:24:21.291 0 I dequeue; pid = Some(0:1)
18:24:21.297 0 I switch to; address_space = "0:1" @ 0p7DF0000
18:24:21.301 0 D entering the user mode; pid = 0:1; registers = { rax: 0x1000, rdi: 0x7EFFFFF60000, rsi: 0x1004D000, { mode: user, cs:rip: 0x0023:0v1002C8A7, ss:rsp: 0x001B:0v7F7FFFFFB9E8, rflags: IF SF PF CF } }
18:24:21.387 0 I syscall::set_state(); child = 4:0; result = Ok(()); pid = 0:1
18:24:21.495 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:21.503 0 I duplicate; address_space = "process" @ 0p7D47000
18:24:21.509 0 I switch to; address_space = "process" @ 0p7D47000
18:24:21.517 0 I switch to; address_space = "0:1" @ 0p7DF0000
18:24:21.521 0 I allocate; slot = Process { pid: 2:3, address_space: "2:3" @ 0p7D47000, { rip: 0v10009B87, rsp: 0v7F7FFFFFD648 } }; process_count = 9
18:24:21.531 0 I syscall = "exofork"; process = 0:1; child = 2:3
18:24:21.537 0 I syscall::exofork() done; child = Ok(2:3); pid = 0:1
18:24:21.773 0 I syscall::set_state(); child = 2:3; result = Ok(()); pid = 0:1
18:24:21.875 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:21.883 0 I duplicate; address_space = "process" @ 0p78EF000
18:24:21.889 0 I switch to; address_space = "process" @ 0p78EF000
18:24:21.895 0 I switch to; address_space = "0:1" @ 0p7DF0000
18:24:21.901 0 I allocate; slot = Process { pid: 9:0, address_space: "9:0" @ 0p78EF000, { rip: 0v10009B87, rsp: 0v7F7FFFFFD648 } }; process_count = 10
18:24:21.909 0 I syscall = "exofork"; process = 0:1; child = 9:0
18:24:21.915 0 I syscall::exofork() done; child = Ok(9:0); pid = 0:1
18:24:22.095 0 I syscall::set_state(); child = 9:0; result = Ok(()); pid = 0:1
18:24:22.199 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:22.209 0 I duplicate; address_space = "process" @ 0p7846000
18:24:22.213 0 I switch to; address_space = "process" @ 0p7846000
18:24:22.219 0 I switch to; address_space = "0:1" @ 0p7DF0000
18:24:22.225 0 I allocate; slot = Process { pid: 10:0, address_space: "10:0" @ 0p7846000, { rip: 0v10009B87, rsp: 0v7F7FFFFFDB08 } }; process_count = 11
18:24:22.235 0 I syscall = "exofork"; process = 0:1; child = 10:0
18:24:22.239 0 I syscall::exofork() done; child = Ok(10:0); pid = 0:1
18:24:22.411 0 I syscall::set_state(); child = 10:0; result = Ok(()); pid = 0:1
18:24:22.417 0 I free; slot = Process { pid: 0:1, address_space: "0:1" @ 0p7DF0000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 10
18:24:22.427 0 I switch to; address_space = "base" @ 0p1000
18:24:22.431 0 I drop the current address space; address_space = "0:1" @ 0p7DF0000; switch_to = "base" @ 0p1000
18:24:22.503 0 I syscall = "exit"; pid = 0:1; code = 0; reason = Some(OK)
18:24:22.509 0 D leaving the user mode; pid = 0:1
18:24:22.513 0 I dequeue; pid = Some(5:0)
18:24:22.517 0 I switch to; address_space = "5:0" @ 0p7CFA000
18:24:22.523 0 D entering the user mode; pid = 5:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF } }
18:24:22.539 0 I syscall::exofork() done; child = Ok(<current>); pid = 5:0
18:24:22.549 0 I just created; child = <current>; pid = 5:0; pid = 5:0
18:24:22.553 0 I name = "eager_fork *20"; pedigree = [2:1, 3:0, 5:0]; len = 3; capacity = 3; pid = 5:0
18:24:22.577 0 I free; slot = Process { pid: 5:0, address_space: "5:0" @ 0p7CFA000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 9
18:24:22.585 0 I switch to; address_space = "base" @ 0p1000
18:24:22.591 0 I drop the current address space; address_space = "5:0" @ 0p7CFA000; switch_to = "base" @ 0p1000
18:24:22.665 0 I syscall = "exit"; pid = 5:0; code = 0; reason = Some(OK)
18:24:22.669 0 D leaving the user mode; pid = 5:0
18:24:22.673 0 I dequeue; pid = Some(7:0)
18:24:22.679 0 I switch to; address_space = "7:0" @ 0p7A18000
18:24:22.683 0 D entering the user mode; pid = 7:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF AF } }
18:24:22.701 0 I syscall::exofork() done; child = Ok(<current>); pid = 7:0
18:24:22.711 0 I just created; child = <current>; pid = 7:0; pid = 7:0
18:24:22.715 0 I name = "eager_fork *21"; pedigree = [2:1, 3:0, 7:0]; len = 3; capacity = 3; pid = 7:0
18:24:22.739 0 I free; slot = Process { pid: 7:0, address_space: "7:0" @ 0p7A18000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 8
18:24:22.749 0 I switch to; address_space = "base" @ 0p1000
18:24:22.753 0 I drop the current address space; address_space = "7:0" @ 0p7A18000; switch_to = "base" @ 0p1000
18:24:22.825 0 I syscall = "exit"; pid = 7:0; code = 0; reason = Some(OK)
18:24:22.831 0 D leaving the user mode; pid = 7:0
18:24:22.835 0 I dequeue; pid = Some(3:0)
18:24:22.841 0 I switch to; address_space = "3:0" @ 0p7C1D000
18:24:22.845 0 D entering the user mode; pid = 3:0; registers = { rax: 0x0, rdi: 0x7F7FFFFFBA48, rsi: 0x7F7FFFFFBA58, { mode: user, cs:rip: 0x0023:0v1001942D, ss:rsp: 0x001B:0v7F7FFFFFBAA8, rflags: IF AF PF } }
18:24:22.981 0 D leaving the user mode; pid = 3:0
18:24:22.987 0 I the process was preempted; pid = 3:0; user_context = { mode: user, cs:rip: 0x0023:0v100167F0, ss:rsp: 0x001B:0v7F7FFFFFB980, rflags: IF AF }
18:24:22.995 0 I returned
18:24:23.001 0 I dequeue; pid = Some(1:1)
18:24:23.005 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:23.009 0 D entering the user mode; pid = 1:1; registers = { rax: 0x0, rdi: 0x7EFFFFEBE000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10011AC5, ss:rsp: 0x001B:0v7F7FFFFFB508, rflags: IF } }
18:24:23.223 0 I syscall::set_state(); child = 6:0; result = Ok(()); pid = 1:1
18:24:23.327 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:23.337 0 I duplicate; address_space = "process" @ 0p7A22000
18:24:23.341 0 I switch to; address_space = "process" @ 0p7A22000
18:24:23.347 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:23.353 0 I allocate; slot = Process { pid: 7:1, address_space: "7:1" @ 0p7A22000, { rip: 0v10009B87, rsp: 0v7F7FFFFFD648 } }; process_count = 9
18:24:23.363 0 I syscall = "exofork"; process = 1:1; child = 7:1
18:24:23.367 0 I syscall::exofork() done; child = Ok(7:1); pid = 1:1
18:24:23.381 0 D leaving the user mode; pid = 1:1
18:24:23.385 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v10021DD0, ss:rsp: 0x001B:0v7F7FFFFFB860, rflags: IF AF }
18:24:23.395 0 I returned
18:24:23.401 0 I dequeue; pid = Some(4:0)
18:24:23.405 0 I switch to; address_space = "4:0" @ 0p7D32000
18:24:23.411 0 D entering the user mode; pid = 4:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF } }
18:24:23.427 0 I syscall::exofork() done; child = Ok(<current>); pid = 4:0
18:24:23.437 0 I just created; child = <current>; pid = 4:0; pid = 4:0
18:24:23.439 0 I name = "eager_fork *10"; pedigree = [2:1, 0:1, 4:0]; len = 3; capacity = 3; pid = 4:0
18:24:23.463 0 I free; slot = Process { pid: 4:0, address_space: "4:0" @ 0p7D32000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 8
18:24:23.473 0 I switch to; address_space = "base" @ 0p1000
18:24:23.477 0 I drop the current address space; address_space = "4:0" @ 0p7D32000; switch_to = "base" @ 0p1000
18:24:23.549 0 I syscall = "exit"; pid = 4:0; code = 0; reason = Some(OK)
18:24:23.555 0 D leaving the user mode; pid = 4:0
18:24:23.559 0 I dequeue; pid = Some(2:3)
18:24:23.563 0 I switch to; address_space = "2:3" @ 0p7D47000
18:24:23.569 0 D entering the user mode; pid = 2:3; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF SF PF CF } }
18:24:23.589 0 D leaving the user mode; pid = 2:3
18:24:23.593 0 I the process was preempted; pid = 2:3; user_context = { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF SF PF CF }
18:24:23.605 0 I returned
18:24:23.611 0 I dequeue; pid = Some(9:0)
18:24:23.615 0 I switch to; address_space = "9:0" @ 0p78EF000
18:24:23.621 0 D entering the user mode; pid = 9:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF SF PF CF } }
18:24:23.637 0 I syscall::exofork() done; child = Ok(<current>); pid = 9:0
18:24:23.647 0 I just created; child = <current>; pid = 9:0; pid = 9:0
18:24:23.651 0 I name = "eager_fork *12"; pedigree = [2:1, 0:1, 9:0]; len = 3; capacity = 3; pid = 9:0
18:24:23.673 0 I free; slot = Process { pid: 9:0, address_space: "9:0" @ 0p78EF000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 7
18:24:23.683 0 I switch to; address_space = "base" @ 0p1000
18:24:23.689 0 I drop the current address space; address_space = "9:0" @ 0p78EF000; switch_to = "base" @ 0p1000
18:24:23.761 0 I syscall = "exit"; pid = 9:0; code = 0; reason = Some(OK)
18:24:23.765 0 D leaving the user mode; pid = 9:0
18:24:23.771 0 I dequeue; pid = Some(10:0)
18:24:23.775 0 I switch to; address_space = "10:0" @ 0p7846000
18:24:23.781 0 D entering the user mode; pid = 10:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF SF PF CF } }
18:24:23.795 0 D leaving the user mode; pid = 10:0
18:24:23.799 0 I the process was preempted; pid = 10:0; user_context = { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF SF PF CF }
18:24:23.811 0 I returned
18:24:23.817 0 I dequeue; pid = Some(3:0)
18:24:23.821 0 I switch to; address_space = "3:0" @ 0p7C1D000
18:24:23.827 0 D entering the user mode; pid = 3:0; registers = { rax: 0x7F7FFFFFB9D0, rdi: 0x7F7FFFFFB9D0, rsi: 0x1005EC30, { mode: user, cs:rip: 0x0023:0v100167F0, ss:rsp: 0x001B:0v7F7FFFFFB980, rflags: IF AF } }
18:24:23.857 0 I syscall::set_state(); child = 8:0; result = Ok(()); pid = 3:0
18:24:23.865 0 I free; slot = Process { pid: 3:0, address_space: "3:0" @ 0p7C1D000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 6
18:24:23.873 0 I switch to; address_space = "base" @ 0p1000
18:24:23.879 0 I drop the current address space; address_space = "3:0" @ 0p7C1D000; switch_to = "base" @ 0p1000
18:24:23.949 0 I syscall = "exit"; pid = 3:0; code = 0; reason = Some(OK)
18:24:23.955 0 D leaving the user mode; pid = 3:0
18:24:23.959 0 I dequeue; pid = Some(6:0)
18:24:23.965 0 I switch to; address_space = "6:0" @ 0p7AA5000
18:24:23.969 0 D entering the user mode; pid = 6:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF } }
18:24:23.983 0 D leaving the user mode; pid = 6:0
18:24:23.987 0 I the process was preempted; pid = 6:0; user_context = { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF }
18:24:23.997 0 I returned
18:24:24.001 0 I dequeue; pid = Some(1:1)
18:24:24.005 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:24.011 0 D entering the user mode; pid = 1:1; registers = { rax: 0x7F7FFFFFB940, rdi: 0x7F7FFFFFB940, rsi: 0x7EFFFFFFCFFF, { mode: user, cs:rip: 0x0023:0v10021DD0, ss:rsp: 0x001B:0v7F7FFFFFB860, rflags: IF AF } }
18:24:24.223 0 I syscall::set_state(); child = 7:1; result = Ok(()); pid = 1:1
18:24:24.351 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:24.361 0 I duplicate; address_space = "process" @ 0p7BDB000
18:24:24.365 0 I switch to; address_space = "process" @ 0p7BDB000
18:24:24.373 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:24.377 0 I allocate; slot = Process { pid: 3:1, address_space: "3:1" @ 0p7BDB000, { rip: 0v10009B87, rsp: 0v7F7FFFFFDB08 } }; process_count = 7
18:24:24.387 0 I syscall = "exofork"; process = 1:1; child = 3:1
18:24:24.393 0 D leaving the user mode; pid = 1:1
18:24:24.397 0 I the process was preempted; pid = 1:1; user_context = { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF }
18:24:24.407 0 I returned
18:24:24.411 0 I dequeue; pid = Some(2:3)
18:24:24.417 0 I switch to; address_space = "2:3" @ 0p7D47000
18:24:24.421 0 D entering the user mode; pid = 2:3; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF SF PF CF } }
18:24:24.437 0 I syscall::exofork() done; child = Ok(<current>); pid = 2:3
18:24:24.447 0 I just created; child = <current>; pid = 2:3; pid = 2:3
18:24:24.451 0 I name = "eager_fork *11"; pedigree = [2:1, 0:1, 2:3]; len = 3; capacity = 3; pid = 2:3
18:24:24.475 0 I free; slot = Process { pid: 2:3, address_space: "2:3" @ 0p7D47000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 6
18:24:24.485 0 I switch to; address_space = "base" @ 0p1000
18:24:24.489 0 I drop the current address space; address_space = "2:3" @ 0p7D47000; switch_to = "base" @ 0p1000
18:24:24.561 0 I syscall = "exit"; pid = 2:3; code = 0; reason = Some(OK)
18:24:24.567 0 D leaving the user mode; pid = 2:3
18:24:24.571 0 I dequeue; pid = Some(10:0)
18:24:24.575 0 I switch to; address_space = "10:0" @ 0p7846000
18:24:24.581 0 D entering the user mode; pid = 10:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF SF PF CF } }
18:24:24.597 0 I syscall::exofork() done; child = Ok(<current>); pid = 10:0
18:24:24.607 0 I just created; child = <current>; pid = 10:0; pid = 10:0
18:24:24.611 0 I name = "eager_fork *12"; pedigree = [2:1, 0:1, 10:0]; len = 3; capacity = 3; pid = 10:0
18:24:24.635 0 I free; slot = Process { pid: 10:0, address_space: "10:0" @ 0p7846000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 5
18:24:24.645 0 I switch to; address_space = "base" @ 0p1000
18:24:24.649 0 I drop the current address space; address_space = "10:0" @ 0p7846000; switch_to = "base" @ 0p1000
18:24:24.721 0 I syscall = "exit"; pid = 10:0; code = 0; reason = Some(OK)
18:24:24.727 0 D leaving the user mode; pid = 10:0
18:24:24.731 0 I dequeue; pid = Some(8:0)
18:24:24.737 0 I switch to; address_space = "8:0" @ 0p796E000
18:24:24.741 0 D entering the user mode; pid = 8:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF AF } }
18:24:24.757 0 I syscall::exofork() done; child = Ok(<current>); pid = 8:0
18:24:24.767 0 I just created; child = <current>; pid = 8:0; pid = 8:0
18:24:24.771 0 I name = "eager_fork *22"; pedigree = [2:1, 3:0, 8:0]; len = 3; capacity = 3; pid = 8:0
18:24:24.795 0 I free; slot = Process { pid: 8:0, address_space: "8:0" @ 0p796E000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 4
18:24:24.805 0 I switch to; address_space = "base" @ 0p1000
18:24:24.809 0 I drop the current address space; address_space = "8:0" @ 0p796E000; switch_to = "base" @ 0p1000
18:24:24.883 0 I syscall = "exit"; pid = 8:0; code = 0; reason = Some(OK)
18:24:24.889 0 D leaving the user mode; pid = 8:0
18:24:24.893 0 I dequeue; pid = Some(6:0)
18:24:24.897 0 I switch to; address_space = "6:0" @ 0p7AA5000
18:24:24.903 0 D entering the user mode; pid = 6:0; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF } }
18:24:24.919 0 I syscall::exofork() done; child = Ok(<current>); pid = 6:0
18:24:24.929 0 I just created; child = <current>; pid = 6:0; pid = 6:0
18:24:24.933 0 I name = "eager_fork *01"; pedigree = [2:1, 1:1, 6:0]; len = 3; capacity = 3; pid = 6:0
18:24:24.957 0 I free; slot = Process { pid: 6:0, address_space: "6:0" @ 0p7AA5000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 3
18:24:24.965 0 I switch to; address_space = "base" @ 0p1000
18:24:24.969 0 I drop the current address space; address_space = "6:0" @ 0p7AA5000; switch_to = "base" @ 0p1000
18:24:25.045 0 I syscall = "exit"; pid = 6:0; code = 0; reason = Some(OK)
18:24:25.049 0 D leaving the user mode; pid = 6:0
18:24:25.055 0 I dequeue; pid = Some(7:1)
18:24:25.059 0 I switch to; address_space = "7:1" @ 0p7A22000
18:24:25.063 0 D entering the user mode; pid = 7:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFD648, rflags: IF } }
18:24:25.081 0 D leaving the user mode; pid = 7:1
18:24:25.087 0 I the process was preempted; pid = 7:1; user_context = { mode: user, cs:rip: 0x0023:0v1002C98F, ss:rsp: 0x001B:0v7F7FFFFFCEB8, rflags: IF SF AF PF CF }
18:24:25.099 0 I returned
18:24:25.105 0 I dequeue; pid = Some(1:1)
18:24:25.109 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:25.113 0 D entering the user mode; pid = 1:1; registers = { rax: 0x0, rdi: 0x10003, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF } }
18:24:25.127 0 I syscall::exofork() done; child = Ok(3:1); pid = 1:1
18:24:25.347 0 I syscall::set_state(); child = 3:1; result = Ok(()); pid = 1:1
18:24:25.465 0 I page allocator init; free_page_count = 33554432000; block = [0v18000000000, 0v7E8000000000), size 125.000 TiB
18:24:25.475 0 I duplicate; address_space = "process" @ 0p7A67000
18:24:25.479 0 I switch to; address_space = "process" @ 0p7A67000
18:24:25.487 0 I switch to; address_space = "1:1" @ 0p7D4B000
18:24:25.491 0 I allocate; slot = Process { pid: 6:1, address_space: "6:1" @ 0p7A67000, { rip: 0v10009B87, rsp: 0v7F7FFFFFDB08 } }; process_count = 4
18:24:25.501 0 I syscall = "exofork"; process = 1:1; child = 6:1
18:24:25.507 0 I syscall::exofork() done; child = Ok(6:1); pid = 1:1
18:24:25.727 0 I syscall::set_state(); child = 6:1; result = Ok(()); pid = 1:1
18:24:25.733 0 I free; slot = Process { pid: 1:1, address_space: "1:1" @ 0p7D4B000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 3
18:24:25.743 0 I switch to; address_space = "base" @ 0p1000
18:24:25.747 0 I drop the current address space; address_space = "1:1" @ 0p7D4B000; switch_to = "base" @ 0p1000
18:24:25.819 0 I syscall = "exit"; pid = 1:1; code = 0; reason = Some(OK)
18:24:25.823 0 D leaving the user mode; pid = 1:1
18:24:25.829 0 I dequeue; pid = Some(7:1)
18:24:25.833 0 I switch to; address_space = "7:1" @ 0p7A22000
18:24:25.839 0 D entering the user mode; pid = 7:1; registers = { rax: 0x1, rdi: 0x7F7FFFFFCF5F, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v1002C98F, ss:rsp: 0x001B:0v7F7FFFFFCEB8, rflags: IF SF AF PF CF } }
18:24:25.079 0 I syscall::exofork() done; child = Ok(<current>); pid = 7:1
18:24:25.861 0 I just created; child = <current>; pid = 7:1; pid = 7:1
18:24:25.865 0 I name = "eager_fork *02"; pedigree = [2:1, 1:1, 7:1]; len = 3; capacity = 3; pid = 7:1
18:24:25.889 0 I free; slot = Process { pid: 7:1, address_space: "7:1" @ 0p7A22000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 2
18:24:25.897 0 I switch to; address_space = "base" @ 0p1000
18:24:25.903 0 I drop the current address space; address_space = "7:1" @ 0p7A22000; switch_to = "base" @ 0p1000
18:24:25.975 0 I syscall = "exit"; pid = 7:1; code = 0; reason = Some(OK)
18:24:25.981 0 D leaving the user mode; pid = 7:1
18:24:25.985 0 I dequeue; pid = Some(3:1)
18:24:25.991 0 I switch to; address_space = "3:1" @ 0p7BDB000
18:24:25.995 0 D entering the user mode; pid = 3:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF AF } }
18:24:26.003 0 I syscall::exofork() done; child = Ok(<current>); pid = 3:1
18:24:26.013 0 I just created; child = <current>; pid = 3:1; pid = 3:1
18:24:26.015 0 I name = "eager_fork *01"; pedigree = [2:1, 1:1, 3:1]; len = 3; capacity = 3; pid = 3:1
18:24:26.039 0 I free; slot = Process { pid: 3:1, address_space: "3:1" @ 0p7BDB000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 1
18:24:26.049 0 I switch to; address_space = "base" @ 0p1000
18:24:26.053 0 I drop the current address space; address_space = "3:1" @ 0p7BDB000; switch_to = "base" @ 0p1000
18:24:26.127 0 I syscall = "exit"; pid = 3:1; code = 0; reason = Some(OK)
18:24:26.131 0 D leaving the user mode; pid = 3:1
18:24:26.135 0 I dequeue; pid = Some(6:1)
18:24:26.141 0 I switch to; address_space = "6:1" @ 0p7A67000
18:24:26.145 0 D entering the user mode; pid = 6:1; registers = { rax: 0x0, rdi: 0xFFFFFFFFFFFFFFFE, rsi: 0x7E7FFFFFB000, { mode: user, cs:rip: 0x0023:0v10009B87, ss:rsp: 0x001B:0v7F7FFFFFDB08, rflags: IF } }
18:24:26.173 0 D leaving the user mode; pid = 6:1
18:24:26.177 0 I the process was preempted; pid = 6:1; user_context = { mode: user, cs:rip: 0x0023:0v1001D90B, ss:rsp: 0x001B:0v7F7FFFFFCF98, rflags: IF }
18:24:26.187 0 I returned
18:24:26.191 0 I dequeue; pid = Some(6:1)
18:24:26.197 0 I switch to; address_space = "6:1" @ 0p7A67000
18:24:26.201 0 D entering the user mode; pid = 6:1; registers = { rax: 0x1, rdi: 0x7F7FFFFFE468, rsi: 0x7F7FFFFFD170, { mode: user, cs:rip: 0x0023:0v1001D90B, ss:rsp: 0x001B:0v7F7FFFFFCF98, rflags: IF } }
18:24:26.161 0 I syscall::exofork() done; child = Ok(<current>); pid = 6:1
18:24:26.171 0 I just created; child = <current>; pid = 6:1; pid = 6:1
18:24:26.219 0 I name = "eager_fork *02"; pedigree = [2:1, 1:1, 6:1]; len = 3; capacity = 3; pid = 6:1
18:24:26.241 0 I free; slot = Process { pid: 6:1, address_space: "6:1" @ 0p7A67000, { rip: 0v10011666, rsp: 0v7F7FFFFFEE28 } }; process_count = 0
18:24:26.251 0 I switch to; address_space = "base" @ 0p1000
18:24:26.255 0 I drop the current address space; address_space = "6:1" @ 0p7A67000; switch_to = "base" @ 0p1000
18:24:26.331 0 I syscall = "exit"; pid = 6:1; code = 0; reason = Some(OK)
18:24:26.335 0 D leaving the user mode; pid = 6:1
18:24:26.341 0 I dequeue; pid = None
5_um_3_eager_fork::eager_fork---------------------- [passed]
18:24:26.351 0 I exit qemu; exit_code = SUCCESS
```

В этом запуске видно, что корневым явился процесс с идентификатором `2:1`:

```console
$ grep pedigree log
18:24:18.029 0 I name = "eager_fork *"; pedigree = [2:1]; len = 1; capacity = 3; pid = 2:1
18:24:19.117 0 I name = "eager_fork *0"; pedigree = [2:1, 1:1]; len = 2; capacity = 3; pid = 1:1
18:24:19.335 0 I name = "eager_fork *1"; pedigree = [2:1, 0:1]; len = 2; capacity = 3; pid = 0:1
18:24:19.627 0 I name = "eager_fork *2"; pedigree = [2:1, 3:0]; len = 2; capacity = 3; pid = 3:0
18:24:21.129 0 I name = "eager_fork *00"; pedigree = [2:1, 1:1, 2:2]; len = 3; capacity = 3; pid = 2:2
18:24:22.553 0 I name = "eager_fork *20"; pedigree = [2:1, 3:0, 5:0]; len = 3; capacity = 3; pid = 5:0
18:24:22.715 0 I name = "eager_fork *21"; pedigree = [2:1, 3:0, 7:0]; len = 3; capacity = 3; pid = 7:0
18:24:23.439 0 I name = "eager_fork *10"; pedigree = [2:1, 0:1, 4:0]; len = 3; capacity = 3; pid = 4:0
18:24:23.651 0 I name = "eager_fork *12"; pedigree = [2:1, 0:1, 9:0]; len = 3; capacity = 3; pid = 9:0
18:24:24.451 0 I name = "eager_fork *11"; pedigree = [2:1, 0:1, 2:3]; len = 3; capacity = 3; pid = 2:3
18:24:24.611 0 I name = "eager_fork *12"; pedigree = [2:1, 0:1, 10:0]; len = 3; capacity = 3; pid = 10:0
18:24:24.771 0 I name = "eager_fork *22"; pedigree = [2:1, 3:0, 8:0]; len = 3; capacity = 3; pid = 8:0
18:24:24.933 0 I name = "eager_fork *01"; pedigree = [2:1, 1:1, 6:0]; len = 3; capacity = 3; pid = 6:0
18:24:25.865 0 I name = "eager_fork *02"; pedigree = [2:1, 1:1, 7:1]; len = 3; capacity = 3; pid = 7:1
18:24:26.015 0 I name = "eager_fork *01"; pedigree = [2:1, 1:1, 3:1]; len = 3; capacity = 3; pid = 3:1
18:24:26.219 0 I name = "eager_fork *02"; pedigree = [2:1, 1:1, 6:1]; len = 3; capacity = 3; pid = 6:1
```

Он запустил трёх потомков --- `1:1`, `0:1` и `3:0`.
А, например, родословная процесса `6:1` --- `pedigree = [2:1, 1:1, 6:1]`.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/memory/mapping.rs  |   21 +++++++++++++++++-
 kernel/src/process/syscall.rs |   23 ++++++++++++++++++-
 user/eager_fork/src/main.rs   |   49 ++++++++++++++++++++++++++++++++++++++++--
 user/lib/src/memory/mod.rs    |   31 ++++++++++++++++++++++++--
 4 files changed, 116 insertions(+), 8 deletions(-)
```
