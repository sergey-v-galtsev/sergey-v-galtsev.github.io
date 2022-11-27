## Продвинутая работа с памятью в пространстве пользователя

В этой лабораторной работе мы освоим продвинутое управление памятью в пространстве пользователя.
В частности, реализуем обработку исключений доступа к памяти и copy-on-write `fork()` в пространстве пользователя.


### Ориентировочный объём работ этой лабораторки

```console
 kernel/src/memory/mapping.rs  |   16 +++++
 kernel/src/process/mod.rs     |   28 +++++++++-
 kernel/src/process/process.rs |   50 +++++++++++++++++-
 kernel/src/process/syscall.rs |  214 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 ku/src/ring_buffer.rs         |   50 ++++++++++++++----
 user/cow_fork/src/main.rs     |   74 +++++++++++++++++++++++++--
 user/eager_fork/src/main.rs   |   54 ++++++++++++++++++--
 user/lib/src/memory/mod.rs    |   34 ++++++++++--
 user/lib/src/syscall.rs       |   48 +++++++++++++++++
 9 files changed, 510 insertions(+), 58 deletions(-)
```
