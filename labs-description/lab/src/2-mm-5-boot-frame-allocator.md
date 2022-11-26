## Временный аллокатор физических фреймов

В этой задаче реализуем простой аллокатор физических фреймов
[`kernel::memory::boot_frame_allocator::BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html).
В качестве структуры данных для учёта свободных фреймов
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)
использует поле
[`BootFrameAllocator::block`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#structfield.block)
типа
[`Block`](../../doc/ku/memory/block/struct.Block.html)`<`[`Frame`](../../doc/ku/memory/frage/type.Frame.html)`>`.
[`BootFrameAllocator::block`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#structfield.block)
содержит полуоткрытый интервал свободных фреймов.

Поле
[`BootFrameAllocator::initial_block`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#structfield.initial_block)
содержит копию стартового значение поля
[`BootFrameAllocator::block`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#structfield.block).
И не меняется при аллокациях, в отличие от
[`BootFrameAllocator::block`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#structfield.block).
Оно используется в методе
[`BootFrameAllocator::is_managed()`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.is_managed)
для определения, что заданный фрейм принадлежит этому аллокатору, вне зависимости от того был ли он уже аллоцирован или нет.
Дело в том, что
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)
не будет учитывать все доступные физические фреймы, а только некоторый непрерывный их блок.
Потому что есть зарезервированные области физической памяти, которые мы не можем выделять.
А отслеживать несколько областей свободной или занятой памяти
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)
не может в силу своей простоты.

Параметр `T` обобщённого типа [`Block<T>`](../../doc/ku/memory/block/struct.Block.html)
и соответствующее фантомное, не занимающее памяти, поле
[`Block::tag`](../../doc/ku/memory/block/struct.Block.html#structfield.tag)
служат той же цели, что и в
[`Addr`](../../doc/ku/memory/addr/struct.Addr.html)`<T: `[`Tag`](../../doc/ku/memory/addr/trait.Tag.html)`>` ---
сделать блоки с разными параметрами `T` несовместимыми.
Поэтому `Block<Frame>` будет несовместим с `Block<Page>` и компилятор не даст их перепутать.
Подробнее про тип этого фантомного тега можно посмотреть в документации ---
[`core::marker::PhantomData`](https://doc.rust-lang.org/nightly/core/marker/struct.PhantomData.html).

Библиотека [`bootloader`](../../doc/bootloader/index.html), которую мы используем для загрузки ОС,
получает от [BIOS](https://wiki.osdev.org/BIOS) или [UEFI](https://wiki.osdev.org/UEFI)
информацию о физической памяти компьютера.
Этот процесс состоит из нескольких наслоений легаси.
Подробнее о том, как он устроен можно посмотреть [тут](https://wiki.osdev.org/Detecting_Memory_(x86)).
А ориентировочную карту зарезервированных областей --- [тут](https://wiki.osdev.org/Memory_Map_(x86)).
К счастью,
[`bootloader`](../../doc/bootloader/index.html)
скрывает от нас это легаси и предоставляет готовую структуру
[`bootloader::bootinfo::MemoryMap`](../../doc/bootloader/bootinfo/struct.MemoryMap.html),
которая описывает карту доступной физической памяти.
Структура [`MemoryMap`](../../doc/bootloader/bootinfo/struct.MemoryMap.html)
[реализует](../../doc/bootloader/bootinfo/struct.MemoryMap.html#impl-Deref) типаж
[`core::ops::Deref`](https://doc.rust-lang.org/nightly/core/ops/trait.Deref.html),
[возвращая из него](../../doc/bootloader/bootinfo/struct.MemoryMap.html#associatedtype.Target)
массив структур
[`bootloader::bootinfo::MemoryRegion`](../../doc/bootloader/bootinfo/struct.MemoryRegion.html).
Это означает, что если мы напишем
```rust
impl BootFrameAllocator {
    fn new(memory_map: &MemoryMap) -> Self {
        for region in memory_map.iter() {
            ...
        }
    }
}
```
переменная `region` пробежится по всем
[`MemoryRegion`](../../doc/bootloader/bootinfo/struct.MemoryRegion.html)
в
[`MemoryMap`](../../doc/bootloader/bootinfo/struct.MemoryMap.html).
В каждом из них есть поле
[`MemoryRegion::region_type`](../../doc/bootloader/bootinfo/struct.MemoryRegion.html#structfield.region_type),
которое равно
[`MemoryRegionType::Usable`](../../doc/bootloader/bootinfo/enum.MemoryRegionType.html#variant.Usable)
для незанятых диапазонов физической памяти.
Нас будут интересовать только они.
Кроме того, в
[`MemoryRegion`](../../doc/bootloader/bootinfo/struct.MemoryRegion.html)
есть поле
[`MemoryRegion::range`](../../doc/bootloader/bootinfo/struct.MemoryRegion.html#structfield.range)
типа
[`bootloader::bootinfo::FrameRange`](../../doc/bootloader/bootinfo/struct.FrameRange.html),
которе устроено аналогично
[`Block<Frame>`](../../doc/ku/memory/block/struct.Block.html)
и содержит поля
[`FrameRange::start_frame_number`](../../doc/bootloader/bootinfo/struct.FrameRange.html#structfield.start_frame_number) и
[`FrameRange::end_frame_number`](../../doc/bootloader/bootinfo/struct.FrameRange.html#structfield.end_frame_number).
Они соответствуют
[`Block::<Frame>::start`](../../doc/ku/memory/block/struct.Block.html#structfield.start) и
[`Block::<Frame>::end`](../../doc/ku/memory/block/struct.Block.html#structfield.end).
Из пары
[`FrameRange::start_frame_number`](../../doc/bootloader/bootinfo/struct.FrameRange.html#structfield.start_frame_number) и
[`FrameRange::end_frame_number`](../../doc/bootloader/bootinfo/struct.FrameRange.html#structfield.end_frame_number),
можно сделать соответствующий
[`Block::<Frame>`](../../doc/ku/memory/block/struct.Block.html)
с помощью метода
[`Block::<Frame>::new_u64(start, end)`](../../doc/ku/memory/block/struct.Block.html#method.new_u64).


### Задача 1 --- [`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)


#### Инициализация

Напишите реализацию [метода](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.new)

```rust
fn BootFrameAllocator::new(
    memory_map: &MemoryMap,
) -> BootFrameAllocator
```

в файле [`kernel/src/memory/boot_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/boot_frame_allocator.rs).
Он должен вернуть заполненную структуру
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html),
содержащую блок свободных фреймов по информации из `memory_map`.
Выберете самый большой блок подряд идущих свободных фреймов.

Заметьте, что внутри `impl BootFrameAllocator { ... }` вы можете называть тип `BootFrameAllocator` через его синоним `Self`.

Также обратите внимание, что в отличие от C++, параметр обобщённого типа нужно в общем случае предварять двойным двоеточием --- `Block::<Frame>`.
В некоторых контекстах двойное двоеточие можно опустить и написать как в C++ --- `Block<Frame>`.
Если вы не напишете `::` в случаях, когда оно обязательно, компилятор выдаст ошибку:
```console
error: comparison operators cannot be chained
  --> src/memory/boot_frame_allocator.rs:34:39
   |
34 |                 memory_region = %Block<Frame>::new_u64(start, end),
   |                                       ^     ^
   |
help: use `::<...>` instead of `<...>` to specify type or const arguments
   |
34 |                 memory_region = %Block::<Frame>::new_u64(start, end),
   |                                       ++

```
Но чаще всего вам не потребуется указывать шаблонный параметр вообще.
Rust использует
[достаточно мощный алгоритм вывода типов](https://ru.wikipedia.org/wiki/%D0%92%D1%8B%D0%B2%D0%BE%D0%B4_%D1%82%D0%B8%D0%BF%D0%BE%D0%B2#%D0%90%D0%BB%D0%B3%D0%BE%D1%80%D0%B8%D1%82%D0%BC_%D0%A5%D0%B8%D0%BD%D0%B4%D0%BB%D0%B8_%E2%80%94_%D0%9C%D0%B8%D0%BB%D0%BD%D0%B5%D1%80%D0%B0)
и если вы напишите что-нибудь вроде
```rust
fn new(memory_map: &MemoryMap) -> Self {
    ...
    let block = Block::new_u64(start, end);
    ...
    Self {
        block,
        initial_block: block,
    }
}
```
явно указывать `::<Frame>` не потребуется.
Если же Rust не сможет вывести опущенный параметр обобщённого типа, он выдаст сообщение об ошибке:
```const
error[E0282]: type annotations needed
  --> src/memory/boot_frame_allocator.rs:33:34
   |
33 |                 memory_region = %Block::new_u64(start, end),
   |                                  ^^^^^^^^^^^^^^ cannot infer type for type parameter `T`

For more information about this error, try `rustc --explain E0282`.
```
На этом примере также видно, что при инициализации поля структуры из переменной с таким же именем,
[это имя можно не дублировать](https://doc.rust-lang.ru/book/ch05-01-defining-structs.html#%D0%98%D1%81%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5-%D1%81%D0%BE%D0%BA%D1%80%D0%B0%D1%89%D1%91%D0%BD%D0%BD%D0%BE%D0%B9-%D0%B8%D0%BD%D0%B8%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D0%B8-%D0%BF%D0%BE%D0%BB%D1%8F).

Теперь должен проходить тест `2_mm_1_boot_frame_allocator::sanity_check`, но не остальные тесты из `2-mm-1-boot-frame-allocator`:

```console
$ (cd kernel; cargo test --test 2-mm-1-boot-frame-allocator)
...
2_mm_1_boot_frame_allocator::sanity_check-------------------
17:20:21 0 D free_frames = 31290; min_free_frames = 28672; qemu_memory_frames = 32768
17:20:21 0 D managed = 31290; used = 0
2_mm_1_boot_frame_allocator::sanity_check---------- [passed]

2_mm_1_boot_frame_allocator::allocate-----------------------
panicked at 'not implemented', kernel/src/memory/boot_frame_allocator.rs:71:9
--------------------------------------------------- [failed]
17:20:21 0 I exit qemu; exit_code = FAILURE
```


#### Аллокация физических фреймов

Для аллокации фреймов служат два метода:
- [`fn BootFrameAllocator::allocate_block(size: usize) -> Result<Block<Frame>>`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.allocate_block) выделяет блок подряд идущих фреймов, достаточный для хранения объекта размером `size` **байт**.
- [`fn BootFrameAllocator::allocate() -> Result<Frame>`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.allocate) выделяет ровно один фрейм.

Оба метода заворачивают свой результат в [`kernel::error::Result`](../../doc/kernel/error/type.Result.html).
Если в
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)
осталось меньше свободных фреймов, чем было запрошено, они не меняют состояние
[`BootFrameAllocator::block`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#structfield.block)
и возвращают ошибку
[`kernel::error::Error::NoFrame`](../../doc/kernel/error/enum.Error.html#variant.NoFrame).

Реализуйте [метод](../../doc/ku/memory/block/struct.Block.html#method.tail)

```rust
fn Block::tail(&mut self, count: usize) -> Option<Self>
```

в файле [`ku/src/memory/block.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/memory/block.rs).
Он должен разделить блок `self` на две дизъюнктные части:
- новое значение `self` и
- новый [`Block`](../../doc/ku/memory/block/struct.Block.html) размером `count` единиц.

То есть, от существующего блока он откусывает хвост с заданным количеством единиц, и возвращает его в виде нового блока `Self::new(...)`, завернув в
[`core::option::Option::Some`](https://doc.rust-lang.org/nightly/core/option/enum.Option.html#variant.Some):
`Some(Self::new(...))`.
Если в исходном блоке нет запрошенного количества, не меняйте его и верните
[`core::option::Option::None`](https://doc.rust-lang.org/nightly/core/option/enum.Option.html#variant.None), например
```rust
pub fn tail(&mut self, count: usize) -> Option<Self> {
    ...
    return None;
    ...
}
```
или просто `None`, если это последнее выражение в функции:
```rust
pub fn tail(&mut self, count: usize) -> Option<Self> {
    ...
    None
}
```
Проверьте свою реализацию запустив тест:
```console
$ (cd kernel; cargo test --test 2-mm-1-block)
...
2_mm_1_block::block-----------------------------------------
17:21:00 0 D start = 0; end = 0; block = [0v0, 0v0), size 0 B
17:21:00 0 D start = 0; end = 33; block = [0v0, 0v21), size 33 B
17:21:00 0 D start = 0; end = 66; block = [0v0, 0v42), size 66 B
17:21:00 0 D start = 0; end = 99; block = [0v0, 0v63), size 99 B
17:21:00 0 D start = 25; end = 33; block = [0v19, 0v21), size 8 B
17:21:00 0 D start = 25; end = 66; block = [0v19, 0v42), size 41 B
17:21:00 0 D start = 25; end = 99; block = [0v19, 0v63), size 74 B
17:21:01 0 D start = 50; end = 66; block = [0v32, 0v42), size 16 B
17:21:01 0 D start = 50; end = 99; block = [0v32, 0v63), size 49 B
17:21:01 0 D start = 50; end = 132; block = [0v32, 0v84), size 82 B
17:21:01 0 D start = 75; end = 99; block = [0v4B, 0v63), size 24 B
17:21:01 0 D start = 75; end = 132; block = [0v4B, 0v84), size 57 B
17:21:01 0 D start = 75; end = 165; block = [0v4B, 0vA5), size 90 B
2_mm_1_block::block-------------------------------- [passed]
17:21:01 0 I exit qemu; exit_code = SUCCESS
```

Применив [`Block::tail()`](../../doc/ku/memory/block/struct.Block.html#method.tail)
к полю
[`BootFrameAllocator::block`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#structfield.block)
реализуйте [метод](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.allocate_block)

```rust
fn BootFrameAllocator::allocate_block(
    size: usize,
) -> Result<Block<Frame>>
```

в файле [`kernel/src/memory/boot_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/boot_frame_allocator.rs).
Превратить
[`Option::None`](https://doc.rust-lang.org/nightly/core/option/enum.Option.html#variant.None)
в
[`Error::NoFrame`](../../doc/kernel/error/enum.Error.html#variant.NoFrame)
можно с помощью метода
[`Option::ok_or()`](https://doc.rust-lang.org/nightly/core/option/enum.Option.html#method.ok_or):
```rust
fn allocate_block(&mut self, size: usize) -> Result<Block<Frame>> {
    ...
    tail.ok_or(NoFrame)
}
```
Если вы забудете превратить `Option` в `Result` и используете оператор `?`, Rust выдаст сообщение об ошибке "the `?` operator can only be used in a function that returns `Result` or `Option`".
```
error[E0277]: the `?` operator can only be used in a method that returns `Result` or `Option` (or another type that implements `FromResidual`)
  --> kernel/src/memory/boot_frame_allocator.rs:61:41
   |
59 | /     pub(super) fn allocate_block(&mut self, size: usize) -> Result<Block<Frame>> {
60 | |         ...
61 | |         ...?
   | |            ^ cannot use the `?` operator in a method that returns `Result<Block<Frage<PhysTag>>, ku::Error>`
62 | |     }
   | |_____- this function should return `Result` or `Option` to accept `?`
   |
   = help: the trait `FromResidual<core::option::Option<Infallible>>` is not implemented for `Result<Block<Frage<PhysTag>>, ku::Error>`
   = help: the following other types implement trait `FromResidual<R>`:
             <Result<T, F> as FromResidual<Result<Infallible, E>>>
             <Result<T, F> as FromResidual<Yeet<E>>>

For more information about this error, try `rustc --explain E0277`.
```
Аналогичная ошибка будет при применении оператора `?` к `Result`, если функция возвращает `Option`.

Вам может пригодиться функция
[`fn Frame::count_up(size: usize) -> usize`](../../doc/kernel/memory/frage/struct.Frage.html#method.count_up).
Она реализует формулу \\( \lceil \frac{\texttt{size}}{\texttt{Frame::SIZE}} \rceil \\),
возвращая количество фреймов, которое требуется для хранения `size` байт.

Используя [`BootFrameAllocator::allocate_block()`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.allocate_block)
реализуйте [метод](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.allocate)

```rust
fn BootFrameAllocator::allocate() -> Result<Frame>
```

в файле [`kernel/src/memory/boot_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/boot_frame_allocator.rs).


### Проверьте себя

Запустите тесты:

```console
$ (cd kernel; cargo test --test 2-mm-1-block --test 2-mm-1-boot-frame-allocator)
...
2_mm_1_block::block-----------------------------------------
17:38:22 0 D start = 0; end = 0; block = [0v0, 0v0), size 0 B
17:38:22 0 D start = 0; end = 33; block = [0v0, 0v21), size 33 B
17:38:22 0 D start = 0; end = 66; block = [0v0, 0v42), size 66 B
17:38:22 0 D start = 0; end = 99; block = [0v0, 0v63), size 99 B
17:38:22 0 D start = 25; end = 33; block = [0v19, 0v21), size 8 B
17:38:22 0 D start = 25; end = 66; block = [0v19, 0v42), size 41 B
17:38:22 0 D start = 25; end = 99; block = [0v19, 0v63), size 74 B
17:38:23 0 D start = 50; end = 66; block = [0v32, 0v42), size 16 B
17:38:23 0 D start = 50; end = 99; block = [0v32, 0v63), size 49 B
17:38:23 0 D start = 50; end = 132; block = [0v32, 0v84), size 82 B
17:38:23 0 D start = 75; end = 99; block = [0v4B, 0v63), size 24 B
17:38:23 0 D start = 75; end = 132; block = [0v4B, 0v84), size 57 B
17:38:23 0 D start = 75; end = 165; block = [0v4B, 0vA5), size 90 B
2_mm_1_block::block-------------------------------- [passed]
17:38:23 0 I exit qemu; exit_code = SUCCESS
...
2_mm_1_boot_frame_allocator::sanity_check-------------------
17:38:25 0 D free_frames = 31306; min_free_frames = 28672; qemu_memory_frames = 32768
17:38:25 0 D managed = 31306; used = 0
2_mm_1_boot_frame_allocator::sanity_check---------- [passed]

2_mm_1_boot_frame_allocator::allocate-----------------------
17:38:25 0 D frames = [Frame(32735 @ 0p7FDF000), Frame(32734 @ 0p7FDE000)]
2_mm_1_boot_frame_allocator::allocate-------------- [passed]

2_mm_1_boot_frame_allocator::allocated_frames_are_unique----
17:38:25 0 D free_frames = 31304
17:38:25 0 D prev_frame = 32733 @ 0p7FDD000; frame = 32732 @ 0p7FDC000
17:38:25 0 D prev_frame = 22733 @ 0p58CD000; frame = 22732 @ 0p58CC000
17:38:26 0 D prev_frame = 12733 @ 0p31BD000; frame = 12732 @ 0p31BC000
17:38:26 0 D prev_frame = 2733 @ 0pAAD000; frame = 2732 @ 0pAAC000
2_mm_1_boot_frame_allocator::allocated_frames_are_unique [passed]
17:38:26 0 I exit qemu; exit_code = SUCCESS
```


### Использование аллокатора физических фреймов

Ядро выделяет физические фреймы с помощью глобальной переменной
[`kernel::memory::FRAME_ALLOCATOR`](../../doc/kernel/memory/struct.FRAME_ALLOCATOR.html).
Это
[`kernel::memory::FrameAllocator`](../../doc/kernel/memory/enum.FrameAllocator.html),
обёрнутый в спинлок
[`spin::mutex::Mutex`](../../doc/spin/mutex/struct.Mutex.html) ---
[`Mutex`](../../doc/spin/mutex/struct.Mutex.html)`<`[`FrameAllocator`](../../doc/kernel/memory/enum.FrameAllocator.html)`>`.
Чтобы работать с
[`FRAME_ALLOCATOR`](../../doc/kernel/memory/struct.FRAME_ALLOCATOR.html),
нужно сначала захватить блокировку методом
[`Mutex::lock()`](../../doc/spin/mutex/struct.Mutex.html#method.lock),
а затем уже вызвать подходящий метод
[`FrameAllocator`](../../doc/kernel/memory/enum.FrameAllocator.html),
например
[`FrameAllocator::allocate()`](../../doc/kernel/memory/enum.FrameAllocator.html#method.allocate).
Метод
[`Mutex::lock()`](../../doc/spin/mutex/struct.Mutex.html#method.lock)
возвращает
[`spin::mutex::MutexGuard`](../../doc/spin/mutex/struct.MutexGuard.html)
который:

- За [счёт](../../doc/spin/mutex/struct.MutexGuard.html#impl-Deref) [реализации](../../doc/spin/mutex/struct.MutexGuard.html#impl-DerefMut) типажей [`core::ops::Deref`](https://doc.rust-lang.org/nightly/core/ops/trait.Deref.html) и [`core::ops::DerefMut`](https://doc.rust-lang.org/nightly/core/ops/trait.DerefMut.html) предоставляет прозрачный доступ к внутреннему [`FrameAllocator`](../../doc/kernel/memory/enum.FrameAllocator.html).
- При разрушении, например при выходе из своей зоны видимости или [явном вызове `drop(guard)`](../../doc/spin/mutex/struct.Mutex.html#thread-safety-example), автоматически освобождает захваченную блокировку.

Пример использования с блокировками, которые освобождаются сразу, в том же выражении, есть в тестах [`kernel/tests/memory.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/memory.rs):
```rust
    let frame = FRAME_ALLOCATOR
        .lock()
        .allocate()
        .expect("failed to allocate a frame");

    debug!(?frame);

    FRAME_ALLOCATOR
        .lock()
        .reference(frame);
```

Сам
[`FrameAllocator`](../../doc/kernel/memory/enum.FrameAllocator.html)
определён в файле [`kernel/src/memory/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/mod.rs)
как один из трёх вариантов:
```rust
pub enum FrameAllocator {
    Void,
    Boot(BootFrameAllocator),
    Main(MainFrameAllocator),
}
```

- [`FrameAllocator::Void`](../../doc/kernel/memory/enum.FrameAllocator.html#variant.Void) означает что пока что никакой реализации не доступно и аллокация приведёт к ошибке [`Error::NoFrame`](../../doc/kernel/error/enum.Error.html#variant.NoFrame).
- [`FrameAllocator::Boot`](../../doc/kernel/memory/enum.FrameAllocator.html#variant.Boot) --- аллокации фреймов будут происходить из написанного вами в задачах 1 и 2 [`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html).
- [`FrameAllocator::Main`](../../doc/kernel/memory/enum.FrameAllocator.html#variant.Main) --- используется основной аллокатор фреймов, который [вы реализуете позже](../../lab/book/2-mm-7-main-frame-allocator.html).

Соответственно реализация, например, метода
[`FrameAllocator::allocate()`](../../doc/kernel/memory/enum.FrameAllocator.html#method.allocate) ---
это простая диспетчеризация:
```rust
impl FrameAllocator {
    ...
    pub fn allocate(&mut self) -> Result<Frame> {
        match self {
            FrameAllocator::Void => Err(NoFrame),
            FrameAllocator::Boot(boot_allocator) => boot_allocator.allocate(),
            FrameAllocator::Main(main_allocator) => main_allocator.allocate(),
        }
    }
    ...
}
```
Другие методы
[`FrameAllocator`](../../doc/kernel/memory/enum.FrameAllocator.html)
реализованы аналогично.

Если взглянуть на наш план функции
[`kernel::memory::init()`](../../doc/kernel/memory/fn.init.html)
ещё раз:
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
Видно, что после строчки `*FRAME_ALLOCATOR.lock() = FrameAllocator::Boot(...)` становится доступна
аллокация физических фреймов.
Которой пользуются `AddressSpace` и `main_frame_allocator::init()`.
А потом глобальный аллокатор переключается на основной: `*FRAME_ALLOCATOR.lock() = FrameAllocator::Main(...)` и
больше
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html)
не используется.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/memory/boot_frame_allocator.rs |   45 +++++++++++++++++++++++++++---
 ku/src/memory/block.rs                    |    8 ++++-
 2 files changed, 48 insertions(+), 5 deletions(-)
```
