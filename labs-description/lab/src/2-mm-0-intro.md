## Память

В этой лабораторке нужно будет написать функции управления памятью в операционной системе Nikka.
Для вашего удобства, лабораторка разбита на 13 задач в трёх блоках, которые нужно делать по порядку:

- Временный аллокатор физических фреймов.
- Виртуальное адресное пространство.
- Основной аллокатор физических фреймов.

### Код работы с памятью в Nikka собран в модули

- [`kernel::memory`](../../doc/kernel/memory/index.html) в директории `kernel/src/memory`. Здесь находится часть работы с памятью, которая происходит только в ядре.
  - [`kernel/src/memory/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/mod.rs) --- корневая часть модуля [`kernel::memory`](../../doc/kernel/memory/index.html).
  - [`kernel/src/memory/address_space.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/address_space.rs) --- абстракция адресного пространства `AddressSpace`.
  - [`kernel/src/memory/boot_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/boot_frame_allocator.rs) --- временный аллокатор физических фреймов `BootFrameAllocator`.
  - [`kernel/src/memory/gdt.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/gdt.rs) --- таблица сегментов памяти `Gdt`.
  - [`kernel/src/memory/main_frame_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/main_frame_allocator.rs) --- основной аллокатор физических фреймов `MainFrameAllocator`.
  - [`kernel/src/memory/mapping.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/mapping.rs) --- реализация отображения виртуальной памяти в физическую `Mapping`.
  - [`kernel/src/memory/page_allocator.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/page_allocator.rs) --- аллокатор страниц виртуальной памяти `PageAllocator`.
  - [`kernel/src/memory/stack.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/stack.rs) --- работа со стеками `Stack` и выделенные стеки для непредвиденных исключений `ExceptionStacks`.
  - [`kernel/src/memory/tss.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/memory/tss.rs) --- сегмент состояния задачи ([task state segment](https://en.wikipedia.org/wiki/Task_state_segment), TSS).

- [`ku::memory`](../../doc/ku/memory/index.html) в директории `ku/src/memory`. Здесь собраны базовые примитивы для работы с памятью, которые нужны и в ядре, и в пространстве пользователя.
  - [`ku/src/memory/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/memory/mod.rs) --- корневая часть модуля [`ku::memory`](../../doc/ku/memory/index.html).
  - [`ku/src/memory/addr.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/memory/addr.rs) --- работа с адресами `Addr`, `Virt` и `Phys`.
  - [`ku/src/memory/block.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/memory/block.rs) --- работа с блоками памяти `Block`.
  - [`ku/src/memory/frage.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/memory/frage.rs) --- физические фреймы `Frame`, виртуальные страницы `Page`, и их общие аспекты `Frage`.
  - [`ku/src/memory/mmu.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/memory/mmu.rs) --- работа с блоком управления памятью ([memory management unit](https://en.wikipedia.org/wiki/Memory_management_unit), MMU), описывает таблицы страниц `PageTable`, их записи `PageTableEntry`, флаги доступа `PageTableFlags`.
  - [`ku/src/memory/page_fault_info.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/memory/page_fault_info.rs) --- информация об [исключении доступа к странице](https://en.wikipedia.org/wiki/Page_fault) (Page Fault) в виде `PageFaultInfo`.
  - [`ku/src/memory/size.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/memory/size.rs) --- абстракция размера в памяти `Size`.



### Ориентировочный объём работ этой лабораторки

```console
 kernel/src/memory/address_space.rs        |   20 ++++-
 kernel/src/memory/boot_frame_allocator.rs |   43 ++++++++++-
 kernel/src/memory/main_frame_allocator.rs |  116 ++++++++++++++++++++++++++++--
 kernel/src/memory/mapping.rs              |   88 +++++++++++++++++++++-
 kernel/src/memory/page_allocator.rs       |   32 +++++++-
 ku/src/memory/block.rs                    |    8 +-
 6 files changed, 289 insertions(+), 18 deletions(-)
```
