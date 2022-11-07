## Высокоуровневый интерфейс управления адресным пространством

Всё управление адресным пространством инкапсулировано в структуре
[`kernel::memory::address_space::AddressSpace`](../../doc/kernel/memory/address_space/struct.AddressSpace.html).
Её поле
[`AddressSpace::mapping`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#structfield.mapping)
служит для модификации отображения страниц и [реализовано вами ранее](../../lab/book/2-mm-6-address-space-2-translate.html).
А поле
[`AddressSpace::page_allocator`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#structfield.page_allocator) ---
для выделения виртуальных страниц внутри этого адресного пространства.
И тоже [уже реализовано](../../lab/book/2-mm-6-address-space-1-allocation.html).


### Задача 4 --- высокоуровневый интерфейс управления адресным пространством

#### Отображение виртуальной страницы на физический фрейм

Реализуйте [метод](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_page_to_frame)

```rust
unsafe fn AddressSpace::map_page_to_frame(
    &mut self,
    page: Page,
    frame: Frame,
    flags: PageTableFlags,
) -> Result<()>
```

в файле [`kernel/src/memory/address_space.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/address_space.rs).
Он должен отобразить заданную виртуальную страницу `page` на заданный физический фрейм `frame` с указанными флагами доступа `flags`.
Используйте
[`Mapping::translate()`](../../doc/kernel/memory/mapping/struct.Mapping.html#method.translate)
и
[`FRAME_ALLOCATOR`](../../doc/kernel/memory/struct.FRAME_ALLOCATOR.html).
Вам может пригодиться метод
[`PageTableEntry::set_frame()`](../../doc/kernel/memory/mmu/struct.PageTableEntry.html#method.set_frame).
Увеличивать количество ссылок на `frame` не нужно, это задача вызывающей функции.
Дело в том, что нам иногда захочется использовать
[`AddressSpace::map_page_to_frame()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_page_to_frame)
для отображения зарезервированных физических фреймов, про которые
[`FrameAllocator`](../../doc/kernel/memory/enum.FrameAllocator.html)
ничего не знает и не отслеживает количество ссылок на них.
Например, это делает метод
[`kernel::smp::local_apic::LocalApic::map()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.map),
инициализирующий работу с
[контроллером прерываний APIC](https://wiki.osdev.org/APIC)
методом ввода--вывода через память
([Memory-mapped I/O](https://en.wikipedia.org/wiki/Memory-mapped_I/O)).

Если `page` уже была отображена, то старое отображение удаляется,
если только при этом не произойдёт замена прав доступа к странице с
"только для ядра" на "доступно в пользовательском пространстве" ---
[`PageTableFlags::USER_ACCESSIBLE`](../../doc/ku/memory/mmu/struct.PageTableFlags.html#associatedconstant.USER_ACCESSIBLE).
В случае попытки такой замены отображение не меняется, а возвращается ошибка
[`Error::PermissionDenied`](../../doc/kernel/error/enum.Error.html#variant.PermissionDenied).
Если же отображение `page` поменялось, старый физический фрейм освобождается,
если на него не осталось других ссылок.
Удалить старый маппинг можно с помощью метода
[`AddressSpace::unmap_pte()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.unmap_pte).

Используя
[`FrameAllocator::allocate()`](../../doc/kernel/memory/enum.FrameAllocator.html#method.allocate)
из глобального
[`FRAME_ALLOCATOR`](../../doc/kernel/memory/struct.FRAME_ALLOCATOR.html)
и
[`AddressSpace::map_page_to_frame()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_page_to_frame)
реализуйте [метод](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_page)

```rust
unsafe fn AddressSpace::map_page(
    &mut self,
    page: Page,
    flags: PageTableFlags,
) -> Result<Frame>
```

в файле [`kernel/src/memory/address_space.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/address_space.rs).
Он отличается от
[`AddressSpace::map_page_to_frame()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_page_to_frame)
только тем, что не принимает `frame`, а выделяет его сам.


#### Удаление отображения заданной страницы

Реализуйте [метод](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.unmap_page)

```rust
unsafe fn AddressSpace::unmap_page(
    &mut self,
    page: Page,
) -> Result<()>
```

и его вспомогательный [метод](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.unmap_pte)

```rust
unsafe fn AddressSpace::unmap_pte(
    page: Page,
    pte: &mut PageTableEntry,
) -> Result<()>
```

в файле [`kernel/src/memory/address_space.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/address_space.rs).
Воспользуйтесь
[`Mapping::translate()`](../../doc/kernel/memory/mapping/struct.Mapping.html#method.translate),
теперь в качестве `flags` ему можно передать пустой набор флагов
[`PageTableFlags::empty()`](../../doc/kernel/memory/mmu/struct.PageTableFlags.html#method.empty).

**Важно** сбросить запись в
[буфере ассоциативной трансляции](https://ru.wikipedia.org/wiki/%D0%91%D1%83%D1%84%D0%B5%D1%80_%D0%B0%D1%81%D1%81%D0%BE%D1%86%D0%B8%D0%B0%D1%82%D0%B8%D0%B2%D0%BD%D0%BE%D0%B9_%D1%82%D1%80%D0%B0%D0%BD%D1%81%D0%BB%D1%8F%D1%86%D0%B8%D0%B8)
([Translation lookaside buffer](https://en.wikipedia.org/wiki/Translation_lookaside_buffer),
[TLB](https://wiki.osdev.org/TLB))
касающуюся `page`.
Иначе процессор может использовать старую закешерованную в TLB запись, когда обратится по адресу внутри `page` в следующий раз.
А это может быть как уже совершенно другой физический фрейм, так и намеренно не отображённая на физическую память страница.
Выглядеть с вашей точки зрения это будет так: вы обращаетесь по некоторому адресу, а там находится совсем не то что вы ожидаете.
Даже отладчик будет показывать вам то же самое, что вы ожидаете.
А вот процессор будет читать и писать совсем в другую физическую память.
Это приведёт к трудно отлаживаемым
[гейзенбагам](https://ru.wikipedia.org/wiki/%D0%93%D0%B5%D0%B9%D0%B7%D0%B5%D0%BD%D0%B1%D0%B0%D0%B3).
Для сброса нужной записи TLB поможет функция
[kernel::memory::mmu::flush()](../../doc/kernel/memory/mmu/fn.flush.html).

Также вам пригодятся

- [`FrameAllocator::deallocate()`](../../doc/kernel/memory/enum.FrameAllocator.html#method.deallocate) и
- [`PageTableEntry::clear()`](../../doc/kernel/memory/mmu/struct.PageTableEntry.html#method.clear).


### Изучите как устроены отображения целых блоков

Посмотрите на методы

- [`unsafe fn AddressSpace::map_block(&mut self, pages: Block<Page>, flags: PageTableFlags) -> Result<()>`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_block) и
- [`unsafe fn AddressSpace::unmap_block(&mut self, pages: Block<Page>) -> Result<()>`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.unmap_block).

Их код и назначение должны быть уже понятны.


### Изучите как устроены отображения срезов

С помощью реализованных вами функций [метод](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_slice_uninit)

```rust
fn AddressSpace::map_slice_uninit<T>(
    &mut self,
    len: usize,
    flags: PageTableFlags,
) -> Result<&'static mut [MaybeUninit<T>]>
```

выделяет срез неинициализированной памяти
[`core::mem::MaybeUninit`](https://doc.rust-lang.org/nightly/core/mem/union.MaybeUninit.html),
достаточный для `len` элементов типа `T`.
Так как он пользуется выделением виртуальных страниц и физических фреймов,
каждый вызов расходует целое число фреймов.
То есть, выделение через него срезов маленького размера в байтах неэффективно.
В результате вернётся срез с большим, чем было запрошено, количеством элементов ---
сколько поместилось в аллоцированном наборе страниц.

[Метод](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_slice)

```rust
fn AddressSpace::map_slice<T, F: Fn() -> T>(
    &mut self,
    len: usize,
    flags: PageTableFlags,
    default: F,
) -> Result<&'static mut [T]>
```

дополнительно параметризован
[замыканием](https://doc.rust-lang.ru/book/ch13-01-closures.html)
типажа
[`core::ops::Fn`](https://doc.rust-lang.org/nightly/core/ops/trait.Fn.html).
Возвращаемый им срез уже инициализирован значениями, которые возвращает замыкание `default`.

[Метод](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.map_slice_zeroed)

```rust
unsafe fn AddressSpace::map_slice_zeroed<T>(
    &mut self,
    len: usize,
    flags: PageTableFlags,
) -> Result<&'static mut [T]>
```

не принимает значение для инициализации, а инициализирует память нулями.
`unsafe` означает, что вызывающая функция должна гарантировать, что [нулевые байты являются корректным значением](https://doc.rust-lang.org/nightly/core/mem/union.MaybeUninit.html#example-2) для типа `T`.

[Метод](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.unmap_slice)

```rust
unsafe fn AddressSpace::unmap_slice<T>(
    &mut self,
    slice: &mut [T],
) -> Result<()>
```

удаляет отображение страниц под заданным срезом.
Он проверяет, что срез действительно занимает свои страницы целиком.
`unsafe` означает, что вызывающая функция должна гарантировать, что `slice` больше не будет использоваться.


### Проверьте себя

Запустите тест:

```console
$ (cd kernel; cargo test --test 2-mm-4-map)
...
2_mm_4_interface::map_slice---------------------------------
19:10:06 0 D slice = [0v7FFFFEFFF000, 0v7FFFFFFFF000), size 16.000 MiB, Virt[~128.000 TiB, ~128.000 TiB)
2_mm_4_interface::map_slice------------------------ [passed]
19:10:09.133 0 I exit qemu; exit_code = SUCCESS
```

Как и в случае копирования и удаления виртуальных отображений для проверки метода
[`AddressSpace::unmap_slice()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.unmap_slice)
нам понадобится основной аллокатор физических фреймов.
Поэтому тест для него придётся отложить.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/memory/address_space.rs |   20 +++++++++++++++++---
 1 file changed, 17 insertions(+), 3 deletions(-)
```
