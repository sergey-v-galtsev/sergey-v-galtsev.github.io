## Основной аллокатор физических фреймов

Приступим к реализации основного аллокатора физических фреймов
[`kernel::memory::main_frame_allocator::MainFrameAllocator`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html).

Он построен на описателе физического фрейма
[`kernel::memory::main_frame_allocator::FrameInfo`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html).
Это [перечисление](https://doc.rust-lang.ru/book/ch06-01-defining-an-enum.html) с вариантами:

- [`FrameInfo::Absent`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Absent) --- этого физического фрейма нет в компьютере или же он зарезервирован, например [BIOS](https://en.wikipedia.org/wiki/BIOS) или загрузчиком [bootloader](../../doc/bootloader/index.html).
- [`FrameInfo::Free`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Free) --- этот физический фрейм свободен. Содержит поле [`FrameInfo::Free::next_free`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Free.field.next_free) с номером следующего свободного фрейма, либо `None` если это последний элемент списка. То есть, описатели свободных фреймов провязаны в односвязный [интрузивный список](https://ru.wikipedia.org/wiki/%D0%98%D0%BD%D1%82%D1%80%D1%83%D0%B7%D0%B8%D0%B2%D0%BD%D1%8B%D0%B9_%D1%81%D0%BF%D0%B8%D1%81%D0%BE%D0%BA) с номерами вместо указателей.
- [`FrameInfo::Used`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Used) --- этот физический фрейм занят. Содержит поле [`FrameInfo::Used::reference_count`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Used.field.reference_count) с количеством ссылок на описываемый фрейм.

В
[`MainFrameAllocator`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html)
все описатели физических фреймов собраны в поле
[`MainFrameAllocator::frame_info`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.frame_info).
Это срез `&[FrameInfo]` достаточного размера, чтобы хранить описатели всех физических фреймов, доступных в компьютере.
Как вы можете догадаться, этот срез выделяется с помощью
[`AddressSpace::map_slice()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_slice):
```rust
let frame_count = total_frames(memory_map);
let frame_info = BASE_ADDRESS_SPACE
    .lock()
    .map_slice(frame_count, KERNEL_RW, || FrameInfo::Absent)
    .expect("failed to allocate memory for MainFrameAllocator metadata");
```
А количество необходимых записей `frame_count` вычисляется с помощью знакомой вам
[`bootloader::bootinfo::MemoryMap`](../../doc/bootloader/bootinfo/struct.MemoryMap.html).
Эта инициализация происходит в
[`MainFrameAllocator::new()`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.new).

Поле
[`MainFrameAllocator::free_frame`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.free_frame)
содержит голову списка свободных фреймов.
А поле
[`MainFrameAllocator::free_count`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.free_count) ---
их количество.


### Задача 5 --- [`MainFrameAllocator`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html)


#### Инициализация описателей фреймов

Реализуйте [метод](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.init_frame_info)

```rust
fn MainFrameAllocator::init_frame_info(
    &mut self,
    memory_map: &MemoryMap,
    boot_frame_allocator: &BootFrameAllocator,
)
```

в файле [`kernel/src/memory/main_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/main_frame_allocator.rs).
Пройдите по `memory_map` с картой памяти [`MemoryMap`](../../doc/bootloader/bootinfo/struct.MemoryMap.html),
аналогично тому как вы делали в
[задаче 1](../../lab/book/2-mm-5-boot-frame-allocator.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-1--%D0%B8%D0%BD%D0%B8%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F-bootframeallocatornew).
Обратите внимание, что на вход метод принимает неизменяемый `boot_frame_allocator`.
Так как он неизменяемый, выделить с его помощью память не получится.
Он нужен для того, чтобы проверить, принадлежит ли данный фрейм аллокатору `boot_frame_allocator` или нет с помощью метода
[`BootFrameAllocator::is_managed()`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.is_managed).

- Если тип региона памяти не является [`MemoryRegionType::Usable`](../../doc/bootloader/bootinfo/enum.MemoryRegionType.html#variant.Usable), пометьте фрейм как [`FrameInfo::Absent`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Absent). В этом случае можно просто ничего не делать. Как вы видели, [`MainFrameAllocator::new()`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.new) при аллокации среза [`MainFrameAllocator::frame_info`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.frame_info) инициализирует его значением [`FrameInfo::Absent`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Absent).
- Если фрейм принадлежит `boot_frame_allocator`, пометьте его как занятый --- [`FrameInfo::Used`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Used), --- со счётчиком использований равным 1.
- В остальных случаях, пометьте фреймы из [`Usable`](../../doc/bootloader/bootinfo/enum.MemoryRegionType.html#variant.Usable) регионов как [`FrameInfo::Free`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Free) и провяжите их в односвязный список.

Количество найденных свободных фреймов сохраните в
[`MainFrameAllocator::free_count`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.free_count).

Вам могут пригодиться функции

- [`ku::memory::frage::Frame::from_index()`](../../doc/ku/memory/frage/struct.Frage.html#method.from_index).
- [`ku::memory::size::into_usize()`](../../doc/ku/memory/size/fn.into_usize.html).
- [`core::cmp::min()`](https://doc.rust-lang.org/nightly/core/cmp/fn.min.html).
- [`core::mem::replace()`](https://doc.rust-lang.org/nightly/core/mem/fn.replace.html).


#### Аллокация фрейма

Реализуйте [метод](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.allocate)

```rust
fn MainFrameAllocator::allocate(&mut self) -> Result<Frame>
```

в файле [`kernel/src/memory/main_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/main_frame_allocator.rs).
Он аллоцирует и возвращает свободный фрейм.
Как обычно, верните ошибку
[`Error::NoFrame`](../../doc/kernel/error/enum.Error.html#variant.NoFrame),
если свободных физических фреймов не осталось.
Чтобы долго не искать, используйте фрейм из головы списка свободных ---
[`MainFrameAllocator::free_frame`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.free_frame).
Также обновите количество оставшихся свободных фреймов [`MainFrameAllocator::free_count`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.free_count).

На всякий случай можно перепроверить, что
[`MainFrameAllocator::free_frame`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.free_frame)
соответствует записи в
[`MainFrameAllocator::frame_info`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.frame_info),
являющейся
[`FrameInfo::Free`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Free).
И запаниковать, если это не так:
```rust
panic!("your {} message {:?}", ...);
```


#### Освобождение фрейма

Реализуйте [метод](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.deallocate)

```rust
fn MainFrameAllocator::deallocate(
    &mut self,
    frame: Frame,
)
```

в файле [`kernel/src/memory/main_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/main_frame_allocator.rs).
Он уменьшает количество ссылок на данный `frame` и помечает его как
[`FrameInfo::Free`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Free),
если ссылок не осталось.
`unsafe` означает, что вызывающая функция должна гарантировать, что если ссылок на `frame` не осталось, то он больше не будет использоваться и, в частности, не участвует ни в одном
[`Mapping`](../../doc/kernel/memory/mapping/struct.Mapping.html).
Если `frame` уже является
[`FrameInfo::Free`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Free),
стоит запаниковать.

Однако освобождение фрейма, который помечен как
[`FrameInfo::Absent`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Absent) ---
корректная ситуация, паниковать не нужно.
Дело в том, что зарезервированные фреймы, которые мы так помечаем в
[`MainFrameAllocator::init_frame_info()`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.init_frame_info)
могут быть отображены в память загрузчиком
[bootloader](../../doc/bootloader/index.html).
И при копировании и освобождении
[`Mapping`](../../doc/kernel/memory/mapping/struct.Mapping.html)
мы можем попытаться поменять количество ссылок на них.
В этом случае ничего делать не нужно, фрейм должен остаться
[`FrameInfo::Absent`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Absent)
и не должен попасть в список свободных.
Так как может быть много разных причин почему он не был
[`MemoryRegionType::Usable`](../../doc/bootloader/bootinfo/enum.MemoryRegionType.html#variant.Usable).
Например, он может соответствовать микросхеме
[постоянного запоминающего устройства](https://ru.wikipedia.org/wiki/%D0%9F%D0%BE%D1%81%D1%82%D0%BE%D1%8F%D0%BD%D0%BD%D0%BE%D0%B5_%D0%B7%D0%B0%D0%BF%D0%BE%D0%BC%D0%B8%D0%BD%D0%B0%D1%8E%D1%89%D0%B5%D0%B5_%D1%83%D1%81%D1%82%D1%80%D0%BE%D0%B9%D1%81%D1%82%D0%B2%D0%BE),
которая позволяет только читать данные, и не может быть использован ядром для произвольных данных.

То же самое относится к фреймам, номера которых выходят за границы среза
[`MainFrameAllocator::frame_info`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.frame_info), ---
могут иметься зарезервированные участки памяти, которые находятся по очень большим адресам.
Один из таких участков --- область ввода--вывода через память ([Memory-mapped I/O](https://en.wikipedia.org/wiki/Memory-mapped_I/O)) для управления [контроллером прерываний APIC](https://wiki.osdev.org/APIC):
```console
15:08:28 0 I acpi_info = AcpiInfo { local_apic_address: Phys(0pFEE00000), bsp_id: 0, ap_ids: [1, 2, 3] }
15:08:28 0 I Local APIC init; cpu = 0; cpu_count = 4; local_apic_address = 0pFEE00000
```
Обратите внимание на физический адрес в районе 4 GiB --- `local_apic_address = 0pFEE00000`.
Поэтому функция
[`kernel::memory::main_frame_allocator::total_frames()`](../../doc/kernel/memory/main_frame_allocator/fn.total_frames.html)
игнорирует не
[`Usable`](../../doc/bootloader/bootinfo/enum.MemoryRegionType.html#variant.Usable) регионы,
чтобы не нужно было выделять огромный срез
[`MainFrameAllocator::frame_info`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.frame_info),
который может просто не поместится в память,
и будет содержать в основном
[`Absent`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Absent) записи.


#### Увеличение счётчика использований фрейма

Реализуйте [метод](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.reference)

```rust
fn MainFrameAllocator::reference(
    &mut self,
    frame: Frame,
)
```

в файле [`kernel/src/memory/main_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/main_frame_allocator.rs).
Он наоборот, увеличивает количество ссылок на заданный `frame`.
Если `frame` является
[`FrameInfo::Free`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Free),
стоит запаниковать.
Как и для
[`MainFrameAllocator::deallocate()`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.deallocate),
если фрейм
[`FrameInfo::Absent`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html#variant.Absent)
или выходит за границы среза
[`MainFrameAllocator::frame_info`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.frame_info) ---
это допустимая ситуация, в которой ничего делать не нужно.


#### Перенесение свободных фреймов из [`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html) в [`MainFrameAllocator`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html)

Финальный штрих --- реализация [метода](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.move_free_frames)

```rust
fn MainFrameAllocator::move_free_frames(
    &mut self,
    mut src: BootFrameAllocator,
)
```

в файле [`kernel/src/memory/main_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/main_frame_allocator.rs).
Он переносит все фреймы, которые на данный момент принадлежат
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)
и являются свободными, под управление
[`MainFrameAllocator`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html).

Для этого аллоцируйте все фреймы, оставшиеся в
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html).
Это можно сделать за один вызов метода
[`BootFrameAllocator::allocate_block()`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.allocate_block),
если передать в него весь оставшийся в
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)
свободный размер --- `src.count() * Frame::SIZE`.
Затем деаллоцируйте эти фреймы в
[`MainFrameAllocator`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html)
методом
[`MainFrameAllocator::deallocate()`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#method.deallocate).

Обратите внимание на сигнатуру `fn move_free_frames(..., src: BootFrameAllocator)`.
Она означает, что функция поглощает аргумент `src`, так как он передаётся по значению, а не по ссылке.
Вместе с тем фактом, что
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)
не является
[core::marker::Copy](https://doc.rust-lang.org/nightly/core/marker/trait.Copy.html)
типом,
это приводит к уничтожению `src` при выходе из `move_free_frames()`.
Так что Rust не даст случайно воспользоваться исходным `src`
после вызова `move_free_frames(src, ...)`.
В терминах C++ здесь работает семантика перемещения.


### Проверьте себя

Наконец можно проверить не только основной аллокатор фреймов,
но также копирование и удаление виртуальных отображений и метод
[`AddressSpace::unmap_slice()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.unmap_slice).
Запустите тест:

```console
$ (cd kernel; cargo test --test 2-mm-5-main-frame-allocator)
...
2_mm_5_main_frame_allocator::sanity_check-------------------
19:31:13 0 D free_frames = 31452; min_free_frames = 28672; qemu_memory_frames = 32768
2_mm_5_main_frame_allocator::sanity_check---------- [passed]

2_mm_5_main_frame_allocator::basic_frame_allocator_functions
19:31:13 0 D frames = [Frame(32540 @ 0p7F1C000), Frame(32539 @ 0p7F1B000)]
19:31:13 0 D reallocate_last_freed_frame = Frame(32540 @ 0p7F1C000)
2_mm_5_main_frame_allocator::basic_frame_allocator_functions [passed]

2_mm_5_main_frame_allocator::allocated_frames_are_unique----
19:31:13 0 D free_frames = 31390
19:31:13 0 D free_frames = 0
19:31:15.579 0 D free_frames = 31390
2_mm_5_main_frame_allocator::allocated_frames_are_unique [passed]

2_mm_5_main_frame_allocator::shared_memory------------------
19:31:15.613 0 D frame = Frame(32479 @ 0p7EDF000)
19:31:15.617 0 D pages = [Page(34359738111 @ 0v7FFFFFEFF000), Page(34359738112 @ 0v7FFFFFF00000)]
19:31:15.627 0 D write_ptr = 0x7ffffff00000; read_ptr = 0x7fffffeff000
19:31:15.633 0 D write_value = 0; read_value = 0
19:31:15.637 0 D write_value = 1; read_value = 1
19:31:15.643 0 D write_value = 2; read_value = 2
2_mm_5_main_frame_allocator::shared_memory--------- [passed]

2_mm_5_main_frame_allocator::duplicate_and_drop_mapping-----
19:31:15.695 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
19:31:15.705 0 I duplicate; address_space = "process" @ 0p7EDF000
19:31:15.709 0 D ptes = [PageTableEntry(2613347), PageTableEntry(2613347)]
19:31:15.715 0 D pte_addresses = [Virt(0vFFFFF000005BB008), Virt(0vFFFFF00007EE7008)]
19:31:15.725 0 I drop; address_space = "process" @ 0p7EDF000
2_mm_5_main_frame_allocator::duplicate_and_drop_mapping [passed]
19:31:15.761 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/memory/main_frame_allocator.rs |  116 ++++++++++++++++++++++++++++--
 1 file changed, 111 insertions(+), 5 deletions(-)
```
