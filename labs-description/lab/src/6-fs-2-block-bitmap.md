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

Каждый элемент среза `BlockBitmap::bitmap` отвечает за 64 блока.
Блоку с меньшим номером соответствует бит с меньшим весом в соответствующем элементе.
Блок свободен тогда и только тогда, когда соответствующий ему бит равен `0`.


### Задача 2 --- битмап занятых блоков

Реализуйте метод

```rust
fn BlockBitmap::allocate(&mut self) -> Result<usize>
```

в файле
[`kernel/src/fs/block_bitmap.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/fs/block_bitmap.rs).

Функция должна найти по `BlockBitmap::bitmap` свободный блок и аллоцировать его.

- Верните номер выделенного блока.
- После того как новый блок аллоцирован, сбросьте изменившийся блок самого `bitmap` на диск с помощью реализованной вами функции `BlockCache::flush_block()`. Когда меняете метаданные, лучше сразу сбрасывать их на диск, так меньше вероятность поломки файловой системы, например, при сбое питания.
- Искать каждый раз с самого начала `BlockBitmap::bitmap` не эффективно. Лучше, например, обходить его по циклу с того места, на котором остановились в прошлый раз. Для хранения этой позиции между вызовами `BlockBitmap::allocate()` служит поле `BlockBitmap::cursor`.
- Проверять каждый бит тоже не эффективно. Лучше сначала найти элемент `BlockBitmap::bitmap`, в котором есть хотя бы один свободный бит. Поэтому биты сгруппированы именно по `u64`, а не например по `u8`.
- Верните ошибку [`Error::NoDisk`](../../doc/kernel/error/enum.Error.html#variant.NoDisk), если свободных блоков не осталось.