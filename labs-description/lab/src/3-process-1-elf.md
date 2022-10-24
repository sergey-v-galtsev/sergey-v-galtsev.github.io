## Загрузка процесса в память

В Nikka ещё нет файловой системы.
Код пользовательских программ линкуется прямо в бинарник ядра макросом [`core::include_bytes!()`](https://doc.rust-lang.org/core/macro.include_bytes.html):

```rust
const LOOP_ELF: &[u8] = include_bytes!("../../../user/loop/target/kernel/debug/loop");
process::create(LOOP_ELF);
```

Первой нашей задачей будет распарсить
[ELF--файл](https://en.wikipedia.org/wiki/Executable_and_Linkable_Format)
с помощью библиотеки
[`xmas_elf`](../../doc/xmas_elf/index.html) и построить его образ в памяти.
Нам достаточно [простейшей реализации](https://wiki.osdev.org/ELF#Loading_ELF_Binaries),
которая поддерживает только статические ELF--файлы,
без [релокаций](https://wiki.osdev.org/ELF#Relocation), обработки
[секций](https://en.wikipedia.org/wiki/Executable_and_Linkable_Format#Section_header) и символов.
Она содержится в файле [`kernel/src/process/elf.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/elf.rs).
Основной является [функция](../../doc/kernel/process/elf/fn.load.html)

```rust
fn kernel::process::elf::load(
    address_space: &mut AddressSpace,
    file: &[u8],
) -> Result<Virt>
```

Она принимает на вход

- Адресное пространство `address_space` процесса, куда нужно загрузить его образ. Для упрощения реализации функции[`load()`](../../doc/kernel/process/elf/fn.load.html), вызывающая её функция гарантирует, что `address_space` является текущим адресным пространством.
- Срез `file` с записанным в памяти ELF--файлом процесса.

Из `file` она создаёт объект [`xmas_elf::ElfFile`](../../doc/xmas_elf/struct.ElfFile.html),
проходится по его
[сегментам](https://en.wikipedia.org/wiki/Executable_and_Linkable_Format#Program_header) итератором
[`ElfFile::program_iter()`](../../doc/xmas_elf/struct.ElfFile.html#method.program_iter)
и загружает в память те из них, у которых тип
[`ProgramHeader::get_type()`](../../doc/xmas_elf/program/enum.ProgramHeader.html#method.get_type)
является загружаемым ---
[`Type::Load`](../../doc/xmas_elf/program/enum.Type.html#variant.Load).
После загрузки она возвращает точку входа в загруженную программу
[`HeaderPt2::entry_point()`](../../doc/xmas_elf/header/enum.HeaderPt2.html#method.entry_point).
в виде виртуального адреса
[`Virt`](../../doc/ku/memory/addr/type.Virt.html).

Для загрузки сегмента файла она пользуется вспомогательной [функцией](../../doc/kernel/process/elf/fn.load_program_header.html)

```rust
fn kernel::process::elf::load_program_header(
    address_space: &mut AddressSpace,
    program_header: &ProgramHeader,
    file: &[u8],
    mapped_end: &mut Virt,
) -> Result<()>
```

Функция [`load_program_header()`](../../doc/kernel/process/elf/fn.load_program_header.html)
загружает в память заданный `program_header`, поддерживая `mapped_end` ---
адрес до которого (не включительно) память для загружаемого процесса уже аллоцирована.

Отслеживать конец аллоцированной части памяти `mapped_end` нужно,
так как аллоцировать и отображать память можно только постранично,
а сегменты ELF--файла могут быть невыровнены по границе страницы.
И несколько сегментов могут задевать одну и ту же страницу.
При загрузке первого из них
[`load_program_header()`](../../doc/kernel/process/elf/fn.load_program_header.html)
отобразит эту страницу в память и обновит `mapped_end`.
А при загрузке последующих по значению `mapped_end` она поймёт, что отображать страницу в память уже не нужно
и достаточно только записать в неё очередную порцию из данных из ELF--файла.

Таким образом,
[`load_program_header()`](../../doc/kernel/process/elf/fn.load_program_header.html)
делает две вещи:

- Расширяет отображённое в память пространство процесса.
- Копирует содержимое очередного сегмента `program_header` записанного в срезе `file` по смещению [`ProgramHeader::offset()`](../../doc/xmas_elf/program/enum.ProgramHeader.html#method.offset) в память по адресу [`ProgramHeader::virtual_addr()`](../../doc/xmas_elf/program/enum.ProgramHeader.html#method.virtual_addr).

Обратите внимание на то, что размер сегмента в файле
[`ProgramHeader::file_size()`](../../doc/xmas_elf/program/enum.ProgramHeader.html#method.file_size)
может быть меньше чем его размер в памяти
[`ProgramHeader::mem_size()`](../../doc/xmas_elf/program/enum.ProgramHeader.html#method.mem_size).
Тогда дополнительные байты памяти нужно занулить.
Этого требует формат ELF --- там может, например, располагаться секция
[`.bss`](https://en.wikipedia.org/wiki/.bss),
предназначенная для неинициализированных или инициализированных нулями статических данных.
Также обратите внимание, что отображать в память образ процесса нужно с флагом
[`PageTableFlags::USER_ACCESSIBLE`](../../doc/ku/memory/mmu/struct.PageTableFlags.html#associatedconstant.USER_ACCESSIBLE),
иначе он просто не заработает в пространстве пользователя,
вызвав исключение доступа к памяти --- Page Fault.

Для расширения отображения,
[`load_program_header()`](../../doc/kernel/process/elf/fn.load_program_header.html)
прибегает к помощи вспомогательной
[функции](../../doc/kernel/process/elf/fn.extend_mapping.html)

```rust
fn kernel::process::elf::extend_mapping(
    address_space: &mut AddressSpace,
    memory_block: &Block<Virt>,
    flags: Flags,
    mapped_end: &mut Virt,
) -> Result<()>
```

Кроме уже знакомых нам аргументов, функция
[`extend_mapping()`](../../doc/kernel/process/elf/fn.extend_mapping.html)
принимает

- Описатель блока виртуальной памяти `memory_block` для очередного сегмента ELF--файла.
- Флаги `flags` этого сегмента --- [`ProgramHeader::flags()`](../../doc/xmas_elf/program/enum.ProgramHeader.html#method.flags).

Для вычисления `memory_block` используется вспомогательная [функция](../../doc/kernel/process/elf/fn.memory_block.html)

```rust
fn kernel::process::elf::memory_block(
    program_header: &ProgramHeader,
) -> Result<Block<Virt>>
```


### Задача 1 --- загрузка ELF--файла

Реализуйте указанные функции.
Вам могут пригодиться:

- Метод [`fn Block::<Virt>::enclosing() -> Block<Page>`](../../doc/ku/memory/block/struct.Block.html#method.enclosing), который для заданного блока виртуальных адресов возвращает минимальный содержащий его блок страниц виртуальной памяти.
- [`Block::<Virt>::try_into_mut_slice()`](../../doc/ku/memory/block/struct.Block.html#method.try_into_mut_slice).
- Метод [`fill()`](https://doc.rust-lang.org/nightly/core/primitive.slice.html#method.fill) [срезов](https://doc.rust-lang.ru/book/ch04-03-slices.html).
- [`Result::map_err()`](https://doc.rust-lang.org/nightly/core/result/enum.Result.html#method.map_err) для преобразования одного типа ошибки в другой.
- [`Virt::new_u64()`](../../doc/ku/memory/addr/struct.Addr.html#method.new_u64).
- [`ku::memory::size::into_usize()`](../../doc/ku/memory/size/fn.into_usize.html).


### Дополнительные материалы про ELF--файлы

- [Executable and Linkable Format](https://en.wikipedia.org/wiki/Executable_and_Linkable_Format)
- [ELF](https://wiki.osdev.org/ELF)
- [ELF-64 Object File Format](https://www.uclibc.org/docs/elf-64-gen.pdf)

![](https://upload.wikimedia.org/wikipedia/commons/e/e4/ELF_Executable_and_Linkable_Format_diagram_by_Ange_Albertini.png)


### Проверьте себя

Запустите тест `3-process-1-elf` из файле [`kernel/src/tests/3-process-1-elf.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/3-process-1-elf.rs):

```console
$ (cd kernel; cargo test --test 3-process-1-elf)
...
3_process_1_elf::create_process--------------------------------
18:36:10 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
18:36:10 0 I duplicate; address_space = "process" @ 0p7F1C000
18:36:10 0 I switch to; address_space = "process" @ 0p7F1C000
18:36:10 0 D extend mapping; block = [0v10000000, 0v10006E04), size 27.504 KiB; page_block = [0v10000000, 0v10007000), size 28.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:36:10 0 D elf loadable program header; file_block = [0v2017A0, 0v2085A4), size 27.504 KiB; memory_block = [0v10000000, 0v10006E04), size 27.504 KiB; flags =   R
18:36:10 0 D extend mapping; block = [0v10007000, 0v1004EBA2), size 286.908 KiB; page_block = [0v10007000, 0v1004F000), size 288.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:36:10 0 D elf loadable program header; file_block = [0v2085B0, 0v250342), size 287.393 KiB; memory_block = [0v10006E10, 0v1004EBA2), size 287.393 KiB; flags = X R
18:36:10 0 D elf loadable program header; file_block = [0v250348, 0v250438), size 240 B; memory_block = [0v1004EBA8, 0v1004EC98), size 240 B; flags =  WR
18:36:10 0 D extend mapping; block = [0v1004F000, 0v10054980), size 22.375 KiB; page_block = [0v1004F000, 0v10055000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
18:36:10 0 D elf loadable program header; file_block = [0v250438, 0v2560F8), size 23.188 KiB; memory_block = [0v1004EC98, 0v10054980), size 23.227 KiB; flags =  WR
18:36:10 0 I switch to; address_space = "base" @ 0p1000
18:36:10 0 I loaded ELF file; context = { rip: 0v10006EC0, rsp: 0v7F7FFFFFF000 }; file_size = 5.279 MiB; process = { pid: <current>, address_space: "process" @ 0p7F1C000, { rip: 0v10006EC0, rsp: 0v7F7FFFFFF000 } }
18:36:10 0 I user process page table entry; entry_point = 0v10006EC0; frame = Frame(32512 @ 0p7F00000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
18:36:10 0 D process_frames = 126
18:36:10 0 I drop; address_space = "process" @ 0p7F1C000
3_process_1_elf::create_process----------------------- [passed]

3_process_1_elf::create_process_failure------------------------
18:36:11 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
18:36:11 0 I duplicate; address_space = "process" @ 0p7F1C000
18:36:11 0 I switch to; address_space = "process" @ 0p7F1C000
18:36:11 0 I switch to; address_space = "base" @ 0p1000
18:36:11 0 I drop the current address space; address_space = "process" @ 0p7F1C000; switch_to = "base" @ 0p1000
18:36:11 0 I expected a process creation failure; error = Elf("File is shorter than the first ELF header part")
3_process_1_elf::create_process_failure--------------- [passed]
18:36:11 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/elf.rs |   71 +++++++++++++++++++++++++++++++++++++++++++---
 1 file changed, 67 insertions(+), 4 deletions(-)
```
