## Аллокатор памяти общего назначения

В этой части лабораторной работы вам нужно будет провязать
Rust'овский интерфейс аллокатора памяти общего назначения с реализованными во
[второй лабораторной работе](../../lab/book/2-mm-0-intro.html)
методами адресного пространства
[`kernel::memory::address_space::AddressSpace`](../../doc/kernel/memory/address_space/struct.AddressSpace.html).

После этого станет доступна
[`alloc`](https://doc.rust-lang.org/nightly/alloc/index.html)
часть стандартной библиотеки.
И в последующих задачах лабораторки мы сможем использовать
[`alloc::vec::Vec`](https://doc.rust-lang.org/nightly/alloc/vec/struct.Vec.html)
[`alloc::collections::vec_deque::VecDeque`](https://doc.rust-lang.org/nightly/alloc/collections/vec_deque/struct.VecDeque.html).
Что гораздо удобнее, чем методы семейства
[`AddressSpace::map_slice()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_slice).


### Типажи [`core::alloc::Allocator`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html) и [`ku::allocator::dry::DryAllocator`](../../doc/ku/allocator/dry/trait.DryAllocator.html)

Прежде всего изучите Rust'овский интерфейс аллокатора памяти общего назначения --- типаж
[`core::alloc::Allocator`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html).
Убедитесь, что вы понимаете:

- что такое [`core::alloc::Layout`](https://doc.rust-lang.org/nightly/core/alloc/struct.Layout.html);
- что такое [`core::ptr::NonNull`](https://doc.rust-lang.org/nightly/core/ptr/struct.NonNull.html);
- чем отличаются `NonNull<u8>` и `NonNull<[u8]>`.

Также изучите типаж
[`ku::allocator::dry::DryAllocator`](../../doc/ku/allocator/dry/trait.DryAllocator.html).
Он очень похож на
[`core::alloc::Allocator`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html),
и отличается только тем, что:

- Вместо двух методов [`core::alloc::Allocator::allocate()`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html#tymethod.allocate) и [`core::alloc::Allocator::allocate_zeroed()`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html#method.allocate_zeroed) имеет только один метод [`ku::allocator::dry::DryAllocator::dry_allocate()`](../../doc/ku/allocator/dry/trait.DryAllocator.html#tymethod.dry_allocate), принимающий признак необходимости занулить память [`ku::allocator::dry::Initialize`](../../doc/ku/allocator/dry/enum.Initialize.html). Это сделано, чтобы не дублировать код.
- Аналогично вместо двух методов [`core::alloc::Allocator::grow()`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html#method.grow) и [`core::alloc::Allocator::grow_zeroed()`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html#method.grow_zeroed) имеет только один метод [`ku::allocator::dry::DryAllocator::dry_grow()`](../../doc/ku/allocator/dry/trait.DryAllocator.html#tymethod.dry_grow).


### Типаж [`ku::allocator::big::BigAllocator`](../../doc/ku/allocator/big/trait.BigAllocator.html)

Мы не можем воспользоваться реализацией по умолчанию для методов
[`Allocator::grow()`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html#method.grow),
[`Allocator::grow_zeroed()`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html#method.grow_zeroed) и
[`Allocator::shrink()`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html#method.shrink).
Нам придётся переопределять их поведение, потому что мы хотим сделать следующий трюк.
При переаллокации мы не будем копировать содержимое памяти.
А вместо этого поменяем отображение физических фреймов старого блока памяти, на место нового блока памяти.

Естественно, это пройдёт только для блоков памяти, которые выровнены на границы страниц.
Интерфейс аллокации таких блоков памяти задаётся типажом
[`ku::allocator::big::BigAllocator`](../../doc/ku/allocator/big/trait.BigAllocator.html).

План состоит в том, чтобы

- Для [`kernel::memory::address_space::AddressSpace`](../../doc/kernel/memory/address_space/struct.AddressSpace.html) реализовать типаж [`ku::allocator::big::BigAllocator`](../../doc/ku/allocator/big/trait.BigAllocator.html). Этот пункт уже частично сделан, остался один метод --- [`BigAllocator::remap()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.remap)
- Для типажа [`ku::allocator::big::BigAllocator`](../../doc/ku/allocator/big/trait.BigAllocator.html) реализовать типаж [`ku::allocator::dry::DryAllocator`](../../doc/ku/allocator/dry/trait.DryAllocator.html).
- Определить тип [`kernel::allocator::memory_allocator::MemoryAllocator`](../../doc/kernel/allocator/memory_allocator/struct.MemoryAllocator.html) и реализовать для него типаж [`core::alloc::Allocator`](https://doc.rust-lang.org/nightly/core/alloc/trait.Allocator.html) через реализованный ранее [`ku::allocator::dry::DryAllocator`](../../doc/ku/allocator/dry/trait.DryAllocator.html). Этот пункт уже сделан в файле [`kernel/src/allocator/memory_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/allocator/memory_allocator.rs).

После этого станет доступен глобальный аллокатор памяти общего назначения
[`kernel::allocator::GlobalAllocator`](../../doc/kernel/allocator/struct.GlobalAllocator.html).
Он является
[`kernel::allocator::memory_allocator::MemoryAllocator`](../../doc/kernel/allocator/memory_allocator/struct.MemoryAllocator.html)
поверх базового адресного пространства
[`kernel::memory::BASE_ADDRESS_SPACE`](../../doc/kernel/memory/struct.BASE_ADDRESS_SPACE.html)
и определён в файле
[`kernel/src/allocator/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/allocator/mod.rs).


### Статистика аллокатора [`ku::allocator::info::Info`](../../doc/ku/allocator/info/struct.Info.html)

Для отладки аллокации памяти в коде присутствует сбор статистики про выполняемые аллокатором операции.
Эта статистика доступна в виде структуры [`ku::allocator::info::Info`](../../doc/ku/allocator/info/struct.Info.html).
Её поля означают следующее:
- [`Info::requested`](../../doc/ku/allocator/info/struct.Info.html#structfield.requested) --- сколько памяти в байтах было запрошено у аллокатора.
- [`Info::allocated`](../../doc/ku/allocator/info/struct.Info.html#structfield.allocated) --- сколько памяти в байтах было выделено аллокатором.
- [`Info::allocations`](../../doc/ku/allocator/info/struct.Info.html#structfield.allocations) --- количество запросов к аллокатору.
- [`Info::pages`](../../doc/ku/allocator/info/struct.Info.html#structfield.pages) --- количество виртуальных страниц, которые аллокатор выделил для удовлетворения запросов.

Каждый такой счётчик является структурой
[`ku::allocator::info::Counter`](../../doc/ku/allocator/info/struct.Counter.html),
содержащей положительную и отрицательную компоненту:

- [`Counter::positive`](../../doc/ku/allocator/info/struct.Counter.html#structfield.positive) --- суммарный размер соответствующего параметра для аллокаций.
- [`Counter::negative`](../../doc/ku/allocator/info/struct.Counter.html#structfield.negative) --- суммарный размер соответствующего параметра для деаллокаций.

То есть, например `info.allocated.positive()` выдаёт количество реально выделенных байт, `info.pages.negative()` выдаёт количество освобождённых при деаллокациях страниц, а `info.requested.balance()` выдаёт количество байт, которые были запрошена у аллокатора, но ещё не освобождены.

От этих чисел хочется интерпретируемости и соответствия естественным инвариантам.
Если количество аллокаций больше чем деаллокаций, то естественно ожидать, что какая-то память ещё занята.
А в ситуации, когда ещё и на входе и выходе балансы должны быть нулевые, это означает утечку.
Если же деаллокаций больше чем аллокаций в ситуации когда и на входе и выходе балансы должны быть нулевые,
это наталкивает на мысли о наличии какой-то серьёзной ошибки.
В частности, реаллокация учитываются как одна деаллокация полного старого блока плюс одна аллокация полного
нового блока.
Не создавайте несколько деаллокаций по кусочку старого блока при вызовах `dry_shrink()` или
фиктивных аллокаций нулевого размера.
Это сломает естественные инварианты и интерпретируемость значений
[`ku::allocator::info::Info`](../../doc/ku/allocator/info/struct.Info.html),
а также не пройдёт тесты.

Поэтому обратите внимание, как в
[`ku::allocator::info::Info`](../../doc/ku/allocator/info/struct.Info.html)
отслеживаются аллокации и деаллокации, которые выполняет ваш код.
Реализации методов
- [`ku::allocator::big::BigAllocator::reserve()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.reserve),
- [`ku::allocator::big::BigAllocator::unreserve()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.unreserve) и
- [`ku::allocator::big::BigAllocator::rereserve()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.unreserve)
для
[`kernel::memory::address_space::AddressSpace`](../../doc/kernel/memory/address_space/struct.AddressSpace.html)
сами обновляют эту статистику.
Вам остаётся только корректно позвать эти методы.

В логах эти счётчики будут печататься так:

```console
20:26:37 0 D info = { allocations: 9 - 8 = 1, requested: 284.000 KiB - 156.000 KiB = 128.000 KiB, allocated: 284.000 KiB - 156.000 KiB = 128.000 KiB, pages: 71 - 39 = 32, loss: 0 B = 0.000% }
```

Это означает, что всего было выполнено `9` аллокаций и `8` деаллокаций.
В аллокациях было суммарно запрошено `284.000 KiB`, а в деаллокациях суммарно было освобождено `156.000 KiB`,
что даёт текущее запрошенное потребление `128.000 KiB` в одной оставшейся на данный момент аллокации.
Так как аллокатор постраничный, эти величины совпадают с количеством реально выделенной памяти,
а потери на фрагментацию нулевые.


### Задача 1 --- аллокатор памяти общего назначения

Реализуйте метод
[`remap()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.remap)
типажа
[`ku::allocator::big::BigAllocator`](../../doc/ku/allocator/big/trait.BigAllocator.html)
для
[`kernel::memory::address_space::AddressSpace`](../../doc/kernel/memory/address_space/struct.AddressSpace.html)
в файле
[`kernel/src/memory/address_space.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/address_space.rs):

```rust
unsafe fn remap(&mut self, old_block: Block<Page>, new_block: Block<Page>) -> Result<()>;
```

Он перемещает отображение физических фреймов из `old_block` в `new_block`.
Если изначально `new_block` содержал отображённые страницы,
их отображение удаляется.
Физические фреймы, на которые не осталось других ссылок, освобождаются.
После работы `remap()` виртуальные адреса `old_block`
становятся недоступны.
А содержимое памяти, которое ранее было доступно через `old_block`,
становится доступным через `new_block`.
Флаги доступа при этом не меняются.

Если `old_block` и `new_block` имеют разный размер или пересекаются, метод `remap()`
возвращает ошибку
[`Error::InvalidArgument`](../../doc/ku/error/enum.Error.html#variant.InvalidArgument).

Реализуйте методы типажа
[`ku::allocator::dry::DryAllocator`](../../doc/ku/allocator/dry/trait.DryAllocator.html)
для типа, который уже реализует типаж
[`ku::allocator::big::BigAllocator`](../../doc/ku/allocator/big/trait.BigAllocator.html)
в файле
[`ku/src/allocator/big.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/allocator/big.rs).
При этом с виртуальным адресным пространством работайте через
[`ku::allocator::big::BigAllocator::reserve()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.reserve),
[`ku::allocator::big::BigAllocator::unreserve()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.unreserve) и
[`ku::allocator::big::BigAllocator::rereserve()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.unreserve).
А чтобы менять его отображение на физическую память, используете
[`ku::allocator::big::BigAllocator::map()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.map),
[`ku::allocator::big::BigAllocator::unmap()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.unmap)
и
[`ku::allocator::big::BigAllocator::remap()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.remap).
Естественно, все выдаваемые блоки памяти будут выровнены на границы страниц и по своему адресу и по размеру.

Вам могут пригодиться методы [`ku::memory::block::Block`](../../doc/ku/memory/block/struct.Block.html), например:

- [`Block::count()`](../../doc/ku/memory/block/struct.Block.html#method.count),
- [`Block::from_index()`](../../doc/ku/memory/block/struct.Block.html#method.from_index),
- [`Block::tail()`](../../doc/ku/memory/block/struct.Block.html#method.tail),
- [`Block::try_into_non_null_slice()`](../../doc/ku/memory/block/struct.Block.html#method.try_into_non_null_slice).

А также вспомогательные функции, определённые в том же файле
[`ku/src/allocator/big.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/allocator/big.rs):

- [`ku::allocator::big::try_into_block()`](../../doc/ku/allocator/big/fn.try_into_block.html)
- [`ku::allocator::big::initialize_block()`](../../doc/ku/allocator/big/fn.initialize_block.html).

В зависимости от вашей реализации `dry_shrink()`, вам может пригодиться или не пригодиться метод
[`BigAllocator::rereserve()`](../../doc/ku/allocator/big/trait.BigAllocator.html#tymethod.unreserve).

При реализации учтите, что даже если `old_layout` и `new_layout` в `dry_grow()` и `dry_shrink()` отличаются,
но при этом не отличаются соответствующие им блоки страниц `Block<Page>`,
то ничего делать не нужно.
Можно вернуть на выход срез со старым адресом, приведённый к новому размеру.
Аналогично, из `dry_shrink()` вы можете всегда возвращать срез со старым адресом и новым размером.


### Проверьте себя

Запустите тест `4-concurrency-1-memory-allocator` из файла
[`kernel/src/tests/4-concurrency-1-memory-allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/4-concurrency-1-memory-allocator.rs):

```console
$ (cd kernel; cargo test --test 4-concurrency-1-memory-allocator)
...
4_concurrency_1_memory_allocator::basic---------------------
20:26:36 0 D start_info = { allocations: 0 - 0 = 0, requested: 0 B - 0 B = 0 B, allocated: 0 B - 0 B = 0 B, pages: 0 - 0 = 0, loss: 0 B = 0.000% }
20:26:36 0 D info = { allocations: 1 - 0 = 1, requested: 4.000 KiB - 0 B = 4.000 KiB, allocated: 4.000 KiB - 0 B = 4.000 KiB, pages: 1 - 0 = 1, loss: 0 B = 0.000% }
20:26:36 0 D info_diff = { allocations: 1 - 0 = 1, requested: 4.000 KiB - 0 B = 4.000 KiB, allocated: 4.000 KiB - 0 B = 4.000 KiB, pages: 1 - 0 = 1, loss: 0 B = 0.000% }
20:26:36 0 D end_info = { allocations: 1 - 1 = 0, requested: 4.000 KiB - 4.000 KiB = 0 B, allocated: 4.000 KiB - 4.000 KiB = 0 B, pages: 1 - 1 = 0, loss: 0 B = 0.000% }
20:26:36 0 D end_info_diff = { allocations: 1 - 1 = 0, requested: 4.000 KiB - 4.000 KiB = 0 B, allocated: 4.000 KiB - 4.000 KiB = 0 B, pages: 1 - 1 = 0, loss: 0 B = 0.000% }
4_concurrency_1_memory_allocator::basic------------ [passed]

4_concurrency_1_memory_allocator::shrink_is_not_a_noop------
20:26:36 0 D old_block = [0v7FFFFFF3A000, 0v7FFFFFF3E000), size 16.000 KiB; new_block = [0v7FFFFFF3A000, 0v7FFFFFF3D000), size 12.000 KiB; no_remap_on_shrink = true
4_concurrency_1_memory_allocator::shrink_is_not_a_noop [passed]

4_concurrency_1_memory_allocator::grow_and_shrink-----------
20:26:37 0 D start_info = { allocations: 3 - 3 = 0, requested: 32.000 KiB - 32.000 KiB = 0 B, allocated: 32.000 KiB - 32.000 KiB = 0 B, pages: 8 - 8 = 0, loss: 0 B = 0.000% }
20:26:37 0 D info = { allocations: 9 - 8 = 1, requested: 284.000 KiB - 156.000 KiB = 128.000 KiB, allocated: 284.000 KiB - 156.000 KiB = 128.000 KiB, pages: 71 - 39 = 32, loss: 0 B = 0.000% }
20:26:37 0 D info_diff = { allocations: 6 - 5 = 1, requested: 252.000 KiB - 124.000 KiB = 128.000 KiB, allocated: 252.000 KiB - 124.000 KiB = 128.000 KiB, pages: 63 - 31 = 32, loss: 0 B = 0.000% }
20:26:37 0 D end_info = { allocations: 14 - 14 = 0, requested: 408.000 KiB - 408.000 KiB = 0 B, allocated: 408.000 KiB - 408.000 KiB = 0 B, pages: 102 - 102 = 0, loss: 0 B = 0.000% }
4_concurrency_1_memory_allocator::grow_and_shrink-- [passed]

4_concurrency_1_memory_allocator::paged_realloc_is_cheap----
20:26:37 0 D block = [0v7FFFFFEFA000, 0v7FFFFFEFB000), size 4.000 KiB; frames = [32538 @ 0p7F1A000 -WP]
20:26:37 0 D block = [0v7FFFFFEF7000, 0v7FFFFFEF9000), size 8.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP]
20:26:37 0 D block = [0v7FFFFFEF2000, 0v7FFFFFEF6000), size 16.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP]
20:26:37 0 D block = [0v7FFFFFEE9000, 0v7FFFFFEF1000), size 32.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEE8000), size 64.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP, 32534 @ 0p7F16000 -WP, 32527 @ 0p7F0F000 -WP, 32528 @ 0p7F10000 -WP, 32529 @ 0p7F11000 -WP, 32530 @ 0p7F12000 -WP, 32531 @ 0p7F13000 -WP, 32532 @ 0p7F14000 -WP, 32509 @ 0p7EFD000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEE7000), size 60.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP, 32534 @ 0p7F16000 -WP, 32527 @ 0p7F0F000 -WP, 32528 @ 0p7F10000 -WP, 32529 @ 0p7F11000 -WP, 32530 @ 0p7F12000 -WP, 32531 @ 0p7F13000 -WP, 32532 @ 0p7F14000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEE6000), size 56.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP, 32534 @ 0p7F16000 -WP, 32527 @ 0p7F0F000 -WP, 32528 @ 0p7F10000 -WP, 32529 @ 0p7F11000 -WP, 32530 @ 0p7F12000 -WP, 32531 @ 0p7F13000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEE5000), size 52.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP, 32534 @ 0p7F16000 -WP, 32527 @ 0p7F0F000 -WP, 32528 @ 0p7F10000 -WP, 32529 @ 0p7F11000 -WP, 32530 @ 0p7F12000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEE4000), size 48.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP, 32534 @ 0p7F16000 -WP, 32527 @ 0p7F0F000 -WP, 32528 @ 0p7F10000 -WP, 32529 @ 0p7F11000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEE3000), size 44.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP, 32534 @ 0p7F16000 -WP, 32527 @ 0p7F0F000 -WP, 32528 @ 0p7F10000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEE2000), size 40.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP, 32534 @ 0p7F16000 -WP, 32527 @ 0p7F0F000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEE1000), size 36.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP, 32534 @ 0p7F16000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEE0000), size 32.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP, 32525 @ 0p7F0D000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEDF000), size 28.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP, 32536 @ 0p7F18000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEDE000), size 24.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP, 32535 @ 0p7F17000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEDD000), size 20.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP, 32540 @ 0p7F1C000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEDC000), size 16.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP, 32533 @ 0p7F15000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEDB000), size 12.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP, 32539 @ 0p7F1B000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFEDA000), size 8.000 KiB; frames = [32538 @ 0p7F1A000 -WP, 32537 @ 0p7F19000 -WP]
20:26:37 0 D block = [0v7FFFFFED8000, 0v7FFFFFED9000), size 4.000 KiB; frames = [32538 @ 0p7F1A000 -WP]
20:26:37 0 D block = [0v1000, 0v1000), size 0 B; frames = []
4_concurrency_1_memory_allocator::paged_realloc_is_cheap [passed]
20:26:37 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/memory/address_space.rs |   22 ++++++++-
 ku/src/allocator/big.rs            |   87 +++++++++++++++++++++++++++++++------
 2 files changed, 95 insertions(+), 14 deletions(-)
```
