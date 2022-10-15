## Состояние каждого процессора

В мультипроцессорной системе нужно различать состояние системы в целом и состояние каждого отдельного процессора.
В Nikka состояние отдельного процессора описано в
[`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html),
определённой в [`kernel/src/smp/cpu.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/cpu.rs).
Номер процессора, на котором сейчас происходит выполнение кода, продублирован в этой структуре и его можно узнать с помощью метода
[`Cpu::id()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.id).
Саму структуру
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
текущего процессора можно получить из статического метода
[`Cpu::get()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.get).

Состояние отдельного процессора, которое стоит учитывать:

- Стек ядра [`Cpu::kernel_stack`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.kernel_stack). Процессоры обрабатывают системные вызовы и прерывания независимо, так что у каждого должен быть свой стек для этого.
- Также полезен дополнительный стек [`Cpu::page_fault_stack`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.page_fault_stack), который используется во время обработки Page Fault. Он позволяет напечатать диагностику возникшего исключения даже в случае, когда оно вызвано исчерпанием основного стека ядра.
- Task State Segment [`Cpu::tss`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.tss). В TSS описано, где находится стек ядра для текущего процессора. Разумеется, раз стеки разные, то и TSS тоже должны быть разные.
- Исполняющийся на данном CPU в текущий момент пользовательский процесс [`Cpu::current_process`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.current_process). Пользовательские процессы выполняются независимо на разных ядрах. Следовательно, у каждого ядра текущий процесс должен быть своим.
- Системные регистры. У каждого процессора свои системные регистры. Так что функции их инициализации должны быть вызваны для каждого CPU. Явно в структуре [`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html) регистры не хранятся.
  - [`GDTR`](https://wiki.osdev.org/GDT#GDTR) --- Global Descriptor Table Register, содержит адрес [kernel::memory::gdt::Gdt](../../doc/kernel/memory/gdt/type.Gdt.html).
  - [`IDTR`](https://wiki.osdev.org/IDT#IDTR) --- Interrupt Descriptor Table Register, содержит адрес [x86_64::structures::idt::InterruptDescriptorTable](../../doc/x86_64/structures/idt/struct.InterruptDescriptorTable.html).
  - [`CR3`](https://wiki.osdev.org/CPU_Registers_x86-64#CR3) --- содержит адрес корневой таблицы страниц [ku::memory::mmu::PageTable](../../doc/ku/memory/mmu/type.PageTable.html).
  - [`TR`](https://wiki.osdev.org/CPU_Registers_x86-64#TR) --- Task Register, содержит адрес [x86_64::structures::tss::TaskStateSegment](../../doc/x86_64/structures/tss/struct.TaskStateSegment.html).
  - [`FS`](https://wiki.osdev.org/CPU_Registers_x86-64#FS.base.2C_GS.base) --- доступен для программных нужд.


### Задача 2 --- инициализация TSS и регистра `TR`

Реализуйте [метод](../../doc/kernel/smp/cpu/struct.Cpu.html#method.set_tss)

```rust
fn Cpu::set_tss()
```

Он должен завести в GDT запись для Task State Segment текущего процессора.
И загрузить её в [`TR`](https://wiki.osdev.org/CPU_Registers_x86-64#TR) своего CPU.
Сам Task State Segment в поле [`Cpu::tss`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.tss)
уже инициализирован методом
[`Cpu::new()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.new).

Для определения идентификатора текущего процессора можно использовать
[`Cpu::id()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.id).
Полезно проверить, что он выдаёт ровно такое же значение, что и метод
[`LocalApic::id()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.id).
Если это не так, значит инициализация local APIC ранее или запуск AP в одной из дальнейших задач выполняется неверно.

Также вам пригодятся:

- [`kernel::memory::gdt::GDT`](../../doc/kernel/memory/gdt/struct.GDT.html),
- [`kernel::memory::gdt::Gdt::set_tss()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.set_tss),
- [`kernel::memory::gdt::Gdt::tss()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.tss),
- [`x86_64::instructions::tables::load_tss`](../../doc/x86_64/instructions/tables/fn.load_tss.html).


### Задача 3 --- инициализация регистра `FS`

Регистр `FS` будем использовать для аналога
[thread--local storage](https://en.wikipedia.org/wiki/Thread-local_storage), ---
CPU--local storage.
Например, в момент получения системного вызова процессор работает на стеке пользователя.
Доверять стеку пользователя нельзя, поэтому до использования стека процессор должен переключиться на стек ядра.
Адрес стека ядра, предназначенного данному CPU, он возьмёт из нашего CPU--local storage, обратившись к нему через свой регистр `FS`.
Как вы уже догадались, сам CPU--local storage в Nikka --- это структура
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html).

Реализуйте [метод](../../doc/kernel/smp/cpu/struct.Cpu.html#method.set_fs)

```rust
fn Cpu::set_fs()
```

Он должен сохранить адрес структуры
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
для текущего CPU в его собственном регистре `FS`.
Этот же адрес нужно будет записать в поле
[`Cpu::this`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.this).
Дело в том, что адресовать память относительно регистра `FS` можно, но узнать его абсолютный адрес можно только прочитав его напрямую.
Получить абсолютный адрес через инструкцию `lea` не получится.
А адресовать что-либо через `FS` неудобно --- это можно сделать только в ассемблере.
Самым удобным представляется такой вариант: прочитать адрес структуры
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
из поля
[`Cpu::this`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.this),
обращаясь к самому этому полю относительно регистра `FS`.
А дальше, имея абсолютный адрес структуры
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
получить её саму и дальше обращаться к её полям и методам без использования `FS`.
Что уже можно делать в Rust безо всякого ассемблера.

Для сохранения значения в регистр `FS` вам пригодится метод
[`x86_64::registers::model_specific::FsBase::write()`](../../doc/x86_64/registers/model_specific/struct.FsBase.html#method.write).
Он принимает
[`x86_64::addr::VirtAddr`](../../doc/x86_64/addr/struct.VirtAddr.html),
а не
[`kernel::memory::Virt`](../../doc/kernel/memory/type.Virt.html).
Для преобразования
[`Virt`](../../doc/kernel/memory/type.Virt.html) в
[`VirtAddr`](../../doc/x86_64/addr/struct.VirtAddr.html)
можно использовать метод
[`Virt::into()`](../../doc/kernel/memory/addr/struct.Addr.html#method.into),
см. [примеры](../../doc/kernel/memory/type.Virt.html#%D0%9F%D1%80%D0%B5%D0%BE%D0%B1%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F-%D0%BC%D0%B5%D0%B6%D0%B4%D1%83-virt-%D0%B8-virtaddr).

Также вам может пригодиться метод
[`Virt::from_ref()`](../../doc/kernel/memory/addr/struct.Addr.html#method.from_ref).


### Задача 4 --- использование регистра `FS` для получения текущего [`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)

Реализуйте [метод](../../doc/kernel/smp/cpu/struct.Cpu.html#method.get)

```rust
unsafe fn Cpu::get() -> &'static mut Cpu
```

`unsafe` означает, что вызывающая сторона должна гарантировать, что вызывает
[`Cpu::get()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.get)
только после инициализации `FS` методом
[`Cpu::set_fs()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.set_fs).
Иначе в лучшем случае будет паника, а в худшем --- обращение к невалидной или занятой другими данными памяти.

Загрузите из инициализированного в предыдущей задаче
[`Cpu::this`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.this)
адрес структуры
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html).
Однако
[`Cpu::this`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.this) ---
это поле структуры, адрес которой мы как раз хотим узнать.
Поэтому нам придётся использовать обращение через инициализированный в предыдущей задаче регистр `FS`.

Тут придётся использовать ассемблер, например прибегнуть к макросу
[`asm!()`](https://doc.rust-lang.org/core/arch/macro.asm.html),
документацию на который можно посмотреть в
[Rust By Example](https://doc.rust-lang.org/nightly/rust-by-example/unsafe/asm.html) и
[The Rust Reference](https://doc.rust-lang.org/nightly/reference/inline-assembly.html).

Также понадобится передать в ассемблерную инструкцию константу, определяющую смещение поля
[`Cpu::this`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.this)
внутри структуры
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html).
Для этого пригодится макрос
[`memoffset::offset_of!()`](../../doc/memoffset/macro.offset_of.html).

Полученный адрес нужно будет сохранить в переменной подходящего типа, поддерживаемом макросом `asm!()`, например `usize`.
Преобразовать его в ссылку на структуру
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
можно с помощью
[`Virt`](../../doc/kernel/memory/type.Virt.html).
Он выполнит необходимые проверки на валидность этого адреса.
В случае, если проверки не пройдут и вернётся ошибка, можно паниковать.


### Задача 5 --- Инициализация вектора структур [`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)

Чтобы пользоваться структурами
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
для них и для содержащихся в них стеках нужно выделить память.

Реализуйте [функцию](../../doc/kernel/smp/cpu/fn.init_cpu_vec.html)

```rust
fn init_cpu_vec(cpu_count: usize) -> Result<Vec<Cpu>>
```

Все нужные стеки в количестве
`cpu_count *`[`Cpu::STACKS_PER_CPU`](../../doc/kernel/smp/cpu/struct.Cpu.html#associatedconstant.STACKS_PER_CPU)
можно выделить одним вызовом метода
[`kernel::memory::stack::Stack::new_slice()`](../../doc/kernel/memory/stack/struct.Stack.html#method.new_slice).
А для избежания переаллокаций при выделении памяти под
[`Vec`](https://doc.rust-lang.org/nightly/alloc/vec/struct.Vec.html)`<`[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)`>`
стоит использовать метод
[`alloc::vec::Vec::with_capacity()`](https://doc.rust-lang.org/nightly/alloc/vec/struct.Vec.html#method.with_capacity).

Далее нужно будет заполнить этот вектор передавая в метод
[`Cpu::new()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.new)
индекс соответствующей структуры в векторе в качестве идентификатора CPU
[`kernel::smp::local_apic::CpuId`](../../doc/kernel/smp/local_apic/type.CpuId.html)
и срез из части ранее выделенных стеков в количестве
[`Cpu::STACKS_PER_CPU`](../../doc/kernel/smp/cpu/struct.Cpu.html#associatedconstant.STACKS_PER_CPU)
штук.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/smp/cpu.rs |   32 ++++++++++++++++++++++++++++----
 1 file changed, 28 insertions(+), 4 deletions(-)
```