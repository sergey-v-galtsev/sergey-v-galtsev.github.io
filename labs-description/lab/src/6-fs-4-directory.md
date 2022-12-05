## Операции с директориями

Директории --- это
[inode](https://en.wikipedia.org/wiki/Inode),
с фиксированным форматом данных.
А именно, размер данных для директорий должен быть кратен размеру блока.
А сами данные --- это массив записей типа

```rust
struct DirectoryEntry {
    inode: Inode,
    name: [u8; MAX_NAME_LEN],
}
```

Отсутствующие или удалённые записи при этом помечаются как `inode.kind == Kind::Unused`.


### Задача 4 --- операции с директориями

Реализуйте методы `Inode`, которые работают с данными директорий.


#### [`kernel::fs::inode::Inode::find_entry()`](../../doc/kernel/fs/inode/struct.Inode.html#method.find_entry)

Это вспомогательный метод для
[`kernel::fs::inode::Inode::find()`](../../doc/kernel/fs/inode/struct.Inode.html#method.find) и
[`kernel::fs::inode::Inode::insert()`](../../doc/kernel/fs/inode/struct.Inode.html#method.insert).


#### [`kernel::fs::inode::Inode::insert()`](../../doc/kernel/fs/inode/struct.Inode.html#method.insert)


#### [`kernel::fs::inode::Iter::next()`](../../doc/kernel/fs/inode/struct.Iter.html#method.next)

Это вспомогательный метод для
[`kernel::fs::inode::Inode::list()`](../../doc/kernel/fs/inode/struct.Inode.html#method.list).
