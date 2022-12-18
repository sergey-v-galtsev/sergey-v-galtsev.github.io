## Операции с директориями

Директории --- это
[inode](https://en.wikipedia.org/wiki/Inode),
с фиксированным форматом данных.
А именно, размер данных для директорий должен быть кратен размеру блока.
А сами данные --- это массив записей типа
[`kernel::fs::directory_entry::DirectoryEntry`](../../doc/kernel/fs/directory_entry/struct.DirectoryEntry.html):

```rust
struct DirectoryEntry {
    inode: Inode,
    name: [u8; MAX_NAME_LEN],
}
```

Отсутствующие или удалённые записи при этом помечаются как `inode.kind == Kind::Unused`.


### Задача 4 --- операции с директориями

Реализуйте методы
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html),
которые работают с данными директорий в файле
[`kernel/src/fs/inode.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/fs/inode.rs).
Эти методы должны возвращать ошибку
[`Error::NotDirectory`](../../doc/kernel/error/enum.Error.html#variant.NotDirectory),
если вызвать их для
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
который не является директорией.


#### [`kernel::fs::inode::Iter::next()`](../../doc/kernel/fs/inode/struct.Iter.html#method.next)

Это вспомогательный [метод](../../doc/kernel/fs/inode/struct.Iter.html#method.next) для
[`kernel::fs::inode::Inode::find_entry()`](../../doc/kernel/fs/inode/struct.Inode.html#method.find_entry) и
[`kernel::fs::inode::Inode::list()`](../../doc/kernel/fs/inode/struct.Inode.html#method.list).

Он продвигает итератор

```rust
struct Iter<'a> {
    block: Block<Virt>,
    block_number: usize,
    entry: usize,
    inode: &'a mut Inode,
}
```

по записям директории
[`Iter::inode`](../../doc/kernel/fs/inode/struct.Iter.html#structfield.inode).
Поле
[`Iter::block_number`](../../doc/kernel/fs/inode/struct.Iter.html#structfield.block_number)
задаёт номер блока внутри данных
[`Inode`](../../doc/kernel/fs/inode/struct.Inode.html)
в котором находится текущая запись.
Поле
[`Iter::block`](../../doc/kernel/fs/inode/struct.Iter.html#structfield.block) ---
сам этот блок в памяти блочного кеша.
А [`Iter::entry`](../../doc/kernel/fs/inode/struct.Iter.html#structfield.entry) ---
номер текущей записи внутри блока.

Вам могут пригодиться:

- [`Inode::block()`](../../doc/kernel/fs/inode/struct.Inode.html#method.block).
- [`mem::size_of::<DirectoryEntry>()`](https://doc.rust-lang.org/nightly/core/mem/fn.size_of.html) --- размер записи директории [`DirectoryEntry`](../../doc/kernel/fs/directory_entry/struct.DirectoryEntry.html).


#### [`kernel::fs::inode::Inode::find_entry()`](../../doc/kernel/fs/inode/struct.Inode.html#method.find_entry)

Вспомогательный [метод](../../doc/kernel/fs/inode/struct.Inode.html#method.find_entry) для
[`kernel::fs::inode::Inode::find()`](../../doc/kernel/fs/inode/struct.Inode.html#method.find) и
[`kernel::fs::inode::Inode::insert()`](../../doc/kernel/fs/inode/struct.Inode.html#method.insert):

```rust
fn Inode::find_entry(
    &mut self,
    name: &str,
    block_bitmap: Option<&mut BlockBitmap>,
) -> Result<&mut DirectoryEntry>
```

Он находит запись в директории с именем `name`.
Если такой записи нет, то верните свободную запись --- `Kind::Unused`.
Если и таких нет, и при этом `block_bitmap` является `Some`, попробуйте расширить директорию
и вернуть новую свободную запись.
Директорию имеет смысл расширять несколькими записями сразу на один целый блок.
Так как блок в любом случае будет выделен, его стоит сразу весь отдать под записи директории.

Чтобы не дублировать код, для обхода директории воспользуйтесь методом
[`Inode::iter()`](../../doc/kernel/fs/inode/struct.Inode.html#method.iter)
и соответствующим
[`Iter::next()`](../../doc/kernel/fs/inode/struct.Iter.html#method.next).
Также вам может пригодиться метод
[`Iter::extend()`](../../doc/kernel/fs/inode/struct.Iter.html#method.extend),
который расширяет директорию на один блок.


#### [`kernel::fs::inode::Inode::insert()`](../../doc/kernel/fs/inode/struct.Inode.html#method.insert)

Реализуйте [метод](../../doc/kernel/fs/inode/struct.Inode.html#method.insert)

```rust
fn Inode::insert(
    &mut self,
    name: &str,
    kind: Kind,
    block_bitmap: &mut BlockBitmap,
) -> Result<&mut Inode>
```

Он вставляет в директорию запись с именем `name` и типом `kind`.
Если запись с таким именем уже есть, верните ошибку
[`Error::FileExists`](../../doc/kernel/error/enum.Error.html#variant.FileExists).
Если `kind == Kind::Unused`, верните ошибку
[`Error::InvalidArgument`](../../doc/kernel/error/enum.Error.html#variant.InvalidArgument).
Используйте любую свободную запись --- `Kind::Unused`.
Не забудьте обновить как время модификации выделенной записи, так и время модификации самой директории.
Используйте вспомогательный метод
[`Inode::find_entry()`](../../doc/kernel/fs/inode/struct.Inode.html#method.find_entry).


### Проверьте себя

Теперь должны заработать тесты в файле
[`kernel/tests/6-fs-4-directory.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/6-fs-4-directory.rs):

```console
$ (cd kernel; cargo test --test 6-fs-4-directory)
...
6_fs_4_directory::basic_operations--------------------------
19:01:57 0 D block_count = 8192
19:01:57 0 D list = [Entry { kind: File, modify_time: 2022-12-17T19:01:57Z, name: "file-1", size: 0 }]
19:01:57 0 D list = [Entry { kind: File, modify_time: 2022-12-17T19:01:57Z, name: "file-1", size: 1 }]
19:01:57 0 D list = [Entry { kind: File, modify_time: 2022-12-17T19:01:57Z, name: "file-1", size: 1 }, Entry { kind: File, modify_time: 2022-12-17T19:01:57Z, name: "file-2", size: 1235 }]
6_fs_4_directory::basic_operations----------------- [passed]

6_fs_4_directory::big_directory-----------------------------
19:01:57 0 D block_count = 8192
19:01:57 0 D file_count = 100; directory_size = 16.000 KiB
19:01:57 0 D file_count = 200; directory_size = 28.000 KiB
19:01:58.265 0 D file_count = 300; directory_size = 40.000 KiB
19:01:58.927 0 D file_count = 400; directory_size = 52.000 KiB
19:01:59.769 0 D file_count = 500; directory_size = 64.000 KiB
19:02:00.791 0 D file_count = 600; directory_size = 76.000 KiB
19:02:01.995 0 D file_count = 700; directory_size = 88.000 KiB
19:02:03.379 0 D file_count = 800; directory_size = 100.000 KiB
19:02:04.947 0 D file_count = 900; directory_size = 116.000 KiB
19:02:06.691 0 D file_count = 1000; directory_size = 128.000 KiB
19:02:06.695 0 D free_block_count = 8156; used_block_count = 33
19:02:06.705 0 D start_free_block_count = 8189; end_free_block_count = 8189; leaked_block_count = 0
6_fs_4_directory::big_directory-------------------- [passed]

6_fs_4_directory::max_name_len------------------------------
19:02:06.725 0 D block_count = 8192
19:02:06.737 0 D list = [Entry { kind: File, modify_time: 2022-12-17T19:02:06.735Z, name: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", size: 0 }]
6_fs_4_directory::max_name_len--------------------- [passed]
19:02:06.755 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/fs/inode.rs |   70 ++++++++++++++++++++++++++++++++++++++++++++-----
 1 file changed, 64 insertions(+), 6 deletions(-)
```
