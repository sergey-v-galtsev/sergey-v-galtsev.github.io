## Переход в режим пользователя

После того как мы загрузили пользовательский процесс в память,
можно запустить его.
Для это требуется не только перейти на его точку входа, но и переключить процессор в непривилегированный режим --- в
[кольцо защиты](https://en.wikipedia.org/wiki/Protection_ring) 3.
Иначе пользовательский процесс сможет испортить код или данные ядра и других процессов.
Есть [несколько вариантов](https://wiki.osdev.org/Getting_to_Ring_3) сделать это.
Воспользуемся инструкцией `iret`.


### Состояние регистров пользовательского процесса

Состояние регистров пользовательского процесса хранится в структуре
[`kernel::process::registers::Registers`](../../doc/kernel/process/registers/struct.Registers.html).
Для использования `iret` нам понадобится её поле
[`Registers::user_context`](../../doc/kernel/process/registers/struct.Registers.html#structfield.user_context).
Оно является структурой
[`kernel::process::registers::ModeContext`](../../doc/kernel/process/registers/struct.ModeContext.html):
```rust
#[repr(C)]
pub(crate) struct ModeContext {
    rip: Virt,
    cs: usize,
    rflags: RFlags,
    rsp: Virt,
    ss: usize,
}
```
имеющей в памяти ровно такое представление, какого требует инструкция `iret`.
Если регистр `RSP` указывает на адрес
[`ModeContext`](../../doc/kernel/process/registers/struct.ModeContext.html)
в момент выполнения инструкции `iret`,
процессор загрузит

- поле [`ModeContext::rip`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.rip) в регистр адреса команды `RIP`,
- поле [`ModeContext::cs`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) в регистр сегмента кода `CS`,
- поле [`ModeContext::rflags`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) в регистр флагов `RFLAGS`,
- поле [`ModeContext::rsp`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) в регистр адреса стека `RSP`,
- поле [`ModeContext::ss`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) в регистр сегмента стека `SS`.

Слово mode в [`ModeContext`](../../doc/kernel/process/registers/struct.ModeContext.html)
символизирует тот факт, что эта структура позволяет переключаться между режимами пользователя и ядра.

С помощью метода
[`ModeContext::user_context()`](../../doc/kernel/process/registers/struct.ModeContext.html#method.user_code)
заполним эти поля так:

- Поле [`ModeContext::rip`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.rip) будет содержать точку входа в программу пользователя, которую возвращает функция [`load()`](../../doc/kernel/process/elf/fn.load.html).
- Поле [`ModeContext::cs`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) --- селектор кода пользователя, который возвращает метод [`kernel::memory::gdt::Gdt::user_code()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.user_code).
- Поле [`ModeContext::rflags`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) будет содержать единственный включённый флаг --- [`RFlags::INTERRUPT_FLAG`](../../doc/kernel/process/registers/struct.RFlags.html#associatedconstant.INTERRUPT_FLAG). Это требуется чтобы по прерыванию, например, от таймера, процессор вернулся в ядро. И пользовательский код не смог его монополизировать.
- Поле [`ModeContext::rsp`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) будет содержать адрес конца стека пользователя --- в [x86-64](https://en.wikipedia.org/wiki/X86-64) стек растёт от старших адресов к младшим. Стек для пользовательского процесса выделяет функция [`kernel::process::create()`](../../doc/kernel/process/fn.create.html) с помощью метода [`kernel::memory::stack::Stack::new()`](../../doc/kernel/memory/stack/struct.Stack.html#method.new). Метод [`Stack::new()`](../../doc/kernel/memory/stack/struct.Stack.html#method.new) аллоцирует [`kernel::memory::stack::STACK_SIZE`](../../doc/kernel/memory/stack/constant.STACK_SIZE.html) байт памяти и запрещает доступ к младшим [`kernel::memory::stack::GUARD_ZONE_SIZE`](../../doc/kernel/memory/stack/constant.GUARD_ZONE_SIZE.html) байтам из них, чтобы отлавливать переполнение стека. Начальное значение указателя стека возвращает метод [`Stack::pointer()`](../../doc/kernel/memory/stack/struct.Stack.html#method.pointer).
- Поле [`ModeContext::ss`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) --- селектор данных пользователя, который возвращает метод [`kernel::memory::gdt::Gdt::user_data()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.user_data).

Конкретные значения остальных полей структуры
[`Registers`](../../doc/kernel/process/registers/struct.Registers.html),
в которых хранятся регистры общего назначения нас пока не интересуют.


### Задача 7 --- переключение процессора в режим пользователя и возврат из него

Само переключение выполняет [метод](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)

```rust
unsafe fn Registers::switch_to(registers: *const Registers)
```

Для его реализации придётся использовать ассемблер, например прибегнуть к макросу
[`asm!()`](https://doc.rust-lang.org/core/arch/macro.asm.html),
документацию на который можно посмотреть в
[Rust By Example](https://doc.rust-lang.org/nightly/rust-by-example/unsafe/asm.html) и
[The Rust Reference](https://doc.rust-lang.org/nightly/reference/inline-assembly.html).

Мы не будем явно сохранять контекст ядра.
Пусть это сделает за нас компилятор.
Мы просто укажем ему, что испортили состояние всех регистров, с помощью конструкции `lateout(...) _`:

```rust
asm!(
    "
    ...
    ",
    ...
    lateout("rax") _,
    ...
);
```

Есть надежда, что компилятор тогда не будет сохранять [callee-saved](https://en.wikipedia.org/wiki/X86_calling_conventions#Callee-saved_%28non-volatile%29_registers) регистры нестандартизированного Rust ABI.
Единственное что, он не согласится на порчу регистров `RBX` и `RBP`.
Эти регистры мы должны будем сохранить на стеке ядра и восстановить вручную.

Таким образом для переключения в режим пользователя метод
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
должен:

- Сохранить регистры `RBX` и `RBP` в стеке ядра.
- Сохранить адрес `registers` в стеке.
- Записать текущее состояние стека ядра.
- Переключить стек, то есть регистр `RSP`, на заданный ему на вход адрес `registers`.
- Восстановить из стека, то есть на самом деле из структуры [`Registers`](../../doc/kernel/process/registers/struct.Registers.html), на которую он переключил свой стек, регистры общего назначения с `RAX` по `R15`.
- Выполнить инструкцию `iretq`, чтобы переключиться в процесс пользователя заданный полем [`Registers::user_context`](../../doc/kernel/process/registers/struct.Registers.html#structfield.user_context).

Последующие инструкции метода
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
будут выполняться при возвращении в режим ядра.
Начало этой части метода
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
помечено меткой `store_user_mode_context:`.
Парный метод
[`Registers::switch_from()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_from)
просто прыгает на эту метку:

```rust
    pub(super) unsafe extern "C" fn switch_from() -> ! {
        asm!(
            "jmp store_user_mode_context",
            options(noreturn),
        );
    }
```

Когда пользовательский код выполнит системный вызов и процессор окажется в режиме ядра, мы сможем вызвать
[`Registers::switch_from()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_from)
для прекращения исполнения кода пользователя и возврата ровно в тот контекст ядра, который выполнил вызов
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to).
Например, это может быть контекст планировщика, который продолжит свой цикл исполнения, выберет следующий процесс и переключится уже в него.

Итак, после метки `store_user_mode_context:` метод
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
должен:

- Вспомнить состояние стека ядра.
- Восстановить из него сохранённый адрес `registers`.
- Переключить стек на это адрес плюс суммарный размер регистров общего назначения `user_registers_size = const mem::size_of::<Registers>() - mem::size_of::<ModeContext>()`.
- Записать в стек, то есть на самом деле в заданную на вход структуру [`Registers`](../../doc/kernel/process/registers/struct.Registers.html), регистры общего назначения с `R15` по `RAX`. В обратном порядке, так как инструкции `push` и `pop` должны образовывать правильную скобочную последовательность с именами регистров в качестве типов скобок.
- Переключить регистр `RSP` на стек ядра.
- Вытолкнуть из стека ядра сохранённый там адрес `registers`. Неважно куда, он больше не понадобится.
- Восстановить регистры `RBX` и `RBP`, помня про правильную скобочную последовательность.

При желании вы можете отступить от предложенной схемы и реализовать любой другой работающий вариант.
Например, регистры общего назначения можно сохранять и восстанавливать командами `mov`.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/registers.rs |   63 ++++++++++++++++++++++++++++++++++++++--
 1 file changed, 60 insertions(+), 3 deletions(-)
```
