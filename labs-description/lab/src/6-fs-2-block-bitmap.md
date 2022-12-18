## Битмап занятых блоков


Для отслеживания какие именно блоки файловой системы заняты,
а какие свободны, служит структура
[`kernel::fs::block_bitmap::BlockBitmap`](../../doc/kernel/fs/block_bitmap/struct.BlockBitmap.html):

```rust
struct BlockBitmap {
    bitmap: &'static mut [u64],
    block_count: usize,
    cursor: usize,
}
```

Каждый элемент среза
[`BlockBitmap::bitmap`](../../doc/kernel/fs/block_bitmap/struct.BlockBitmap.html#structfield.bitmap)
отвечает за 64 блока.
Блоку с меньшим номером соответствует бит с меньшим весом в соответствующем элементе.
Блок свободен тогда и только тогда, когда соответствующий ему бит равен `0`.


### Задача 2 --- битмап занятых блоков

Реализуйте [метод](../../doc/kernel/fs/block_bitmap/struct.BlockBitmap.html#method.allocate)

```rust
fn BlockBitmap::allocate(
    &mut self,
) -> Result<usize>
```

в файле
[`kernel/src/fs/block_bitmap.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/fs/block_bitmap.rs).

Функция должна найти по
[`BlockBitmap::bitmap`](../../doc/kernel/fs/block_bitmap/struct.BlockBitmap.html#structfield.bitmap)
свободный блок и аллоцировать его.

- Верните номер выделенного блока.
- После того как новый блок аллоцирован, сбросьте изменившийся блок самого [`BlockBitmap::bitmap`](../../doc/kernel/fs/block_bitmap/struct.BlockBitmap.html#structfield.bitmap) на диск с помощью реализованной вами функции [`BlockCache::flush_block()`](../../doc/kernel/fs/block_cache/struct.BlockCache.html#method.flush_block). Когда меняете метаданные, лучше сразу сбрасывать их на диск, так меньше вероятность поломки файловой системы, например, при сбое питания.
- Искать каждый раз с самого начала [`BlockBitmap::bitmap`](../../doc/kernel/fs/block_bitmap/struct.BlockBitmap.html#structfield.bitmap) не эффективно. Лучше, например, обходить его по циклу с того места, на котором остановились в прошлый раз. Для хранения этой позиции между вызовами [`BlockBitmap::allocate()`](../../doc/kernel/fs/block_bitmap/struct.BlockBitmap.html#method.allocate) служит поле [`BlockBitmap::cursor`](../../doc/kernel/fs/block_bitmap/struct.BlockBitmap.html#structfield.cursor).
- Проверять каждый бит тоже не эффективно. Лучше сначала найти элемент [`BlockBitmap::bitmap`](../../doc/kernel/fs/block_bitmap/struct.BlockBitmap.html#structfield.bitmap), в котором есть хотя бы один свободный бит. Поэтому биты сгруппированы именно по [`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html), а не например по [`u8`](https://doc.rust-lang.org/nightly/core/primitive.u8.html).
- Верните ошибку [`Error::NoDisk`](../../doc/kernel/error/enum.Error.html#variant.NoDisk), если свободных блоков не осталось.


### Проверьте себя

Теперь должен заработать тест `allocation()` в файле
[`kernel/tests/6-fs-2-block-bitmap.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/6-fs-2-block-bitmap.rs):

```console
$ (cd kernel; cargo test --test 6-fs-2-block-bitmap)
...
6_fs_2_block_bitmap::allocation-----------------------------
19:00:01 0 D block_count = 8192
19:00:04.863 0 D allocated_head = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; allocated_tail = [8182, 8183, 8184, 8185, 8186, 8187, 8188, 8189, 8190, 8191]
19:00:10.693 0 D reallocated_head = [8129, 8131, 8133, 8135, 8137, 8139, 8141, 8143, 8145, 8147]; reallocated_tail = [8109, 8111, 8113, 8115, 8117, 8119, 8121, 8123, 8125, 8127]
6_fs_2_block_bitmap::allocation-------------------- [passed]
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/fs/block_bitmap.rs |   26 ++++++++++++++++++++++++--
 1 file changed, 24 insertions(+), 2 deletions(-)
```
