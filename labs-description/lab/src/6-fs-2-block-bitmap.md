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


### Проверьте себя

Теперь должен заработать тест `allocation()` в файле
[`kernel/tests/6-fs-2-block-bitmap.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/6-fs-2-block-bitmap.rs):

```console
$ (cd kernel; cargo test --test 6-fs-2-block-bitmap)
...
6_fs_2_block_bitmap::allocation-----------------------------
20:37:24 0 D block_count = 8192
6_fs_2_block_bitmap::allocation-------------------- [passed]
20:37:30.657 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/fs/block_bitmap.rs |   26 ++++++++++++++++++++++++--
 1 file changed, 24 insertions(+), 2 deletions(-)
```
