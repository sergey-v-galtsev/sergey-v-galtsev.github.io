## Переход в режим пользователя

После того как мы загрузили пользовательский процесс в память,
можно запустить его.
Для это требуется не только перейти на его точку входа, но и переключить процессор в непривилегированный режим --- в
[кольцо защиты](https://en.wikipedia.org/wiki/Protection_ring) 3.
Иначе пользовательский процесс сможет испортить код или данные ядра и других процессов.
Есть [несколько вариантов](https://wiki.osdev.org/Getting_to_Ring_3) сделать это.
Воспользуемся инструкцией
[`iretq`](https://www.felixcloutier.com/x86/iret:iretd:iretq).


### Состояние регистров пользовательского процесса

Состояние регистров пользовательского процесса хранится в структуре
[`kernel::process::registers::Registers`](../../doc/kernel/process/registers/struct.Registers.html).
Для использования
[`iretq`](https://www.felixcloutier.com/x86/iret:iretd:iretq)
нам понадобится её поле
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
Которая имеет ровно такое представление в памяти, какого требует инструкция
[`iretq`](https://www.felixcloutier.com/x86/iret:iretd:iretq).
Если регистр `RSP` указывает на адрес
[`ModeContext`](../../doc/kernel/process/registers/struct.ModeContext.html)
в момент выполнения инструкции
[`iretq`](https://www.felixcloutier.com/x86/iret:iretd:iretq),
процессор загрузит

- поле [`ModeContext::rip`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.rip) в регистр адреса команды `RIP`,
- поле [`ModeContext::cs`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) в регистр сегмента кода `CS`,
- поле [`ModeContext::rflags`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.rflags) в регистр флагов `RFLAGS`,
- поле [`ModeContext::rsp`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.rsp) в регистр адреса стека `RSP`,
- поле [`ModeContext::ss`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.ss) в регистр сегмента стека `SS`.

Слово mode в [`ModeContext`](../../doc/kernel/process/registers/struct.ModeContext.html)
символизирует тот факт, что эта структура позволяет переключаться между режимами пользователя и ядра.

С помощью метода
[`ModeContext::user_context()`](../../doc/kernel/process/registers/struct.ModeContext.html#method.user_context)
заполним эти поля так:

- Поле [`ModeContext::rip`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.rip) будет содержать точку входа в программу пользователя, которую возвращает функция [`kernel::process::elf::load()`](../../doc/kernel/process/elf/fn.load.html).
- Поле [`ModeContext::cs`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.cs) --- селектор кода пользователя, который возвращает метод [`kernel::memory::gdt::Gdt::user_code()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.user_code).
- Поле [`ModeContext::rflags`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.rflags) будет содержать единственный включённый флаг --- [`RFlags::INTERRUPT_FLAG`](../../doc/ku/process/registers/struct.RFlags.html#associatedconstant.INTERRUPT_FLAG). Это требуется чтобы по прерыванию, например, от таймера, процессор вернулся в ядро. И пользовательский код не смог его монополизировать.
- Поле [`ModeContext::rsp`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.rsp) будет содержать адрес конца стека пользователя --- в [x86-64](https://en.wikipedia.org/wiki/X86-64) стек растёт от старших адресов к младшим. Стек для пользовательского процесса выделяет функция [`kernel::process::create()`](../../doc/kernel/process/fn.create.html) с помощью метода [`kernel::memory::stack::Stack::new()`](../../doc/kernel/memory/stack/struct.Stack.html#method.new). Метод [`Stack::new()`](../../doc/kernel/memory/stack/struct.Stack.html#method.new) аллоцирует [`kernel::memory::stack::STACK_SIZE`](../../doc/kernel/memory/stack/constant.STACK_SIZE.html) байт памяти и запрещает доступ к младшим [`kernel::memory::stack::GUARD_ZONE_SIZE`](../../doc/kernel/memory/stack/constant.GUARD_ZONE_SIZE.html) байтам из них, чтобы отлавливать переполнение стека. Начальное значение указателя стека возвращает метод [`Stack::pointer()`](../../doc/kernel/memory/stack/struct.Stack.html#method.pointer).
- Поле [`ModeContext::ss`](../../doc/kernel/process/registers/struct.ModeContext.html#structfield.ss) будет содержать селектор данных пользователя, который возвращает метод [`kernel::memory::gdt::Gdt::user_data()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.user_data).

Конкретные значения остальных полей структуры
[`Registers`](../../doc/kernel/process/registers/struct.Registers.html),
в которых хранятся регистры общего назначения кроме `RSP`, нас пока не интересуют.


### Задача 3 --- переключение процессора в режим пользователя и возврат из него

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

Есть надежда, что компилятор тогда не будет сохранять
[callee-saved](https://en.wikipedia.org/wiki/X86_calling_conventions#Callee-saved_%28non-volatile%29_registers)
регистры.
Единственное что, он не согласится на порчу регистров `RBX` и `RBP`.
Эти регистры мы должны будем сохранить на стеке ядра и восстановить вручную.

Таким образом для переключения в режим пользователя метод
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
должен:

- Сохранить регистры `RBX` и `RBP` в стеке ядра.
- Сохранить адрес `registers` в стеке.
- Записать текущее состояние стека ядра. В следующей лабораторке мы реализуем это более продвинутым способом. Пока же предлагается положить `RSP` на стек. После чего сохранить новый указатель на стек, который фактически будет указывать на это сохранённое значение `RSP`, в базу регистра `FS`. Это можно сделать с помощью инструкции [wrmsr](https://www.felixcloutier.com/x86/wrmsr) процессора. Для неё нужно записать новое значение `RSP` в регистровую пару `EDX:EAX` --- младшие 32 бита `RSP` в `EAX`, а старшие 32 бита `RSP` в `EDX`. А также нужно записать идентификатор базы `FS` как [Model-specific register](https://en.wikipedia.org/wiki/Model-specific_register) --- константу [`x86::msr::IA32_FS_BASE`](../../doc/x86/msr/constant.IA32_FS_BASE.html) --- в регистр `ECX`. После чего вызвать [wrmsr](https://www.felixcloutier.com/x86/wrmsr). Теперь по логическому адресу `FS:0` будет доступно значение `RSP` ядра, сохранённое на его стеке.
- Запретить прерывания инструкцией [cli](https://www.felixcloutier.com/x86/cli) процессора. Мы дальше будем переключать стек и не хотим чтобы прерывание записало адрес возврата в неподходящее место.
- Переключить стек, то есть регистр `RSP`, на заданный ему на вход адрес `registers`.
- Восстановить регистры общего назначения с `RAX` по `R15` (кроме `RSP`) из стека. То есть, на самом деле из структуры [`Registers`](../../doc/kernel/process/registers/struct.Registers.html). На которую он переключил свой стек.
- Выполнить инструкцию [`iretq`](https://www.felixcloutier.com/x86/iret:iretd:iretq), чтобы переключиться в контекст пользователя, заданный полем [`Registers::user_context`](../../doc/kernel/process/registers/struct.Registers.html#structfield.user_context). Обратите внимание на суффикс `q` у [`iretq`](https://www.felixcloutier.com/x86/iret:iretd:iretq). Если его не указать, ассемблер сгенерирует машинный код для другого режима работы процессора и до некоторого момента это будет не заметно, так как делать он будет почти то же самое. А потом в неожиданный момент всё сломается и найти такую ошибку будет тяжело.

Последующие инструкции метода
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
будут выполняться при возвращении в режим ядра.
Начало этой части метода
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
помечено меткой `store_user_mode_context`.
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

Итак, после метки `store_user_mode_context` метод
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
должен:

- Вспомнить состояние стека ядра. Его можно прочитать по логическому адресу `FS:0`, так как мы ранее настроили базу `FS` на то место стека, куда сохранили `RSP`. Не пытайтесь прочитать из `FS` инструкцией [rdmsr](https://www.felixcloutier.com/x86/rdmsr), так как это испортит регистры пространства пользователя до того как нам есть куда их сохранить. Если бы мы могли прочитать из `FS` таким способом, записывать `RSP` на стек было бы не нужно. Но этот способ нам тут не подходит. Единственное, что мы можем сделать --- фактически разыменовать `FS` читая по логическому адресу `FS:0`. В котором `FS` задаёт сегмент, а `0` --- смещение.
- Восстановить из стека ядра сохранённый адрес `registers`.
- Переключить стек на этот адрес плюс суммарный размер регистров общего назначения `user_registers_size = const mem::size_of::<Registers>() - mem::size_of::<ModeContext>()`.
- Записать в стек, то есть на самом деле в заданную на вход структуру [`Registers`](../../doc/kernel/process/registers/struct.Registers.html), регистры общего назначения с `R15` по `RAX`. В обратном порядке, так как инструкции `push` и `pop` должны образовывать правильную скобочную последовательность с именами регистров в качестве типов скобок.
- Переключить регистр `RSP` на стек ядра.
- Разрешить прерывания инструкцией [sti](https://www.felixcloutier.com/x86/sti) процессора. Мы вернулись на стек ядра и теперь безопасно получить прерывание, что приведёт к записи адреса возврата на стек.
- Вытолкнуть из стека ядра сохранённый там адрес `registers`. Неважно куда, он больше не понадобится.
- Восстановить регистры `RBX` и `RBP`, помня про правильную скобочную последовательность.

Не стоит смешивать в одном макросе `asm!()` автоматическое выделение регистра компилятором --- `in(reg)`, ---
и явное использование фиксированного регистра в какой-либо инструкции вами самостоятельно.
Компилятор не парсит ассемблер и не знает что вы какие-то регистры в нём явно используете.
И, аллоцируя регистр в `in(reg)`, не может проверить коллизии.
А при коллизии вам гарантируется сложная и продолжительная отладка.
Ещё один источник проблем ---
модификация регистра, который вы указали в `in(...)`, но не указали в `lateout(...)`.
Из [документации](https://doc.rust-lang.org/nightly/reference/inline-assembly.html#operand-type):
> `in(<reg>) <expr>`
>
> - ...
> - The allocated register must contain the same value at the end of the asm code (except if a `lateout` is allocated to the same register).

При желании вы можете отступить от предложенной схемы и реализовать любой другой работающий вариант.
Например, регистры общего назначения можно сохранять и восстанавливать командами
[`mov`](https://www.felixcloutier.com/x86/mov).

> Вместо запрета прерываний на время манипуляций со стеком ядра можно было бы
> выделить для всех прерываний отдельный стек.
> Такой стек должен был бы быть собственным у каждого процессора.
> То есть, понадобилось бы сделать каждому процессору свою таблицу прерываний
> [`kernel::interrupts::IDT`](../../doc/kernel/interrupts/struct.IDT.html).


### Логирование в режиме пользователя

Учтите, что в режиме пользователя структурированное логирование макросами библиотеки
[tracing](https://docs.rs/tracing/) ---
`info!()`, `debug!()` и т.д., пока работать не будет.
В следующей задаче мы сделаем ему временную замену --- системный вызов `log_value()`.
А чтобы заработало привычное структурированное логирование, нужно сделать
[первую часть пятой лабораторки](https://sergey-v-galtsev.github.io/labs-description/lab/book/5-um-1-ring-buffer.html).


### Проверьте себя

Запустите тест `3-process-3-user-mode` из файла
[`kernel/tests/3-process-3-user-mode.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/3-process-3-user-mode.rs):

```console
$ (cd kernel; cargo test --test 3-process-3-user-mode)
...
3_process_3_user_mode::user_mode_page_fault--------------------
19:22:04 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
19:22:04 0 I duplicate; address_space = "process" @ 0p7F1C000
19:22:04 0 I switch to; address_space = "process" @ 0p7F1C000
19:22:04 0 D extend mapping; block = [0v10000000, 0v100074E4), size 29.223 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
19:22:04 0 D elf loadable program header; file_block = [0v201CE2, 0v2091C6), size 29.223 KiB; memory_block = [0v10000000, 0v100074E4), size 29.223 KiB; flags =   R
19:22:04 0 D extend mapping; block = [0v10008000, 0v10052E9D), size 299.653 KiB; page_block = [0v10008000, 0v10053000), size 300.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
19:22:04 0 D elf loadable program header; file_block = [0v2091D2, 0v254B7F), size 302.419 KiB; memory_block = [0v100074F0, 0v10052E9D), size 302.419 KiB; flags = X R
19:22:04 0 D elf loadable program header; file_block = [0v254B82, 0v254C72), size 240 B; memory_block = [0v10052EA0, 0v10052F90), size 240 B; flags =  WR
19:22:04 0 D extend mapping; block = [0v10053000, 0v10058FF0), size 23.984 KiB; page_block = [0v10053000, 0v10059000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
19:22:04 0 D elf loadable program header; file_block = [0v254C72, 0v25ACAA), size 24.055 KiB; memory_block = [0v10052F90, 0v10058FF0), size 24.094 KiB; flags =  WR
19:22:04 0 I switch to; address_space = "base" @ 0p1000
19:22:04 0 I loaded ELF file; context = { rip: 0v10007A90, rsp: 0v7F7FFFFFF000 }; file_size = 5.303 MiB; process = { pid: <current>, address_space: "process" @ 0p7F1C000, { rip: 0v10007A90, rsp: 0v7F7FFFFFF000 } }
19:22:04 0 I user process page table entry; entry_point = 0v10007A90; frame = Frame(32511 @ 0p7EFF000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
19:22:04 0 D process_frames = 130
19:22:04 0 I switch to; address_space = "process" @ 0p7F1C000
19:22:04 0 D entering the user mode; pid = <current>; registers = { rax: 0x0, rdi: 0x7F7FFFFED000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10007A90, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags:  } }
19:22:04 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10007A31, ss:rsp: 0x001B:0v0, rflags: ZF PF }
19:22:05 0 D leaving the user mode; pid = <current>
19:22:05 0 I switch to; address_space = "base" @ 0p1000
19:22:05 0 I drop the current address space; address_space = "process" @ 0p7F1C000; switch_to = "base" @ 0p1000
3_process_3_user_mode::user_mode_page_fault----------- [passed]

3_process_3_user_mode::user_context_saved----------------------
19:22:05 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
19:22:05 0 I duplicate; address_space = "process" @ 0p7F1C000
19:22:05 0 I switch to; address_space = "process" @ 0p7F1C000
19:22:05 0 D extend mapping; block = [0v10000000, 0v100074E4), size 29.223 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
19:22:05 0 D elf loadable program header; file_block = [0v201CE2, 0v2091C6), size 29.223 KiB; memory_block = [0v10000000, 0v100074E4), size 29.223 KiB; flags =   R
19:22:05 0 D extend mapping; block = [0v10008000, 0v10052E9D), size 299.653 KiB; page_block = [0v10008000, 0v10053000), size 300.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
19:22:05 0 D elf loadable program header; file_block = [0v2091D2, 0v254B7F), size 302.419 KiB; memory_block = [0v100074F0, 0v10052E9D), size 302.419 KiB; flags = X R
19:22:05 0 D elf loadable program header; file_block = [0v254B82, 0v254C72), size 240 B; memory_block = [0v10052EA0, 0v10052F90), size 240 B; flags =  WR
19:22:05 0 D extend mapping; block = [0v10053000, 0v10058FF0), size 23.984 KiB; page_block = [0v10053000, 0v10059000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
19:22:05 0 D elf loadable program header; file_block = [0v254C72, 0v25ACAA), size 24.055 KiB; memory_block = [0v10052F90, 0v10058FF0), size 24.094 KiB; flags =  WR
19:22:05 0 I switch to; address_space = "base" @ 0p1000
19:22:05 0 I loaded ELF file; context = { rip: 0v10007A90, rsp: 0v7F7FFFFFF000 }; file_size = 5.303 MiB; process = { pid: <current>, address_space: "process" @ 0p7F1C000, { rip: 0v10007A90, rsp: 0v7F7FFFFFF000 } }
19:22:05 0 I user process page table entry; entry_point = 0v10007A90; frame = Frame(32532 @ 0p7F14000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
19:22:05 0 D process_frames = 130
19:22:05 0 I switch to; address_space = "process" @ 0p7F1C000
19:22:05 0 D entering the user mode; pid = <current>; registers = { rax: 0x0, rdi: 0x7F7FFFFED000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10007A90, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags:  } }
19:22:05 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10007A31, ss:rsp: 0x001B:0v0, rflags: ZF PF }
19:22:05 0 D leaving the user mode; pid = <current>
19:22:05 0 D user_registers = [77701, 77702, 77703, 77704, 77705, 77706, 77707, 77708, 77709, 77710, 77711, 77712, 77713, 77714, 77715]
19:22:05 0 I switch to; address_space = "base" @ 0p1000
19:22:05 0 I drop the current address space; address_space = "process" @ 0p7F1C000; switch_to = "base" @ 0p1000
3_process_3_user_mode::user_context_saved------------- [passed]
```

Если вы получаете Page Fault в ядре при доступе к адресу `0vFFFFFFFFFFFFFFF8`:

```
19:53:29 0 E kernel mode trap; trap = "Page Fault"; number = 14; info = { code: 0b10 = non-present page | write | kernel, address: 0vFFFFFFFFFFFFFFF8 }; context = { mode: kernel, cs:rip: 0x0008:0v76FF50, ss:rsp: 0x0010:0v0, rflags: IF }
panicked at 'kernel mode trap #14 - Page Fault
ModeContext { rip: Virt(0v76FF50), cs: 8, rflags: RFlags(514), rsp: Virt(0v0), ss: 16 }', kernel/src/interrupts.rs:408:13
```

Это означает, что прерывания разрешаются в неправильный момент, когда ядро ещё не переключилось на свой стек.
В этом логе видно, что `RSP` нулевой --- `ss:rsp: 0x0010:0v0`.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/registers.rs |   63 ++++++++++++++++++++++++++++++++++++++--
 1 file changed, 60 insertions(+), 3 deletions(-)
```
