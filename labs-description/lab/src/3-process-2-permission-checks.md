## Проверки доступа процесса к памяти

В системных вызовах код пользователя будет передавать области памяти, описываемые `Block<Virt>`,
в ядро.
И код ядра должен будет что-то сделать с указанной памятью,
иногда читая или записывая в неё.

Ядро не может доверять коду пользователя, поэтому перед чтением или записью в такие области памяти,
оно должно проверить, есть ли у пользователя соответствующий доступ.
За выполнение всех нужных проверок, не только указанного типа,
отвечают функции системных вызовов в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs), ---
это граница между кодом пользователя и кодом ядра.

А за фактическую реализацию проверок доступа к памяти отвечают методы в файле [`kernel/src/memory/address_space.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/address_space.rs):

- [`kernel::memory::address_space::AddressSpace::check_permission<T>()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission) --- проверяет доступность памяти на чтение.
- [`kernel::memory::address_space::AddressSpace::check_permission_mut<T>()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission_mut) --- проверяет доступность памяти на запись.

Оба метода принимают на вход `Block<Virt>`, а возвращают либо ошибку доступа
[`Error::PermissionDenied`](../../doc/kernel/error/enum.Error.html#variant.PermissionDenied),
либо неизменяемый срез `&[T]` и изменяемый `&mut [T]` соответственно.
Для перевода `Block<Virt>` в срезы они пользуются методами
[`Block::<Virt>::try_into_slice()`](../../doc/ku/memory/block/struct.Block.html#method.try_into_slice) и
[`Block::<Virt>::try_into_mut_slice()`](../../doc/ku/memory/block/struct.Block.html#method.try_into_mut_slice).
Которые выполняют дополнительные проверки --- что `Block<Virt>` имеет допустимый адрес, а не
[`core::ptr::null()`](https://doc.rust-lang.org/nightly/core/ptr/fn.null.html),
что он выровнен подходящим для `T` образом и имеет подходящий для хранения `[T]` размер.

Основную же работу по проверке доступа к виртуальным адресам они перекладывают на вспомогательный метод

```rust
fn AddressSpace::check_permission_common(
    &mut self,
    block: &Block<Virt>,
    flags: PageTableFlags,
) -> Result<()>
```

Он должен пройтись по всем страницам заданного `block`, проверяя что они замаплены в адресное пространство `self`
с флагами `PageTableFlags::PRESENT`, `PageTableFlags::USER_ACCESSIBLE` и заданными на вход `flags` одновременно.


### Задача 2 --- проверка доступа к памяти

Реализуйте методы [`AddressSpace::check_permission_common()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission_common), [`AddressSpace::check_permission<T>()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission) и [`AddressSpace::check_permission_mut<T>()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission_mut) в файле [`kernel/src/memory/address_space.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/address_space.rs).

Вам могут пригодиться

- Метод [`fn Block::<Virt>::enclosing() -> Block<Page>`](../../doc/ku/memory/block/struct.Block.html#method.enclosing), который для заданного блока виртуальных адресов возвращает минимальный содержащий его блок страниц виртуальной памяти.
- Метод [`Mapping::translate()`](../../doc/kernel/memory/mapping/struct.Mapping.html#method.translate).
- Метод [`PageTableFlags::contains()`](../../doc/ku/memory/mmu/struct.PageTableFlags.html#method.contains).


### Проверьте себя

Запустите тест `3-process-2-check-permission` из файле [`kernel/src/tests/3-process-2-check-permission.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/3-process-2-check-permission.rs):

```console
$ (cd kernel; cargo test --test 3-process-2-check-permission)
...
3_process_2_check_permission::user_rw--------------------------
19:41:36 0 D pages = [0v7FFFFFF3B000, 0v7FFFFFF3F000), size 16.000 KiB
3_process_2_check_permission::user_rw----------------- [passed]

3_process_2_check_permission::non_present----------------------
19:41:36 0 D pages = [0v7FFFFFF37000, 0v7FFFFFF3B000), size 16.000 KiB
3_process_2_check_permission::non_present------------- [passed]

3_process_2_check_permission::stress---------------------------
19:41:36 0 D pages = [0v7FFFFFF36000, 0v7FFFFFF37000), size 4.000 KiB
19:41:37.093 0 D pages = [0v7FFFFFF34000, 0v7FFFFFF36000), size 8.000 KiB
19:41:39.177 0 D pages = [0v7FFFFFF31000, 0v7FFFFFF34000), size 12.000 KiB
19:41:48.835 0 D pages = [0v7FFFFFF2D000, 0v7FFFFFF31000), size 16.000 KiB
3_process_2_check_permission::stress------------------ [passed]
19:42:18.721 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/memory/address_space.rs |   22 +++++++++++++++++++---
 1 file changed, 19 insertions(+), 3 deletions(-)
```
