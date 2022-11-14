## Состояние каждого процессора

В Nikka состояние отдельного процессора описано в структуре
[`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html),
определённой в [`kernel/src/smp/cpu.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/cpu.rs).
Номер процессора, на котором сейчас происходит выполнение кода, продублирован в этой структуре и его можно узнать с помощью метода
[`Cpu::id()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.id).
Саму структуру
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
текущего процессора можно получить из статического метода
[`Cpu::get()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.get).

Состояние каждого процессора включает:

- Стек ядра [`Cpu::kernel_stack`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.kernel_stack). Процессоры обрабатывают системные вызовы и прерывания независимо, так что у каждого должен быть свой стек для этого.
- Также полезен дополнительный стек [`Cpu::page_fault_stack`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.page_fault_stack), который используется во время обработки Page Fault. Он позволяет напечатать диагностику возникшего исключения даже в случае, когда оно вызвано исчерпанием основного стека ядра.
- [Task State Segment](https://en.wikipedia.org/wiki/Task_state_segment) [`Cpu::tss`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.tss). В TSS хранится `RSP` ядра для текущего процессора. Разумеется, раз стеки разные, то и TSS тоже должны быть разные.
- Исполняющийся на данном CPU в текущий момент пользовательский процесс [`Cpu::current_process`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.current_process). Пользовательские процессы выполняются независимо на разных ядрах. Следовательно, у каждого ядра текущий процесс должен быть своим.
- Системные регистры. У каждого процессора свои системные регистры. Так что функции их инициализации должны быть вызваны для каждого CPU. Явно в структуре [`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html) регистры не хранятся.
  - [`GDTR`](https://wiki.osdev.org/GDT#GDTR) --- Global Descriptor Table Register, содержит адрес [kernel::memory::gdt::Gdt](../../doc/kernel/memory/gdt/type.Gdt.html).
  - [`IDTR`](https://wiki.osdev.org/IDT#IDTR) --- Interrupt Descriptor Table Register, содержит адрес [x86_64::structures::idt::InterruptDescriptorTable](../../doc/x86_64/structures/idt/struct.InterruptDescriptorTable.html).
  - [`CR3`](https://wiki.osdev.org/CPU_Registers_x86-64#CR3) --- содержит адрес корневой таблицы страниц [ku::memory::mmu::PageTable](../../doc/ku/memory/mmu/type.PageTable.html).
  - [`TR`](https://wiki.osdev.org/CPU_Registers_x86-64#TR) --- Task Register, содержит адрес [x86_64::structures::tss::TaskStateSegment](../../doc/x86_64/structures/tss/struct.TaskStateSegment.html).
  - [`FS`](https://wiki.osdev.org/CPU_Registers_x86-64#FS.base.2C_GS.base) --- доступен для программных нужд.


### Задача 3 --- вектор структур [`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)


#### Инициализация TSS и регистра `TR`

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


#### Инициализация регистра `FS`

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
Дело в том, что адресовать память относительно регистра `FS` можно,
но узнать его линейный адрес можно только прочитав его напрямую
инструкцией [rdmsr](https://www.felixcloutier.com/x86/rdmsr).
Получить линейный адрес через инструкцию
[`lea`](https://www.felixcloutier.com/x86/lea)
не получится.
А адресовать что-либо через `FS` неудобно --- это можно сделать только в ассемблере.
Самым удобным представляется такой вариант.
Прочитать адрес структуры
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
из поля
[`Cpu::this`](../../doc/kernel/smp/cpu/struct.Cpu.html#structfield.this),
обращаясь к самому этому полю относительно регистра `FS`,
то есть используя логический адрес `<сегментный_регистр>:<смещение>`.
А дальше, имея линейный адрес структуры
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
получить её саму и дальше обращаться к её полям и методам без использования `FS`.
Что уже можно делать в Rust безо всякого ассемблера.

По умолчанию код пользователя не может менять регистры `FS` и `GS`, так это и оставим.
Если бы мы разрешили ему их менять, например для реализации
[thread-local storage](https://en.wikipedia.org/wiki/Thread-local_storage) (TLS),
нам также понадобилась бы инструкция
[swapgs](https://www.felixcloutier.com/x86/swapgs)
при переключении между режимами ядра и пользователя.

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


#### Использование регистра `FS` для получения текущего [`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)

Реализуйте [метод](../../doc/kernel/smp/cpu/struct.Cpu.html#method.get)

```rust
unsafe fn Cpu::get() -> &'static mut Cpu
```

`unsafe` означает, что вызывающая сторона должна гарантировать, что вызывает
[`Cpu::get()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.get)
только после инициализации `FS` методом
[`Cpu::set_fs()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.set_fs).
Иначе в лучшем случае будет паника, а в худшем --- обращение к невалидной или занятой другими данными памяти.

Загрузите из инициализированного в предыдущей задаче поля
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

Полученный адрес нужно будет сохранить в переменной подходящего типа,
поддерживаемого макросом `asm!()`, например `usize`.
Преобразовать его в ссылку на структуру
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
можно с помощью
[`Virt`](../../doc/kernel/memory/type.Virt.html).
Который выполнит необходимые проверки на валидность этого адреса.
В случае, если проверки не пройдут и вернётся ошибка, можно паниковать.

Так как поменялось назначение сегментного регистра `FS`,
поправьте код метода
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
который вы реализовали в
[задаче про переключение процессора в режим пользователя](../../lab/book/3-process-3-user-mode.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-3--%D0%BF%D0%B5%D1%80%D0%B5%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%BE%D1%80%D0%B0-%D0%B2-%D1%80%D0%B5%D0%B6%D0%B8%D0%BC-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8F-%D0%B8-%D0%B2%D0%BE%D0%B7%D0%B2%D1%80%D0%B0%D1%82-%D0%B8%D0%B7-%D0%BD%D0%B5%D0%B3%D0%BE).
А также код метода
[`kernel::process::syscall::syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html),
который участвует в
[диспетчеризации системных вызовов](../../lab/book/3-process-4-syscall.html#%D0%94%D0%B8%D1%81%D0%BF%D0%B5%D1%82%D1%87%D0%B5%D1%80%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F-%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D0%BD%D1%8B%D1%85-%D0%B2%D1%8B%D0%B7%D0%BE%D0%B2%D0%BE%D0%B2)
и был добавлен в соответствующей
[задаче](../../lab/book/3-process-4-syscall.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-4--%D0%BF%D0%BE%D0%B4%D0%B4%D0%B5%D1%80%D0%B6%D0%BA%D0%B0-%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D0%BD%D1%8B%D1%85-%D0%B2%D1%8B%D0%B7%D0%BE%D0%B2%D0%BE%D0%B2).
Теперь `RSP` нужно писать не в стек, а по адресу `FS:offset`, где `offset` --- смещение `RSP` ядра в структуре
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html).
Для этого смещения есть константа
[`kernel::smp::cpu::KERNEL_RSP_OFFSET_IN_CPU`](../../doc/kernel/smp/cpu/constant.KERNEL_RSP_OFFSET_IN_CPU.html).
А запись `RSP` в стек и его сохранение в
[`syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)
нужно будет удалить.
Обратите внимание, что в ассемблере всё также нужно использовать запись `FS:offset`.
Высокоуровневые методы вроде
[`Cpu::get()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.get)
доступны только для Rust--кода --- до переключения стека невозможно корректно позвать Rust--функцию.


#### Инициализация вектора структур [`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)

Чтобы пользоваться структурами
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html),
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


### Проверьте себя

Запустите тест `4-concurrency-3-cpus` из файла
[`kernel/src/tests/4-concurrency-3-cpus.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/4-concurrency-3-cpus.rs):

```console
$ (cd kernel; cargo test --test 4-concurrency-3-cpus)
...
4_concurrency_3_cpus::initialized---------------------------
20:26:42 0 I cpu = 0; local_apic_id = 0
20:26:42 0 I cpu = 0; kernel_stack = 0v7FFFFFEB8000; frame = Frame(32427 @ 0p7EAB000); flags = PRESENT | WRITABLE | ACCESSED | DIRTY | NO_EXECUTE
4_concurrency_3_cpus::initialized------------------ [passed]
20:26:43 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/smp/cpu.rs |   54 ++++++++++++++++++++++++++++++++++++++++++--------
 1 file changed, 46 insertions(+), 8 deletions(-)
```
