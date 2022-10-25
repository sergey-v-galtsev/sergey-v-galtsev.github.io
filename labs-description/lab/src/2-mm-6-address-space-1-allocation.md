## Аллокатор виртуальных страниц адресного пространства

За выделение последовательно идущих виртуальных страниц отвечает
[`kernel::memory::page_allocator::PageAllocator`](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html).
Он устроен столь же просто, как уже знакомый нам
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html).
У него есть
[`PageAllocator::block`](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html#structfield.block) ---
[`Block<Page>`](../../doc/ku/memory/block/struct.Block.html),
из которого он выделяет блоки страниц уже реализованной нами функцией
[`Block::tail()`](../../doc/ku/memory/block/struct.Block.html#method.tail).

Инициализировать же
[`PageAllocator::block`](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html#structfield.block)
предлагается следующим способом.
Пройдём по таблице страниц корневого уровня.
Пусть, например, оказалось, что запись номер \\( 17 \\) корневого уровня свободна.
Тогда свободны все виртуальные адреса в полуинтервале
\\( [17 \cdot 2^{9 + 9 + 9 + 12}, 18 \cdot 2^{9 + 9 + 9 + 12}) \\).
Это дает \\( 2^{9 + 9 + 9} \\) свободных виртуальных страниц,
то есть 512 GiB адресного пространства на каждую такую запись.
Действительно, каждая запись в узле таблицы страниц на уровне
[`ku::memory::mmu::PAGE_TABLE_LEAF_LEVEL`](../../doc/ku/memory/mmu/constant.PAGE_TABLE_LEAF_LEVEL.html)`== 0`
ссылается на виртуальную страницу, то есть ссылается на блок памяти размера 4KiB или \\( 2^{12} \\) байт.
Каждая запись в узле более высокого уровня ссылается на
[`ku::memory::mmu::PAGE_TABLE_ENTRY_COUNT`](../../doc/ku/memory/mmu/constant.PAGE_TABLE_ENTRY_COUNT.html)
записей более низкого уровня.
То есть через неё адресуется в
[`ku::memory::mmu::PAGE_TABLE_ENTRY_COUNT`](../../doc/ku/memory/mmu/constant.PAGE_TABLE_ENTRY_COUNT.html)`== 512`,
или в \\( 2^{9} \\),
раз больше байт.
Поэтому, если
[`ku::memory::mmu::PAGE_TABLE_ROOT_LEVEL`](../../doc/ku/memory/mmu/constant.PAGE_TABLE_ROOT_LEVEL.html)`== 3`,
то всего выходит 512 * 512 * 512 * 4KiB = 512 GiB, или \\( 2^{9 + 9 + 9 + 12} \\) байт.
Найдем в таблице страниц корневого уровня самую длинную последовательность подряд идущих свободных записей ---
добудем много подряд идущих свободных виртуальных страниц.
Почти все \\( 2^9 \\) записи корневого уровня свободны,
а значит получаем почти по 128 TiB непрерывного свободного адресного пространства в каждой из
[двух половин](../../lab/book/2-mm-1-types.html#%D0%94%D0%B2%D0%B5-%D0%BF%D0%BE%D0%BB%D0%BE%D0%B2%D0%B8%D0%BD%D1%8B-%D0%B2%D0%B8%D1%80%D1%82%D1%83%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B3%D0%BE-%D0%B0%D0%B4%D1%80%D0%B5%D1%81%D0%BD%D0%BE%D0%B3%D0%BE-%D0%BF%D1%80%D0%BE%D1%81%D1%82%D1%80%D0%B0%D0%BD%D1%81%D1%82%D0%B2%D0%B0).
При этом рассматривать будем только записи корневого узла таблицы страниц,
спускаться на следующие уровни не будем.

Для простоты реализации
[`PageAllocator`](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html)
не умеет ничего освобождать, как и
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html).
Но в отличие от физических фреймов, виртуальных страниц гораздо больше --- сотни TiB, и они не потребляют память.
Кроме того, адресное пространство будет отдельное на каждый процесс.
И даже если процесс исчерпает все виртуальные страницы своего адресного пространства,
на другие процессы это не повлияет.
Поэтому с такой реализацией аллокатора страниц проблем не возникнет.
В отличие от
[`BootFrameAllocator`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html),
который нам придётся заменить на
[`MainFrameAllocator`](../../doc/kernel/memory/main_frame_allocator/struct.MainFrameAllocator.html).


### Задача 2 --- [`PageAllocator`](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html)


#### Инициализация аллокатора страниц

Реализуйте вспомогательную [функцию](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html#method.find_unused_block)

```rust
fn PageAllocator::find_unused_block(page_directory: &PageTable) -> Option<Block<Page>>
```

в файле [`kernel/src/memory/page_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/page_allocator.rs).
Эта функция принимает на вход таблицу страниц
[`ku::memory::mmu::PageTable`](../../doc/ku/memory/mmu/type.PageTable.html)
корневого уровня и должна вернуть блок страниц
[`Block<Page>`](../../doc/ku/memory/block/struct.Block.html),
соответствующий самой длинной последовательности пустых записей в `page_directory`.
Если все записи заняты, верните `None`.

Узел дерева многоуровневой таблицы страниц
[`PageTable`](../../doc/ku/memory/mmu/type.PageTable.html)
это просто массив из
[`ku::memory::mmu::PAGE_TABLE_ENTRY_COUNT`](../../doc/ku/memory/mmu/constant.PAGE_TABLE_ENTRY_COUNT.html)
элементов типа
[`ku::memory::mmu::PageTableEntry`](../../doc/ku/memory/mmu/struct.PageTableEntry.html).
С
[`PageTableEntry`](../../doc/ku/memory/mmu/struct.PageTableEntry.html)
мы будем ещё много работать.
Пока что скорее всего хватит её метода
[`fn PageTableEntry::present(&self) -> bool`](../../doc/ku/memory/mmu/struct.PageTableEntry.html#method.present).
Он возвращает `true`, если запись используется.

Вам может пригодиться константа
[`ku::memory::mmu::PAGE_TABLE_ROOT_LEVEL`](../../doc/ku/memory/mmu/constant.PAGE_TABLE_ROOT_LEVEL.html) ---
номер корневого уровня таблицы страниц, если считать листьевой уровень
[`ku::memory::mmu::PAGE_TABLE_LEAF_LEVEL`](../../doc/ku/memory/mmu/constant.PAGE_TABLE_LEAF_LEVEL.html)
с записями про отдельные страницы нулевым.
Также могут пригодиться и
[другие константы](../../doc/ku/memory/mmu/index.html#constants)
из файла [`ku/src/memory/mmu.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/memory/mmu.rs)

Вспомните про [две половины виртуального адресного пространства](2-mm-1-types.html#%D0%94%D0%B2%D0%B5-%D0%BF%D0%BE%D0%BB%D0%BE%D0%B2%D0%B8%D0%BD%D1%8B-%D0%B2%D0%B8%D1%80%D1%82%D1%83%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B3%D0%BE-%D0%B0%D0%B4%D1%80%D0%B5%D1%81%D0%BD%D0%BE%D0%B3%D0%BE-%D0%BF%D1%80%D0%BE%D1%81%D1%82%D1%80%D0%B0%D0%BD%D1%81%D1%82%D0%B2%D0%B0).
Используйте только одну из них.
Учтите, что при выборе половины со старшими адресами --- `0vFFFF_...` --- читать адреса в логах
может быть менее удобно.

При инициализации ядра
[`PageAllocator`](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html)
залогирует примерно такое сообщение:
```console
15:08:28 0 I page allocator init; free_page_count = 33822867456; block = [2.000 TiB, 128.000 TiB), size 126.000 TiB
```


#### Аллокация виртуальных страниц

Применив [`Block::tail()`](../../doc/ku/memory/block/struct.Block.html#method.tail)
к полю
[`PageAllocator::block`](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html#structfield.block)
реализуйте [метод](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html#method.allocate)

```rust
fn PageAllocator::allocate(&mut self, size: usize) -> Result<Block<Page>>
```

в файле [`kernel/src/memory/page_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/page_allocator.rs).
Она принимает размер **в байтах** и возвращает блок свободных виртуальных страниц
[`Block<Page>`](../../doc/ku/memory/block/struct.Block.html).
Если свободных страниц не хватает, верните ошибку
[`kernel::error::Error::NoPage`](../../doc/kernel/error/enum.Error.html#variant.NoPage).

Вам может пригодиться функция
[`fn Page::count_up(size: usize) -> usize`](../../doc/kernel/memory/frage/struct.Frage.html#method.count_up).
Она реализует формулу \\( \lceil \frac{\texttt{size}}{\texttt{Page::SIZE}} \rceil \\),
возвращая количество страниц, которое требуется для хранения `size` байт.
Также может пригодиться метод
[`Option::ok_or()`](https://doc.rust-lang.org/nightly/core/option/enum.Option.html#method.ok_or):
`tail.ok_or(NoPage)`.

Метод
[`PageAllocator::allocate()`](../../doc/kernel/memory/page_allocator/struct.PageAllocator.html#method.allocate)
похож на уже реализованный вами
[`BootFrameAllocator::allocate_block()`](../../doc/kernel/memory/boot_frame_allocator/struct.BootFrameAllocator.html#method.allocate_block).


### Проверьте себя

Запустите тесты:

```console
$ (cd kernel; cargo test --test 2-mm-1-block --test 2-mm-2-page-allocator)
...
2_mm_1_block::block-----------------------------------------
18:00:54 0 D start = 0; end = 0; block = [0v0, 0v0), size 0 B
18:00:54 0 D start = 0; end = 33; block = [0v0, 0v21), size 33 B
18:00:54 0 D start = 0; end = 66; block = [0v0, 0v42), size 66 B
18:00:54 0 D start = 0; end = 99; block = [0v0, 0v63), size 99 B
18:00:54 0 D start = 25; end = 33; block = [0v19, 0v21), size 8 B
18:00:54 0 D start = 25; end = 66; block = [0v19, 0v42), size 41 B
18:00:54 0 D start = 25; end = 99; block = [0v19, 0v63), size 74 B
18:00:55 0 D start = 50; end = 66; block = [0v32, 0v42), size 16 B
18:00:55 0 D start = 50; end = 99; block = [0v32, 0v63), size 49 B
18:00:55 0 D start = 50; end = 132; block = [0v32, 0v84), size 82 B
18:00:55 0 D start = 75; end = 99; block = [0v4B, 0v63), size 24 B
18:00:55 0 D start = 75; end = 132; block = [0v4B, 0v84), size 57 B
18:00:55 0 D start = 75; end = 165; block = [0v4B, 0vA5), size 90 B
2_mm_1_block::block-------------------------------- [passed]
18:00:55 0 I exit qemu; exit_code = SUCCESS
...
2_mm_2_page_allocator::sanity_check-------------------------
18:00:57 0 D page_allocator_block = [0v18000000000, 0v7FFFFFFFF000), size 126.500 TiB, Page[~1.500 TiB, ~128.000 TiB)
2_mm_2_page_allocator::sanity_check---------------- [passed]

2_mm_2_page_allocator::allocate_page------------------------
18:00:57 0 D page = Page(34359738366 @ 0v7FFFFFFFE000)
2_mm_2_page_allocator::allocate_page--------------- [passed]

2_mm_2_page_allocator::allocate_two_pages-------------------
18:00:57 0 D pages = [Page(34359738365 @ 0v7FFFFFFFD000), Page(34359738364 @ 0v7FFFFFFFC000)]
2_mm_2_page_allocator::allocate_two_pages---------- [passed]

2_mm_2_page_allocator::allocate_block-----------------------
18:00:57 0 D requested_size = 38.000 KiB; block = [0v7FFFFFFF2000, 0v7FFFFFFFC000), size 40.000 KiB, Page[~128.000 TiB, ~128.000 TiB)
2_mm_2_page_allocator::allocate_block-------------- [passed]
18:00:57 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/memory/page_allocator.rs |   32 ++++++++++++++++++++++++++++++--
 1 file changed, 30 insertions(+), 2 deletions(-)
```
