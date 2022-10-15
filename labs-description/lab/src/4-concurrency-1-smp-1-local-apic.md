## Работа с local APIC

В Nikka функционал для работы с LAPIC реализован в структуре
[`kernel::smp::local_apic::LocalApic`](../../doc/kernel/smp/local_apic/struct.LocalApic.html)
в файле [`kernel/src/smp/local_apic.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/local_apic.rs).
В частности, у него есть такие статические методы:

- [`LocalApic::init()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.init) инициализирует local APIC, например включает прерывание таймера.
- [`LocalApic::id()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.id) позволяет узнать идентификатор local APIC и текущего CPU.
- [`LocalApic::send_init()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.send_init) пошлёт прерывание на AP, предназначенное для его инициализации.
- [`LocalApic::get()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.get) возвращает структуру [`LocalApic`](../../doc/kernel/smp/local_apic/struct.LocalApic.html) данного CPU.


### Задача 1 --- инициализация работы с `LocalApic`

Интерфейс для работы с local APIC в [x86-64](https://en.wikipedia.org/wiki/X86-64) представляет собой выровненную область размером 4 килобайта в физической памяти --- один физический фрейм.
Такой тип интерфейса называется
[Memory--mapped I/O](https://en.wikipedia.org/wiki/Memory-mapped_I/O) (MMIO).
Чтобы пользоваться MMIO нужно, во-первых, замапить его физический адрес в текущее виртуальное адресное пространство.
А во-вторых, указать процессору, что данный диапазон памяти не нужно кешировать.
Для этого требуется выставить флаги
[`PageTableFlags::NO_CACHE`](../../doc/ku/memory/mmu/struct.PageTableFlags.html#associatedconstant.NO_CACHE) и
[`PageTableFlags::WRITE_THROUGH`](../../doc/ku/memory/mmu/struct.PageTableFlags.html#associatedconstant.WRITE_THROUGH) в
[`PageTableEntry`](../../doc/ku/memory/mmu/struct.PageTableEntry.html).

Каждый процессор имеет собственный local APIC, потому он и называется локальным (local).
LAPIC находится на том же кристалле, что и процессор и связан с ним выделенным каналом.
А физические адреса всех LAPIC в системе совпадают.
Когда процессор обращается по физическому адресу, относящемуся к LAPIC, он использует этот выделенный канал.
И это обращение не видят другие процессоры и LAPIC в системе.
Поэтому конфликта из-за одинаковых физических адресов не происходит.
Наоборот, совпадение физических адресов всех LAPIC удобно для программиста.
Например, если программе нужно понять, на каком именно CPU она сейчас запущена ---
достаточно прочитать идентификатор LAPIC и CPU по определённому физическому адресу области MMIO LAPIC.
Это и делает метод [`LocalApic::id()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.id).

Физический адрес MMIO для local APIC предоставляет метод
[`kernel::smp::acpi_info::AcpiInfo::local_apic_address()`](../../doc/kernel/smp/acpi_info/struct.AcpiInfo.html#method.local_apic_address).
А виртуальный адрес можно было бы выбрать произвольно.
Но ядро должно этот адрес где-то запомнить, чтобы использовать для обращений в дальнейшем.
Для простоты, запишем этот адрес прямо в код.
Для этого, заведём статическую переменную
[`kernel::smp::local_apic::LOCAL_APIC`](../../doc/kernel/smp/local_apic/static.LOCAL_APIC.html),
изначально содержащую страницу нулей.
Компилятор выделит под неё страницу в памяти ядра, и настроит все обращения в коде к ней.
А мы при инициализации MMIO для local APIC удалим маппинг для этой виртуальной страницы и вместо ненужных нам нулей замапим на её виртуальный адрес физический фрейм local APIC.
Побочным результатом такого подхода будет то, что до того как мы инициализируем MMIO, метод
[`LocalApic::id()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.id)
будет выдавать 0, а не ошибку.
И функции, которые им пользуются, могут обойтись без обработки ошибки в этом случае.

Реализуйте [метод](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.map)

```rust
fn LocalApic::map(address: Phys) -> Result<()>
```

Физический адрес MMIO local APIC он принимает на вход.
А для определения нужного виртуального адреса вам пригодится функция
[`LocalApic::get()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.get).
Также могут пригодиться

- [`kernel::memory::BASE_ADDRESS_SPACE`](../../doc/kernel/memory/struct.BASE_ADDRESS_SPACE.html),
- [`kernel::memory::address_space::AddressSpace::unmap_page()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.unmap_page),
- [`kernel::memory::address_space::AddressSpace::map_page_to_frame()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_page_to_frame),
- [`kernel::memory::Frame`](../../doc/kernel/memory/type.Frame.html),
- [`kernel::memory::Page`](../../doc/kernel/memory/type.Page.html),
- [`kernel::memory::Virt`](../../doc/kernel/memory/type.Virt.html).


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/smp/local_apic.rs |   17 ++++++++++++++++-
 1 file changed, 16 insertions(+), 1 deletion(-)
```
