## Index node (inode)

В [inode](https://en.wikipedia.org/wiki/Inode) хранится метаинформация об объекте с данными.
Имя объекта не хранится, оно хранится в директории.
Объектом может быть как файл, так и директория.
В случае директорий, их содержимое --- массив из имен объектов и их [inode](https://en.wikipedia.org/wiki/Inode).
[Inode](https://en.wikipedia.org/wiki/Inode) корневой директории файловой системы хранится в суперблоке.

В файловых системах семейства System V, упрощённую реализацию которой пишем мы,
в директории хранится не сам
[inode](https://en.wikipedia.org/wiki/Inode),
а его номер.
Это позволяет иметь для одного
[inode](https://en.wikipedia.org/wiki/Inode)
несколько имён в одной и той же или в разных директориях ---
[жёстких ссылок](https://en.wikipedia.org/wiki/Hard_link).
В этом случае сами
[inode](https://en.wikipedia.org/wiki/Inode)
хранятся в отдельном массиве в файловой системе (на диске).
И для ускорения их аллокации заводят отдельный битмап, как для блоков.

Структура `Inode` выглядит так:

```rust
enum Kind {
    Unused = 0,
    File = 1,
    Directory = 2,
}

struct Inode {
    kind: Kind,
    modify_time: DateTime<Utc>,
    size: usize,
    root_blocks: [usize; MAX_HEIGHT],
}

const MAX_HEIGHT: usize = 4;
```


### Блоки данных inode

Блоки данных
[inode](https://en.wikipedia.org/wiki/Inode)
адресуются через массив `root_blocks` структуры `struct Inode`.

![Блоки данных файла](6-fs-3-inode.svg)


### Задача 3 --- index node (inode)

Реализуйте недостающие методы структуры
[`kernel::fs::inode::Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
в файле
[`kernel/src/fs/inode.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/fs/inode.rs).
При записи в
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
обновляйте время его модификации ---
[`Inode::modify_time`](../../doc/kernel/fs/inode/struct.Inode.html#structfield.modify_time).

Вам могут пригодиться методы
[`usize::div_ceil()`](https://doc.rust-lang.org/nightly/core/primitive.usize.html#method.div_ceil) и
[`usize::next_multiple_of()`](https://doc.rust-lang.org/nightly/core/primitive.usize.html#method.next_multiple_of).


#### [`kernel::fs::inode::Inode::block_entry()`](../../doc/kernel/fs/inode/struct.Inode.html#method.block_entry)

Вспомогательный [метод](../../doc/kernel/fs/inode/struct.Inode.html#method.block_entry)

```rust
fn Inode::block_entry(
    &mut self,
    inode_block_number: usize,
    block_bitmap: Option<&mut BlockBitmap>,
) -> Result<&mut usize>
```

по номеру блока `inode_block_number` внутри данных
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
возвращает ссылку на запись из метаданных этого
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html).
Эта запись предназначена для номера блока на диске, хранящего указанный блок данных
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html).
С помощью этого метода происходит отображение смещения внутри данных файла в номер блока на диске,
хранящего эти данные.
Номер `inode_block_number` равен смещению внутри данных файла, делённому на размер блока.
Нужная запись находится либо непосредственно в
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html),
и тогда это `&mut Inode::root_blocks[0]`.
Либо в одном из листьевых косвенных блоков леса
[`Inode::root_blocks`](../../doc/kernel/fs/inode/struct.Inode.html#structfield.root_blocks).

- Если при обходе леса встречается не выделенный косвенный блок, то его нужно выделить из `block_bitmap`. Не выделенные блоки имеют зарезервированный номер [`kernel::fs::inode::NO_BLOCK`](../../doc/kernel/fs/inode/constant.NO_BLOCK.html). Если при этом `block_bitmap` равен `None`, верните ошибку [`Error::NoDisk`](../../doc/kernel/error/enum.Error.html#variant.NoDisk).
- А вот выделять блок для данных, на который указывает результирующая запись, не нужно.

Этот метод похож на
[`kernel::memory::mapping::Mapping::translate()`](../../doc/kernel/memory/mapping/struct.Mapping.html#method.translate),
[который вы уже реализовали](../../lab/book/2-mm-6-address-space-2-translate.html#%D0%9E%D1%82%D0%BE%D0%B1%D1%80%D0%B0%D0%B6%D0%B5%D0%BD%D0%B8%D0%B5-%D0%B2%D0%B8%D1%80%D1%82%D1%83%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D1%85-%D1%81%D1%82%D1%80%D0%B0%D0%BD%D0%B8%D1%86-%D0%BD%D0%B0-%D1%84%D0%B8%D0%B7%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B5-%D1%84%D1%80%D0%B5%D0%B9%D0%BC%D1%8B).
Только в
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
для блоков не одно дерево фиксированной высоты, а последовательность деревьев возрастающей высоты.

Дополнительный [метод](../../doc/kernel/fs/inode/struct.Inode.html#method.block)

```rust
fn Inode::block(&mut self, inode_block_number: usize) -> Result<Block<Virt>>
```

оборачивает реализованный вами
[`Inode::block_entry()`](../../doc/kernel/fs/inode/struct.Inode.html#method.block_entry)
и возвращает блок в памяти блочного кеша, где хранится заданный блок
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html).


#### [`kernel::fs::inode::Inode::set_size()`](../../doc/kernel/fs/inode/struct.Inode.html#method.set_size)

[Метод](../../doc/kernel/fs/inode/struct.Inode.html#method.set_size)

```rust
fn Inode::set_size(
    &mut self,
    size: usize,
    block_bitmap: &mut BlockBitmap,
) -> Result<()>
```

изменяет размер данных
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
в большую или меньшую сторону.
При этом он должен отдавать в `block_bitmap` не используемые больше блоки данных.
Если новый размер `size` равен `0`, то все косвенные блоки также нужно освободить.
Так как с таким аргументом этот метод вызывается при удалении
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html).
А при удалении, естественно, нужно освободить все ресурсы.
Также имеет смысл освобождать хотя бы часть не нужных более косвенных блоков.
Например, можно освобождать не нужные более деревья леса блоков целиком.

Если файл расширяется, то новые блоки с данными должны содержать нули.
Как вариант, вы можете не хранить такие блоки на диске, заменяя их номера на
[`NO_BLOCK`](../../doc/kernel/fs/inode/constant.NO_BLOCK.html).
И выделять реальные блоки только в момент записи.
Косвенные блоки тоже можно выделять лениво в момент записи.

Вам могут пригодиться:

- [`Inode::block_entry()`](../../doc/kernel/fs/inode/struct.Inode.html#method.block_entry).
- Функция [`core::cmp::min()`](https://doc.rust-lang.org/nightly/core/cmp/fn.min.html).
- Метод [`slice::fill()`](https://doc.rust-lang.org/nightly/core/primitive.slice.html#method.fill) [срезов](https://doc.rust-lang.ru/book/ch04-03-slices.html). Заполнять нулями имеет смысл не побайтно, а целыми [`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html) или [`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html).


#### [`kernel::fs::inode::Inode::read()`](../../doc/kernel/fs/inode/struct.Inode.html#method.read)

[Метод](../../doc/kernel/fs/inode/struct.Inode.html#method.read)

```rust
fn Inode::read(
    &mut self,
    offset: usize,
    buffer: &mut [u8],
) -> Result<usize>
```

читает из данных
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
по смещению `offset` в буфер `buffer` столько байт,
сколько остаётся до конца файла или до конца буфера.
И возвращает количество прочитанных байт.
Если
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
не является файлом, верните ошибку
[`Error::NotFile`](../../doc/kernel/error/enum.Error.html#variant.NotFile).
Если `offset` превышает размер файла, верните ошибку
[`Error::InvalidArgument`](../../doc/kernel/error/enum.Error.html#variant.InvalidArgument).
Если `offset` равен размеру файла, верните `0` прочитанных байт.

Вам могут пригодиться:

- [`Inode::block()`](../../doc/kernel/fs/inode/struct.Inode.html#method.block).
- Функция [`core::cmp::min()`](https://doc.rust-lang.org/nightly/core/cmp/fn.min.html).
- Метод [`slice::copy_from_slice()`](https://doc.rust-lang.org/nightly/core/primitive.slice.html#method.copy_from_slice) [срезов](https://doc.rust-lang.ru/book/ch04-03-slices.html).


#### [`kernel::fs::inode::Inode::write()`](../../doc/kernel/fs/inode/struct.Inode.html#method.write)

[Метод](../../doc/kernel/fs/inode/struct.Inode.html#method.read)

```rust
pub(super) fn write(
    &mut self,
    offset: usize,
    buffer: &[u8],
    block_bitmap: &mut BlockBitmap,
) -> Result<usize>
```

записывает в данные
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
по смещению `offset` байты из буфера `buffer`.
При необходимости расширяет размер файла.
И возвращает количество записанных байт.
Если
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
не является файлом, верните ошибку [`Error::NotFile`](../../doc/kernel/error/enum.Error.html#variant.NotFile).
Если `offset` превышает размер файла, --- это нормальная ситуация.
Расширьте файл нулями до заданного `offset`.

Вам могут пригодиться:

- [`Inode::block()`](../../doc/kernel/fs/inode/struct.Inode.html#method.block).
- [`Inode::set_size()`](../../doc/kernel/fs/inode/struct.Inode.html#method.set_size).
- Функция [`core::cmp::min()`](https://doc.rust-lang.org/nightly/core/cmp/fn.min.html).
- Метод [`slice::copy_from_slice()`](https://doc.rust-lang.org/nightly/core/primitive.slice.html#method.copy_from_slice) [срезов](https://doc.rust-lang.ru/book/ch04-03-slices.html).


### Проверьте себя

Теперь должны заработать тесты в файле
[`kernel/tests/6-fs-3-inode.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/6-fs-3-inode.rs):

```console
$ (cd kernel; cargo test --test 6-fs-3-inode)
...
6_fs_3_inode::block_entry-----------------------------------
19:00:13 0 D block_count = 8192
19:00:13 0 D i = 0; prev_entry = 0v0; current_entry = 0v100002014B0
19:00:16.717 0 D i = 100000; prev_entry = 0v7FFFFE0064F0; current_entry = 0v7FFFFE0064F8
19:00:20.135 0 D i = 200000; prev_entry = 0v7FFFFE0C99F0; current_entry = 0v7FFFFE0C99F8
19:00:24.005 0 D i = 300000; prev_entry = 0v7FFFFE18EEF0; current_entry = 0v7FFFFE18EEF8
19:00:28.593 0 D i = 400000; prev_entry = 0v7FFFFE2523F0; current_entry = 0v7FFFFE2523F8
19:00:33.199 0 D i = 500000; prev_entry = 0v7FFFFE3158F0; current_entry = 0v7FFFFE3158F8
19:00:37.833 0 D i = 600000; prev_entry = 0v7FFFFE3D9DF0; current_entry = 0v7FFFFE3D9DF8
19:00:42.467 0 D i = 700000; prev_entry = 0v7FFFFE49D2F0; current_entry = 0v7FFFFE49D2F8
19:00:46.455 0 D block entry allocation is done, checking the entries
19:00:46.461 0 D i = 0; actual = 0; expected = 0
19:00:49.115 0 D i = 100000; actual = 100000; expected = 100000
19:00:51.789 0 D i = 200000; actual = 200000; expected = 200000
19:00:54.879 0 D i = 300000; actual = 300000; expected = 300000
19:00:58.697 0 D i = 400000; actual = 400000; expected = 400000
19:01:02.513 0 D i = 500000; actual = 500000; expected = 500000
19:01:06.305 0 D i = 600000; actual = 600000; expected = 600000
19:01:10.045 0 D i = 700000; actual = 700000; expected = 700000
6_fs_3_inode::block_entry-------------------------- [passed]

6_fs_3_inode::read_write_speed------------------------------
19:01:13.299 0 D block_count = 8192
19:01:13.683 0 D disk read speed; size = 1.000 MiB; elapsed = 350.522 ms
19:01:14.165 0 D file system read speed; size = 1.000 MiB; elapsed = 47.620 ms; timeout = 200.000 ms
19:01:14.649 0 D file system write speed; size = 1.000 MiB; elapsed = 47.640 ms; timeout = 200.000 ms
19:01:15.071 0 D disk write speed; size = 1.000 MiB; elapsed = 411.271 ms
6_fs_3_inode::read_write_speed--------------------- [passed]

6_fs_3_inode::write_read------------------------------------
19:01:15.091 0 D block_count = 8192
19:01:16.095 0 D actual = [0, 2, 6, 12, 20, 30, 42, 56, 72, 90]; expected = [0, 2, 6, 12, 20, 30, 42, 56, 72, 90]
6_fs_3_inode::write_read--------------------------- [passed]

6_fs_3_inode::big_file--------------------------------------
19:01:17.009 0 D block_count = 8192
19:01:26.767 0 D file_block_count = 8107; file_size = 31.668 MiB
19:01:33.575 0 D free_block_count = 65; used_block_count = 8124
19:01:33.807 0 D start_free_block_count = 8189; end_free_block_count = 8189; leaked_block_count = 0
6_fs_3_inode::big_file----------------------------- [passed]

6_fs_3_inode::set_size--------------------------------------
19:01:33.829 0 D block_count = 8192
19:01:33.837 0 D offset = 0; size = 0
19:01:34.555 0 D offset = 1; size = 1
19:01:35.225 0 D offset = 2; size = 2
19:01:35.895 0 D offset = 1363; size = 1363
19:01:36.565 0 D offset = 1364; size = 1364
19:01:37.231 0 D offset = 1365; size = 1365
19:01:37.913 0 D offset = 1366; size = 1366
19:01:38.589 0 D offset = 1367; size = 1367
19:01:39.275 0 D offset = 2728; size = 2728
19:01:39.951 0 D offset = 2729; size = 2729
19:01:40.635 0 D offset = 2730; size = 2730
19:01:41.321 0 D offset = 2731; size = 2731
19:01:42.013 0 D offset = 2732; size = 2732
19:01:42.703 0 D offset = 4093; size = 4093
19:01:43.387 0 D offset = 4094; size = 4094
19:01:44.063 0 D offset = 4095; size = 4095
19:01:44.771 0 D offset = 4096; size = 4096
19:01:45.491 0 D offset = 4097; size = 4097
19:01:46.159 0 D offset = 5458; size = 5458
19:01:46.811 0 D offset = 5459; size = 5459
19:01:47.463 0 D offset = 5460; size = 5460
19:01:48.121 0 D offset = 5461; size = 5461
19:01:48.777 0 D offset = 5462; size = 5462
19:01:49.427 0 D offset = 6823; size = 6823
19:01:50.073 0 D offset = 6824; size = 6824
19:01:50.723 0 D offset = 6825; size = 6825
19:01:51.387 0 D offset = 6826; size = 6826
19:01:52.041 0 D offset = 6827; size = 6827
19:01:52.681 0 D offset = 8188; size = 8188
19:01:53.321 0 D offset = 8189; size = 8189
19:01:53.955 0 D offset = 8190; size = 8190
19:01:54.591 0 D offset = 8191; size = 8191
19:01:55.305 0 D offset = 8192; size = 8192
6_fs_3_inode::set_size----------------------------- [passed]
19:01:55.355 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/fs/inode.rs |  125 ++++++++++++++++++++++++++++++++++++++++++++++---
 1 file changed, 119 insertions(+), 6 deletions(-)
```
