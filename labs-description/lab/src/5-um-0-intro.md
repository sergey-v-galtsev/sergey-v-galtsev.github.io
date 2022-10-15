## Продвинутая работа с памятью в пространстве пользователя

В этой лабораторной работе мы освоим продвинутое управление памятью в пространстве пользователя.
В частности, реализуем обработку исключений доступа к памяти и copy-on-write `fork()` в пространстве пользователя.


### Ориентировочный объём работ этой лабораторки

```console
 kernel/src/interrupts.rs      |   40 ++++++++++
 kernel/src/memory/mapping.rs  |   21 +++++
 kernel/src/process/mod.rs     |   24 ++++++
 kernel/src/process/syscall.rs |  154 +++++++++++++++++++++++++++++++++++++++---
 ku/src/ring_buffer.rs         |   47 +++++++++++-
 user/cow_fork/src/main.rs     |   77 ++++++++++++++++++++-
 user/eager_fork/src/main.rs   |   49 ++++++++++++-
 user/lib/src/memory/mod.rs    |   31 +++++++-
 user/lib/src/syscall.rs       |   79 +++++++++++++++++++++
 9 files changed, 493 insertions(+), 29 deletions(-)
```
