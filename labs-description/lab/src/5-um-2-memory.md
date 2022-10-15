## Системные вызовы для работы с виртуальной памятью

Добавим новые системные вызовы в файл [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Эти системные вызовы будут принимать идентификатор `Pid` целевого процесса.
То есть они будут позволять вызывающему процессу выполнить действие как над самим собой, задав `Pid::Current` или явно собственный идентификатор `Pid::Id`.
Так и над другим процессом, указав его `Pid::Id`.


### Валидация аргументов

Реализуйте функции валидации аргументов системных вызовов.


#### `check_block()`

```rust
fn check_block(
    address: usize,
    size: usize,
) -> Result<Block<Page>>
```

Проверяет, что `address` и `size` задают корректно выровненный диапазон страниц, целиком лежащий внутри одной из
[двух непрерывных половин](../../lab/book/2-mm-1-types.html#%D0%94%D0%B2%D0%B5-%D0%BF%D0%BE%D0%BB%D0%BE%D0%B2%D0%B8%D0%BD%D1%8B-%D0%B2%D0%B8%D1%80%D1%82%D1%83%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B3%D0%BE-%D0%B0%D0%B4%D1%80%D0%B5%D1%81%D0%BD%D0%BE%D0%B3%D0%BE-%D0%BF%D1%80%D0%BE%D1%81%D1%82%D1%80%D0%B0%D0%BD%D1%81%D1%82%D0%B2%D0%B0)
адресного пространства.


#### `check_page()`

```rust
fn check_page(address: usize) -> Result<Page>
```

Проверяет, что адрес выровнен на границу страниц и возвращает соответствующую виртуальную страницу.


#### `check_page_flags()`

```rust
fn check_page_flags(flags: usize) -> Result<PageTableFlags>
```

Проверяет, что `flags` задаёт валидный набор флагов отображения страниц, в котором обязательно должны быть включены флаги присутствия страницы в памяти и разрешения доступа со стороны кода пользователя.


#### `check_frame()`

```rust
fn check_frame(
    process: &mut MutexGuard<Process>,
    page: Page,
    flags: PageTableFlags,
) -> Result<Frame>
```

Проверяет, что заданная виртуальная страница `page` отображена в адресное пространство процесса `process` с корректно заданными флагами `flags` и возвращает физический фрейм, в который она отображена.
Используйте предыдущую проверку флагов.


#### `check_process_permissions()`

```rust
fn check_process_permissions(
    process: MutexGuard<Process>,
    dst_pid: usize,
) -> Result<MutexGuard<Process>>
```

Проверяет, что процесс `process` имеет право модифицировать целевой процесс, заданный своим идентификатором `dst_pid`.
Модифицировать можно либо самого себя, задавая `Pid::Current` или явно собственный идентификатор `Pid::Id`.
Либо свой непосредственно дочерний процесс, задавая его идентификатор.
Поглотите блокировку `process`, выдав взамен блокировку на целевой процесс.
Если он совпадает с `process` необходимо избежать
[взаимоблокировку](https://en.wikipedia.org/wiki/Deadlock)
себя же.
Вам пригодится метод `Pid::from_usize()`.


### Системные вызовы для работы с памятью

Используя написанные вспомогательные функции реализуйте системные вызовы.


#### `map()`

```rust
fn map(
    process: MutexGuard<Process>,
    dst_pid: usize,
    dst_address: usize,
    dst_size: usize,
    flags: usize,
) -> Result<SyscallResult>
```

Отображает в памяти процесса, заданного `dst_pid`, блок страниц размера `dst_size` байт начиная с виртуального адреса `dst_address` с флагами доступа `flags`.
Если `dst_address` равен нулю, ядро само выбирает свободный участок адресного пространства размера `dst_size`.


### `unmap()`

```rust
fn unmap(
    process: MutexGuard<Process>,
    dst_pid: usize,
    dst_address: usize,
    dst_size: usize,
) -> Result<SyscallResult>
```

Выполняет противоположную `map()` операцию --- удаляет заданный диапазон из виртуальной памяти целевого процесса.


### `copy_mapping()`

```rust
fn copy_mapping(
    process: MutexGuard<Process>,
    dst_pid: usize,
    src_address: usize,
    dst_address: usize,
    dst_size: usize,
    flags: usize,
) -> Result<SyscallResult>
```

Создаёт копию отображения виртуальной памяти из вызывающего процесса в процесс, заданный `dst_pid`.
Исходный диапазон начинается с виртуального адреса `src_address`, целевой --- с виртуального адреса `dst_address`.
Размер диапазона --- `dst_size` байт.
В целевом процессе диапазон должен быть отображён с флагами `flags`.
Естественно, `copy_mapping()` не должен допускать целевое отображение с более широким набором флагов, чем исходное.
После его выполнения у процессов появляется область [разделяемой памяти](https://en.wikipedia.org/wiki/Shared_memory).


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/syscall.rs |  123 +++++++++++++++++++++++++++++++++++++++---
 1 file changed, 115 insertions(+), 8 deletions(-)
```
