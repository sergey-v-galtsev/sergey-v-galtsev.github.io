## План лабораторной работы №1

Для управления памятью ядру нужна структура данных, хранящая информацию про имеющиеся физические фреймы.
Когда будет поступать запрос на выделение памяти, эта структура должна будет выдать запрошенное количество фреймов.
При освобождении фреймов же, структура должна будет обработать этот факт.
То есть, ядру понадобится аллокатор физических фреймов.

Однако, самой такой структуре нужна память.
Эту память нужно как-то выделить и учесть в самом аллокаторе памяти.
Причём выделять память под аллокатор нужно до того как он сам будет инициализирован.
Получаем замкнутый круг.

Выбираться из него будем в три этапа.

Сначала
[реализуем простой аллокатор](../../lab/book/2-mm-5-boot-frame-allocator.html)
физических фреймов
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html).
Он не будет требовать много памяти и его размер будет известен на этапе компиляции.
Этот аллокатор при инициализации должен будет учесть значительную часть свободной физической памяти.
В качестве структуры данных для учёта свободных фреймов
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)
использует пару индексов --- номер первого свободного фрейма и номер следующего за последним свободным фреймом.
При аллокации он выдаёт свободные фреймы и меняет индексы для учёта этого факта.
А вот деаллокацию он просто не поддерживает.
Использовать этот аллокатор будем только во время инициализации ядра, что подчёркивается его названием.

На втором этапе нам нужно будет
[поддержать работу с виртуальным адресным пространством](../../lab/book/2-mm-6-address-space.html),
инкапсулированную в структуру
[`AddressSpace`](../../doc/kernel/memory/struct.AddressSpace.html).
В ней вы реализуете аллокацию виртуальных страниц в адресном пространстве и страничное преобразование.
С помощью этих операций в дальнейшем можно будет аллоцировать память под структуры, размер которых не известен на этапе компиляции.

После этого
[реализуем чуть более сложный аллокатор](../../lab/book/2-mm-7-main-frame-allocator.html)
физических фреймов
[`MainFrameAllocator`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html).
Про каждый фрейм он будет помнить некоторую информацию, собранную в
[`FrameInfo`](../../doc/kernel/memory/main_frame_allocator/enum.FrameInfo.html).
Соответственно, ему потребуется целый
[срез](https://doc.rust-lang.ru/book/ch04-03-slices.html)
[`MainFrameAllocator::frame_info`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html#structfield.frame_info).
Размер этого среза зависит от доступного количества памяти в компьютере,
поэтому он не может быть инициализирован статически.
Память под него мы выделим с помощью
[`AddressSpace`](../../doc/kernel/memory/struct.AddressSpace.html)
из
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html).

Отражением этого плана в коде является функция
[`kernel::memory::init()`](../../doc/kernel/memory/fn.init.html):
```rust
fn init(boot_info: &'static BootInfo) {
    ...

    *FRAME_ALLOCATOR.lock() = FrameAllocator::Boot(
        BootFrameAllocator::new(&boot_info.memory_map)
    );

    *BASE_ADDRESS_SPACE.lock() = AddressSpace::new(phys2virt);

    *FRAME_ALLOCATOR.lock() = FrameAllocator::Main(
        main_frame_allocator::init(&boot_info.memory_map),
    );

    ...
}
```
Сначала глобальным аллокатором физических фреймов
[`FRAME_ALLOCATOR`](../../doc/kernel/memory/struct.FRAME_ALLOCATOR.html)
она делает структуру
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html).
Затем она инициализирует глобальную переменную
[`BASE_ADDRESS_SPACE`](../../doc/kernel/memory/struct.BASE_ADDRESS_SPACE.html)
для управления адресным пространством структурой
[`AddressSpace`](../../doc/kernel/memory/struct.AddressSpace.html).
Затем глобальный аллокатор физических фреймов
[`FRAME_ALLOCATOR`](../../doc/kernel/memory/struct.FRAME_ALLOCATOR.html)
меняется на структуру
[`MainFrameAllocator`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html),
которую возвращает функция
[`main_frame_allocator::init()`](../../doc/kernel/memory/main_frame_allocator/fn.init.html).

`FrameAllocator::Boot` и `FrameAllocator::Main` --- это элементы перечисления

```rust
pub enum FrameAllocator {
    Void,
    Boot(BootFrameAllocator),
    Main(MainFrameAllocator),
}
```

Они позволяют понять, какой из аллокаторов физических фреймов используется в данный момент.
