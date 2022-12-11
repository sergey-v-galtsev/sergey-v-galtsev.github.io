## Системные вызовы для работы с виртуальной памятью

Добавим новые системные вызовы в файл [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Эти системные вызовы будут принимать идентификатор `Pid` целевого процесса.
То есть, они будут позволять вызывающему процессу выполнить действие над самим собой,
задав
[`Pid::Current`](../../doc/ku/process/pid/enum.Pid.html#variant.Current)
или явно собственный идентификатор
[`Pid::Id`](../../doc/ku/process/pid/enum.Pid.html#variant.Id).
Или же над другим процессом, указав его
[`Pid::Id`](../../doc/ku/process/pid/enum.Pid.html#variant.Id).

Системные вызовы, которые требуется реализовать в этой задаче ---
[`map()`](../../doc/kernel/process/syscall/fn.map.html),
[`unmap()`](../../doc/kernel/process/syscall/fn.unmap.html) и
[`copy_mapping()`](../../doc/kernel/process/syscall/fn.copy_mapping.html), ---
принимают на вход область памяти, которая должна быть выровнена на границы страниц.
В случае, когда либо её адрес либо её размер не выровнен, системные вызовы должны возвращать ошибку
[`Error::WrongAlignment`](../../doc/ku/error/enum.Error.html#variant.WrongAlignment).


### Валидация аргументов

Реализуйте функции валидации аргументов системных вызовов.


#### [`kernel::process::syscall::check_block()`](../../doc/kernel/process/syscall/fn.check_block.html)

```rust
fn check_block(
    address: usize,
    size: usize,
) -> Result<Block<Page>>
```

Проверяет, что `address` и `size` задают корректно выровненный диапазон страниц, целиком лежащий внутри одной из
[двух непрерывных половин](../../lab/book/2-mm-1-types.html#%D0%94%D0%B2%D0%B5-%D0%BF%D0%BE%D0%BB%D0%BE%D0%B2%D0%B8%D0%BD%D1%8B-%D0%B2%D0%B8%D1%80%D1%82%D1%83%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B3%D0%BE-%D0%B0%D0%B4%D1%80%D0%B5%D1%81%D0%BD%D0%BE%D0%B3%D0%BE-%D0%BF%D1%80%D0%BE%D1%81%D1%82%D1%80%D0%B0%D0%BD%D1%81%D1%82%D0%B2%D0%B0)
адресного пространства.


#### [`kernel::process::syscall::check_page_flags()`](../../doc/kernel/process/syscall/fn.check_page_flags.html)

```rust
fn check_page_flags(flags: usize) -> Result<PageTableFlags>
```

Проверяет, что `flags` задаёт валидный набор флагов отображения страниц,
в котором обязательно должны быть включены флаги присутствия страницы в памяти и
разрешения доступа для пространства пользователя.


#### [`kernel::process::syscall::check_frame()`](../../doc/kernel/process/syscall/fn.check_frame.html)

```rust
fn check_frame(
    process: &mut MutexGuard<Process>,
    page: Page,
    flags: PageTableFlags,
) -> Result<Frame>
```

Проверяет, что заданная виртуальная страница `page` отображена
в адресное пространство процесса `process` с корректно заданными флагами `flags` и
возвращает физический фрейм, в который она отображена.


#### [`kernel::process::syscall::check_process_permissions()`](../../doc/kernel/process/syscall/fn.check_process_permissions.html)

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


#### [`kernel::process::syscall::map()`](../../doc/kernel/process/syscall/fn.map.html)

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
Выбранный виртуальный адрес возвращается как результирующее значение системного вызова.
Размер при этом не возвращается, так как он должен быть равен аргументу `dst_address`.

Обратите внимание, что выбранный ядром виртуальный адрес должен быть корректно доставлен в
функцию пользователя, которая вызвала
[`lib::syscall::map()`](../../doc/lib/syscall/fn.map.html).
Референсная реализация этой функции в файле
[`user/lib/src/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/lib/src/syscall.rs)
предполагает, что ваша реализация функции
[`lib::syscall::syscall()`](../../doc/lib/syscall/fn.syscall.html)
помещает этот адрес в первый элемент возвращаемого кортежа.
Вы можете изменить это соглашение, но тогда поправьте и реализацию
[`lib::syscall::map()`](../../doc/lib/syscall/fn.map.html).

Также системный вызов
[`kernel::process::syscall::map()`](../../doc/kernel/process/syscall/fn.map.html)
должен поддерживать отсутствие флага
[`PageTableFlags::PRESENT`](../../doc/ku/memory/mmu/struct.PageTableFlags.html#associatedconstant.PRESENT)
во входном аргументе `flags`.
В этом случае происходит выделение адресного пространства --- виртуальных страниц.
Но не происходит выделения физических фреймов и их отображения.
Такой режим используется для реализации
[`lib::allocator::map::MapAllocator::reserve()`](../../doc/lib/allocator/map/struct.MapAllocator.html#method.reserve).
Сама структура
[`lib::allocator::map::MapAllocator`](../../doc/lib/allocator/map/struct.MapAllocator.html),
код которой уже написан, реализует
[знакомый](../../lab/book/4-concurrency-1-memory-allocator.html#%D0%A2%D0%B8%D0%BF%D0%B0%D0%B6-kuallocatorbigbigallocator)
вам типаж
[`ku::allocator::big::BigAllocator`](../../doc/ku/allocator/big/trait.BigAllocator.html)
через системные вызовы
[`map()`](../../doc/kernel/process/syscall/fn.map.html),
[`unmap()`](../../doc/kernel/process/syscall/fn.unmap.html) и
[`copy_mapping()`](../../doc/kernel/process/syscall/fn.copy_mapping.html).
И позволяет аллоцировать память уже в пространстве пользователя.


### [`kernel::process::syscall::unmap()`](../../doc/kernel/process/syscall/fn.unmap.html)

```rust
fn unmap(
    process: MutexGuard<Process>,
    dst_pid: usize,
    dst_address: usize,
    dst_size: usize,
) -> Result<SyscallResult>
```

Выполняет противоположную
[`kernel::process::syscall::map()`](../../doc/kernel/process/syscall/fn.map.html)
операцию --- удаляет заданный диапазон из виртуальной памяти целевого процесса.


### [`kernel::process::syscall::copy_mapping()`](../../doc/kernel/process/syscall/fn.copy_mapping.html)

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
Системный вызов должен отобразить целевой диапазон в целевой процесс с флагами `flags`.
Естественно,
[`kernel::process::syscall::copy_mapping()`](../../doc/kernel/process/syscall/fn.copy_mapping.html)
не должен допускать целевое отображение с более широким по логическим привилегиям набором флагов, чем исходное.
При этом флаги
[`PageTableFlags::WRITABLE`](../../doc/ku/memory/mmu/struct.PageTableFlags.html#associatedconstant.WRITABLE) и
[`PageTableFlags::COPY_ON_WRITE`](../../doc/ku/memory/mmu/struct.PageTableFlags.html#associatedconstant.COPY_ON_WRITE)
с точки зрения ядра имеют одинаковые логические привилегии, --- доступность страницы на запись.

После его выполнения у процессов появляется область
[разделяемой памяти](https://en.wikipedia.org/wiki/Shared_memory).

Делать этот системный вызов транзакционным не требуется, но вы можете попробовать.

> Под транзакционностью подразумевается что сначала выполняются проверки всех доступов и физических фреймов.
> И только если они прошли, начинается копирование отображения виртуальных страниц.
> То есть, либо будет скопировано отображение всех виртуальных страниц и вызов завершится успешно.
> Либо вызов вернёт ошибку, не скопировав ни одно из отображений.
> Такая реализация сложнее чем наивная, которая может скопировать часть отображений страниц,
> а после этого вернуть ошибку.
> И для неё придётся очень аккуратно работать с двумя блокировками на процессы и корректностью кода
> с точки зрения семантики владения.
>
> Чтобы реализовать транзакционность, придётся пожертвовать либо значительным дополнительным временем,
> либо дополнительным временем и значительной дополнительной памятью.
> Если вы пойдёте по пути использования дополнительной памяти, вам также придётся правильно
> ответить на вопрос в каком адресном пространстве её выделять.
> И в этом случае вам могут пригодиться:
>
> - Метод [`Vec::new_in()`](https://doc.rust-lang.org/nightly/alloc/vec/struct.Vec.html#method.new_in).
> - Вспомогательная функция [`kernel::process::syscall::check_frames(process, block, flags)`](../../doc/kernel/process/syscall/fn.check_frames.html). Она проверяет, что заданный блок виртуальных страниц `block` отображён в адресное пространство процесса `process` с корректно заданными флагами `flags`. И возвращает вектор физических фреймов, в которые отображены эти страницы.
> - Вспомогательная функция [`kernel::process::syscall::map_pages_to_frames(process, src_frames, dst_pages, flags)`](../../doc/kernel/process/syscall/fn.map_pages_to_frames.html). Она выполняет отображение `src_frames` в `dst_pages` с флагами `flags` в адресное пространство процесса `process`.


### Проверьте себя

Теперь должны заработать тесты `map_syscall_group()` и `user_space_memory_allocator()` в файле
[`kernel/tests/5-um-2-memory-allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/5-um-2-memory-allocator.rs):

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

Как видно, тест `user_space_memory_allocator()` запускает те же проверки,
что и тесты `basic()` и `grow_and_shrink()` из
[задачи про аллокатор памяти общего назначения в ядре](../../lab/book/4-concurrency-1-memory-allocator.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-1--%D0%B0%D0%BB%D0%BB%D0%BE%D0%BA%D0%B0%D1%82%D0%BE%D1%80-%D0%BF%D0%B0%D0%BC%D1%8F%D1%82%D0%B8-%D0%BE%D0%B1%D1%89%D0%B5%D0%B3%D0%BE-%D0%BD%D0%B0%D0%B7%D0%BD%D0%B0%D1%87%D0%B5%D0%BD%D0%B8%D1%8F).
Но делает это в пространстве пользователя.


### Ориентировочный объём работ этой части лабораторки

```console
 syscall.rs |  163 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------
 1 file changed, 145 insertions(+), 18 deletions(-)
```
