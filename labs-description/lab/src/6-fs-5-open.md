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
