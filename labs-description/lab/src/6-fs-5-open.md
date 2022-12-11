## Поиск файла по пути


### Задача 5 --- поиск файла по пути

Реализуйте [метод](../../doc/kernel/fs/file_system/struct.FileSystem.html#method.open)

```
fn FileSystem::open(&mut self, path: &str) -> Result<File>
```

в файле
[`kernel/src/fs/file_system.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/fs/file_system.rs).

Он должен пройти от корня файловой системы по заданному полному пути `path`.
И вернуть соответствующий `File`.


### Проверьте себя

Теперь должен заработать тест `fs()` в файле
[`kernel/tests/6-fs-5-open.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/6-fs-5-open.rs):

```console
$ (cd kernel; cargo test --test 6-fs-5-open)
...
6_fs_5_open::fs---------------------------------------------
20:38:44 0 I formatted the file system; free_space = 31.988 MiB; disk = { id: 1, base_port: 0x1F0, disk: 1 }; block_count = 8192; reserved_block_count = 3; inode_size = 64 B; directory_entry_size = 128 B; max_file_size = 513.002 GiB
20:38:44 0 I path = /file-1; entry = file-1, File, 5678 B = 5.545 KiB, 2022-12-11 20:38:44 UTC
20:38:44 0 I path = /file-2; entry = file-2, File, 9876 B = 9.645 KiB, 2022-12-11 20:38:44 UTC
20:38:44 0 I path = /dir-1; entry = dir-1, Directory, 4096 B = 4.000 KiB, 2022-12-11 20:38:44 UTC
20:38:44 0 I path = /dir-1/file-4; entry = file-4, File, 0 B = 0 B, 2022-12-11 20:38:44 UTC
20:38:44 0 I path = /dir-1/file-5; entry = file-5, File, 0 B = 0 B, 2022-12-11 20:38:44 UTC
20:38:44 0 I path = /dir-1/dir-2; entry = dir-2, Directory, 4096 B = 4.000 KiB, 2022-12-11 20:38:44 UTC
20:38:44 0 I path = /dir-1/dir-2/dir-3; entry = dir-3, Directory, 4096 B = 4.000 KiB, 2022-12-11 20:38:44 UTC
20:38:44 0 I path = /dir-1/dir-2/dir-3/file-3; entry = file-3, File, 0 B = 0 B, 2022-12-11 20:38:44 UTC
6_fs_5_open::fs------------------------------------ [passed]
20:38:45.049 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/fs/file_system.rs |   21 +++++++++++++++++++--
 1 file changed, 19 insertions(+), 2 deletions(-)
```
