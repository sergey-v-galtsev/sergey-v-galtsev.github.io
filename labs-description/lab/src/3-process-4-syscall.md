## Поддержка системных вызовов

Для системных вызовов Nikka использует инструкции
[`syscall` и `sysret`](https://wiki.osdev.org/SYSENTER#AMD:_SYSCALL.2FSYSRET),
[добавленные AMD](https://en.wikipedia.org/wiki/X86_instruction_listings#Added_with_AMD_K6)
специально для [64-битного режима](https://en.wikipedia.org/wiki/Long_mode).
Они [работают в этом режиме и на процессорах Intel](https://en.wikipedia.org/wiki/X86-64#Recent_implementations):

> Intel 64 allows SYSCALL/SYSRET only in 64-bit mode (not in compatibility mode), and allows SYSENTER/SYSEXIT in both modes.
> AMD64 lacks SYSENTER/SYSEXIT in both sub-modes of long mode.

То есть, в [64-битном режиме](https://en.wikipedia.org/wiki/Long_mode)
инструкции [`syscall` и `sysret`](https://wiki.osdev.org/SYSENTER#AMD:_SYSCALL.2FSYSRET)
переносимы, в отличие от похожих инструкций
[`sysenter` и `sysexit`](https://wiki.osdev.org/SYSENTER#INTEL:_SYSENTER.2FSYSEXIT).

Прежде чем приступать, изучите документацию производителя процессоров на нужные инструкции:
- [`syscall`](https://www.felixcloutier.com/x86/syscall) и
- [`sysretq`](https://www.felixcloutier.com/x86/sysret),
- а также [`sti`](https://www.felixcloutier.com/x86/sti).


### Задача 4 --- поддержка системных вызовов


#### Инициализация системных вызовов

Реализуйте [функцию](../../doc/kernel/process/syscall/fn.init.html)

```rust
fn kernel::process::syscall::init()
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Она подготавливает процессор к выполнению инструкций
[`syscall` и `sysret`](https://wiki.osdev.org/SYSENTER#AMD:_SYSCALL.2FSYSRET):

- Включает бит [`x86_64::registers::model_specific::EferFlags::SYSTEM_CALL_EXTENSIONS`](../../doc/x86_64/registers/model_specific/struct.EferFlags.html#associatedconstant.SYSTEM_CALL_EXTENSIONS) в регистре [`x86_64::registers::model_specific::Efer`](../../doc/x86_64/registers/model_specific/struct.Efer.html). А остальные биты оставляет в исходном состоянии.
- Записывает в регистр [`x86_64::registers::model_specific::Star`](../../doc/x86_64/registers/model_specific/struct.Star.html) методом [`Star::write()`](../../doc/x86_64/registers/model_specific/struct.Star.html#method.write) селекторы кода и данных для режимов пользователя и ядра --- [`kernel::memory::gdt::Gdt::user_code()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.user_code), [`kernel::memory::gdt::Gdt::user_data()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.user_data), [`kernel::memory::gdt::Gdt::kernel_code()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.kernel_code), [`kernel::memory::gdt::Gdt::kernel_data()`](../../doc/kernel/memory/gdt/struct.SmpGdt.html#method.kernel_data).
- Записывает в регистр [`x86_64::registers::model_specific::LStar`](../../doc/x86_64/registers/model_specific/struct.LStar.html) виртуальный адрес функции [`kernel::process::syscall::syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html).
- Записывает в регистр [`x86_64::registers::model_specific::SFMask`](../../doc/x86_64/registers/model_specific/struct.SFMask.html) маску для регистра флагов `RFLAGS`, которая определяет какие флаги в `RFLAGS` будут сброшены при входе в системный вызов. Нужно сбросить флаг прерываний. Так как если прерывание возникнет сразу после переключения в ядро и до того как ядро переключится в собственный стек, процессор сохранит контекст прерывания на пользовательский стек. А ему, как мы помним, доверять нельзя. Также предлагается сбросить все остальные флаги, просто для определённости состояния `RFLAGS` в момент системного вызова.


#### Диспетчеризация системных вызовов

Реализуйте на ассемблере [функцию](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)

```rust
extern "C" fn syscall_trampoline() -> !
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Она получает управление при выполнении инструкции `syscall` и должна передать управление в написанную на Rust
[функцию](../../doc/kernel/process/syscall/fn.syscall.html)

```rust
#[no_mangle]
extern "C" fn kernel::process::syscall::syscall(
    // https://wiki.osdev.org/System_V_ABI#x86-64:
    // Parameters to functions are passed in the registers rdi, rsi, rdx, rcx, r8, r9, and further values are passed on the stack in reverse order.
    number: usize, // rdi
    arg0: usize,   // rsi
    arg1: usize,   // rdx
    rip: Virt,     // rcx
    rsp: Virt,     // r8
    arg2: usize,   // r9
    // Stack, push in reverse order.
    arg3: usize,
    arg4: usize,
) -> !
```

Указание
[`extern "C"`](https://doc.rust-lang.ru/book/ch19-01-unsafe-rust.html#%D0%98%D1%81%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5-extern-%D1%84%D1%83%D0%BD%D0%BA%D1%86%D0%B8%D0%B9-%D0%B4%D0%BB%D1%8F-%D0%B2%D1%8B%D0%B7%D0%BE%D0%B2%D0%B0-%D0%B2%D0%BD%D0%B5%D1%88%D0%BD%D0%B5%D0%B3%D0%BE-%D0%BA%D0%BE%D0%B4%D0%B0)
в её сигнатуре означает, что она подчиняется соглашениям
[C ABI](https://wiki.osdev.org/System_V_ABI#x86-64) текущей архитектуры.
Подробно про них можно посмотреть в
[System V Application Binary InterfaceAMD64 Architecture Processor Supplement](https://github.com/hjl-tools/x86-psABI/wiki/x86-64-psABI-draft.pdf).

Аннотация
[`#[no_mangle]`](https://doc.rust-lang.org/reference/abi.html#the-no_mangle-attribute)
означает, что имя функции, доступное в ассемблере будет как написано в коде --- `syscall`.
Иначе оно будет искажено для уникализации, --- чтобы не совпадать с таким же именем в другом модуле.
(В C++ искажение имени учитывает ещё и типы аргументов для реализации перегрузки функций.)
Без такой аннотации в ассемблере имя `syscall()` было бы похоже на
`_ZN6kernel7process7syscall7syscall17hc1ae395af68eb49cE`.
Программа `rustfilt` позволяет восстановить искажённое имя:
```console
$ rustfilt _ZN6kernel7process7syscall7syscall17hc1ae395af68eb49cE
kernel::process::syscall::syscall
```
Чтобы не писать в ассемблере что-нибудь вроде
`call _ZN6kernel7process7syscall7syscall17hc1ae395af68eb49cE`,
используем аннотацию
[`#[no_mangle]`](https://doc.rust-lang.org/reference/abi.html#the-no_mangle-attribute).
Но тогда мы сами должны гарантировать уникальность имени, как в ассемблере или C.

На момент входа в [`syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)
регистр `RSP` указывает на стек пользователя.
Мы не можем ему доверять, --- код режима пользователя мог его переполнить, неправильно выровнять, поместить на недоступный для пользователя адрес, например внутрь данных ядра.
Поэтому прежде чем пользоваться стеком,
[`syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)
переключается в стек ядра.
Адрес пользовательского стека --- старое значение `RSP` --- она должна передать в функцию
[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html)
в соответствующем [x86-64 C ABI](https://wiki.osdev.org/System_V_ABI#x86-64) регистре.

Помните, что благодаря маске в регистре
[`x86_64::registers::model_specific::SFMask`](../../doc/x86_64/registers/model_specific/struct.SFMask.html),
процессор выключил прерывания в момент выполнения инструкции
[`SYSCALL`](https://www.felixcloutier.com/x86/syscall)?
Nikka сама по себе не сломается от получения прерывания в момент выполнения системного вызова,
и мы уже на стеке ядра --- самое время включить прерывания с помощью инструкции
[`STI`](https://www.felixcloutier.com/x86/sti).
Если же не включить прерывания, можно например пропустить очередной тик RTC, пока будет выполняться системный вызов.
И тогда в логе может быть неверное время.
Например, тут последовательные строки логирования выглядят как будто между ними прошло 15-16 секунд:

```console
10:48:24 0 D entering the user mode; pid = 0:4; registers = { rax: 0x0, rdi: 0x7F7FFFFAD000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10007550, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
10:48:40.001 0 D leaving the user mode; pid = 0:4
```

А на самом деле было пропущено много RTC прерываний.
Вообще, после инициализации RTC было получено только первое прерывание в 10:48:24.
И подсистема времени всё ещё ориентируется на одну единственную базовую точку в
[`SystemInfo::rtc`](../../doc/ku/info/struct.SystemInfo.html#structfield.rtc),
которая этому первому прерыванию соответствует.
И только в 10:48:40 было получено второе прерывание.
А все промежуточные пропали из-за того, что во время исполнения системных вызовов прерывания были отключены.

То что прерывания запрещены до переключения стека, проверяется в тесте `3-process-4-syscall` из файла
[`kernel/src/tests/3-process-4-syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/3-process-4-syscall.rs)
следующим образом.
Код пользователя из файла
[`user/exit/src/main.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/exit/src/main.rs)
запускается при запрещённых прерываниях.
Он ждёт 100 миллисекунд, этого должно быть достаточно чтобы накопилось несколько тиков
[PIT](https://en.wikipedia.org/wiki/Programmable_interval_timer):
```rust
// Wait for some PIT ticks so an interrupt will be pending on the return to the kernel mode.
// This test is run with interrupts disabled.
// If the kernel enables interrupts before switching the stack it will receive a Page Fault.
time::delay(Duration::milliseconds(100));
```
А значит, появился сигнал о прерывании.
После этого код пользователя записывает `0` в `RSP` и делает системный вызов.
Начинает исполняться код ядра.
И как только он разрешит прерывания, то сразу же получит прерывание от
[PIT](https://en.wikipedia.org/wiki/Programmable_interval_timer).

Если стек ещё не был переключён, это приведёт к Page Fault из-за того что код пользователя испортил `RSP`:

```console
$ (cd kernel; cargo test --test 3-process-4-syscall)
...
3_process_4_syscall::syscall_exit-----------------------------
...
19:32:14 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10007BA0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags:  } }
19:32:14 0 D trap = "Page Fault"; context = { mode: kernel, cs:rip: 0x0008:0v8648E4, ss:rsp: 0x0010:0v0, rflags: IF }; info = { code: 0b11 = protection violation | write | kernel, address: 0vFFFFFFFFFFFFFFF8 }
19:32:14 0 E kernel mode trap; trap = "Page Fault"; number = 14; info = { code: 0b11 = protection violation | write | kernel, address: 0vFFFFFFFFFFFFFFF8 }; context = { mode: kernel, cs:rip: 0x0008:0v8648E4, ss:rsp: 0x0010:0v0, rflags: IF }
panicked at 'kernel mode trap #14 - Page Fault, context: { mode: kernel, cs:rip: 0x0008:0v8648E4, ss:rsp: 0x0010:0v0, rflags: IF }', kernel/src/interrupts.rs:411:13
--------------------------------------------------- [failed]
```

Также учтите, что если вы сохранили `RSP` ядра и настроили базу сегментного регистра `FS` на него,
как предлагалось в
[предыдущей задаче](../../lab/book/3-process-3-user-mode.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-3--%D0%BF%D0%B5%D1%80%D0%B5%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%BE%D1%80%D0%B0-%D0%B2-%D1%80%D0%B5%D0%B6%D0%B8%D0%BC-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8F-%D0%B8-%D0%B2%D0%BE%D0%B7%D0%B2%D1%80%D0%B0%D1%82-%D0%B8%D0%B7-%D0%BD%D0%B5%D0%B3%D0%BE),
то восстановление `RSP` из `FS:0` приведёт к записи в `RSP` состояния до сохранения значения `RSP` на стеке.
То есть, фактически вытолкнет `RSP` со стека.
Но он нам ещё понадобится.
Поэтому после этого действия нужно либо записать `RSP` на стек ещё раз,
либо просто отступить в стеке на соответствующее количество байт.
И только после этого уже можно писать в стек часть аргументов функции
[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html).
Если же вы этого не сделаете, то тест `3-process-4-syscall` упадёт сразу же после выполнения
системного вызова, когда
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
тоже захочет взять из `FS:0` сохранённый им указатель на стек ядра:
```console
$ (cd kernel; cargo test --test 3-process-4-syscall)
...
3_process_4_syscall::syscall_exit-----------------------------
...
20:46:18 0 I syscall = "exit"; pid = 0:0; code = 3141592653589793238; reason = None
20:46:18 0 D trap = "Page Fault"; context = { mode: kernel, cs:rip: 0x0008:0vCE36E6, ss:rsp: 0x0010:0v0, rflags: IF ZF PF }; info = { code: 0b0 = non-present page | read | kernel, address: 0v0 }
20:46:18 0 E kernel mode trap; trap = "Page Fault"; number = 14; info = { code: 0b0 = non-present page | read | kernel, address: 0v0 }; context = { mode: kernel, cs:rip: 0x0008:0vCE36E6, ss:rsp: 0x0010:0v0, rflags: IF ZF PF }
panicked at 'kernel mode trap #14 - Page Fault, context: { mode: kernel, cs:rip: 0x0008:0vCE36E6, ss:rsp: 0x0010:0v0, rflags: IF ZF PF }', kernel/src/interrupts.rs:411:13
--------------------------------------------------- [failed]
```
Это артефакт временного решения, который мы исправим в следующей лабораторке.

После переключения стека, аргументы функции
[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html),
которые по [x86-64 C ABI](https://wiki.osdev.org/System_V_ABI#x86-64)
должны передаваться через стек,
[`syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)
должна записать в стек.
После этого она должна вызвать функцию
[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html).
Так как
[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html)
не возвращается, сохранять адрес возврата в стеке инструкцией
[`call`](https://www.felixcloutier.com/x86/call)
не обязательно, можно сделать
[`jmp`](https://www.felixcloutier.com/x86/jmp).
Но если вы предпочли вариант с
[`jmp`](https://www.felixcloutier.com/x86/jmp),
то скорректируйте значение регистра `RSP`.
Так как вызываемая функция при поиске аргументов, передаваемых через стек,
пропускает в нём место с адресом возврата.
То есть, считает что адрес возврата был сохранён инструкцией
[`call`](https://www.felixcloutier.com/x86/call).

Реализуйте функцию [`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html).
Она выполняет диспетчеризацию системных вызовов по аргументу `number`,
передавая в реализующие конкретные системные вызовы функции нужную часть аргументов `arg0`--`arg4`.
Пока что нам хватит системных вызовов

- [`kernel::process::syscall::exit()`](../../doc/kernel/process/syscall/fn.exit.html) с номером [`ku::process::syscall::Syscall::EXIT`](../../doc/ku/process/syscall/struct.Syscall.html#associatedconstant.EXIT) и
- [`kernel::process::syscall::log_value()`](../../doc/kernel/process/syscall/fn.log_value.html) с номером [`ku::process::syscall::Syscall::LOG_VALUE`](../../doc/ku/process/syscall/struct.Syscall.html#associatedconstant.LOG_VALUE).

После выполнения функции, реализующей нужный системный вызов,
[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html)
передаёт управление в функцию
[`kernel::process::syscall::sysret()`](../../doc/kernel/process/syscall/fn.sysret.html).


#### Возврат из системного вызова

Реализуйте на ассемблере [функцию](../../doc/kernel/process/syscall/fn.sysret.html)

```rust
fn kernel::process::syscall::sysret(
    context: MiniContext,
    result: Result<SyscallResult>,
) -> !
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Она

- Записывает результат системного вызова `result` в регистры общего назначения, например в `RAX`, `RDI`, `RSI`, и т.д. Обратите внимание, что признак и код ошибки, если `result` содержит ошибку, нужно записать в один из регистров --- пользовательскому процессу он тоже важен.
- Записывает в регистр `R11` состояние регистра флагов, которое должно быть в пространстве пользователя. Как минимум должен быть установлен [`RFlags::INTERRUPT_FLAG`](../../doc/ku/process/registers/struct.RFlags.html#associatedconstant.INTERRUPT_FLAG), чтобы процесс не мог монополизировать процессор. Но пока что включение прерываний приведёт к нестабильности теста `3_process_4_syscall::syscall_log_value`. Поэтому предлагается отложить включение [`RFlags::INTERRUPT_FLAG`](../../doc/ku/process/registers/struct.RFlags.html#associatedconstant.INTERRUPT_FLAG) до следующей лабораторки, а пока выключить все флаги при возврате в режим пользователя --- [`RFlags::default()`](../../doc/ku/process/registers/struct.RFlags.html#method.default).
- Записывает адрес возврата в код пользователя в регистр `RCX`. Функции [`syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)/[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html) получили этот адрес в этом же регистре. И должны были его передать вместе с адресом стека пользователя в аргументе `context`.
- Переключает регистр `RSP` на стек пользователя.
- Зануляет все неиспользованные выше регистры общего назначения, чтобы предотвратить утечку информации из режима ядра в режим пользователя.
- Выполняет инструкцию [`sysretq`](https://www.felixcloutier.com/x86/sysret), которая передаёт управление в код пользователя в соответствии с настройками в регистрах `Star`, `R11` и `RCX`. Обратите внимание на суффикс `q` у [`sysretq`](https://www.felixcloutier.com/x86/sysret). Если его не указать, ассемблер сгенерирует машинный код для другого режима работы процессора и до некоторого момента это будет не заметно, так как делать он будет почти то же самое. А потом в неожиданный момент всё сломается и найти такую ошибку будет тяжело.


#### Системный вызов `exit`

Реализуйте [функцию](../../doc/kernel/process/syscall/fn.exit.html)

```rust
fn kernel::process::syscall::exit(
    process: MutexGuard<Process>,
    code: usize,
) -> !
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Она выполняет системный вызов `exit(code)` с одним аргументом `code`.
Код можно, например, залогировать как
[`ku::process::syscall::ExitCode`](../../doc/ku/process/syscall/struct.ExitCode.html).
Основная же работа этого системного вызова заключается в освобождении слота таблицы процессов методом
[`kernel::process::table::Table::free()`](../../doc/kernel/process/table/struct.Table.html#method.free)
и возврате в контекст ядра, из которого пользовательский процесс был запущен.
Это делается статическим методом
[`kernel::process::process::Process::sched_yield()`](../../doc/kernel/process/process/struct.Process.html#method.sched_yield),
которые не возвращают управление, как и сама функция
[`kernel::process::syscall::exit()`](../../doc/kernel/process/syscall/fn.exit.html).

Различие между
[`kernel::process::process::Process::leave_user_mode()`](../../doc/kernel/process/process/struct.Process.html#method.leave_user_mode)
и
[`kernel::process::process::Process::sched_yield()`](../../doc/kernel/process/process/struct.Process.html#method.sched_yield)
состоит в том, что первая сохраняет контекст пользователя.
Пользовательский код готов к системному вызову и тому что тот испортит регистры.
Поэтому контракт такой, что всё нужное ему состояние при системных вызовах он сохраняет сам.
А
[`kernel::process::process::Process::leave_user_mode()`](../../doc/kernel/process/process/struct.Process.html#method.leave_user_mode)
пригодится чтобы принудительно вытеснять процесс в произвольные моменты времени,
когда он к этому не готов.


#### Системный вызов `log_value`

Реализуйте [функцию](../../doc/kernel/process/syscall/fn.log_value.html)

```rust
fn kernel::process::syscall::log_value(
    process: MutexGuard<Process>,
    str_start: usize,
    str_end: usize,
    value: usize,
) -> Result<SyscallResult>
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Это системный вызов, который принимает три аргумента.
В аргументах `str_start` и `str_end` передаётся начало и конец строки типа [`&str`](https://doc.rust-lang.org/nightly/core/primitive.str.html), а в `value` --- произвольное число.

Для проверки корректности пары `str_start` и `str_end` вам пригодятся функции
[`ku::memory::block::Block::<Virt>::from_index()`](../../doc/ku/memory/block/struct.Block.html#method.from_index),
[`kernel::memory::address_space::AddressSpace::check_permission()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission) и
[`core::str::from_utf8()`](https://doc.rust-lang.org/nightly/core/str/fn.from_utf8.html).
Если хотя бы одна из них вернула ошибку, прокиньте её оператором `?` в функцию
[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html),
чтобы она через функцию
[`sysret()`](../../doc/kernel/process/syscall/fn.sysret.html)
вернула эту ошибку в код пользователя.
Ошибку [`core::str::Utf8Error`](https://doc.rust-lang.org/nightly/core/str/struct.Utf8Error.html)
можно преобразовать, например, в
[`ku::error::Error::InvalidArgument`](../../doc/ku/error/enum.Error.html#variant.InvalidArgument).

Далее системный вызов
[`log_value()`](../../doc/kernel/process/syscall/fn.log_value.html)
делает свою основную работу --- логирует получившуюся строку и `value`.
Вам будет удобнее пользоваться
[`log_value()`](../../doc/kernel/process/syscall/fn.log_value.html)
, если вы залогируете `value` и в десятичном, и в шестнадцатеричном виде.
После этого системный вызов возвращает управление.

С помощью этого системного вызова тест `3-process-4-syscall` из файла
[`kernel/src/tests/3-process-4-syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/3-process-4-syscall.rs)
проверяет возможность чтения системного времени из непривилегированного режима пользователя.
Код в файле
[`user/log_value/src/main.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/log_value/src/main.rs)
выполняет вызов `time::now()` и логирует полученное количество секунд с unix-эпохи:

```rust
let now = time::now();
let timestamp = now.timestamp().try_into().unwrap();

if syscall::log_value("user space can read the system time", timestamp).is_err() {
    generate_page_fault();
}
```

Должно залогироваться что-то подобное:

```console
$ (cd kernel; cargo test --test 3-process-4-syscall)
...
3_process_4_syscall::syscall_log_value------------------------
...
04:30:41 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10008BD0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags:  } }
04:30:41 0 I user space can read the system time; value = 1666585841; hex_value = 0x635614F1; pid = 0:0
...
```

Если в первой лабораторке вы попытались воспользоваться
[приёмом "read-dont-modify-write"](https://www.hpl.hp.com/techreports/2012/HPL-2012-68.pdf),
то в режиме пользователя и вызов `time::delay()` из
[`user/exit/src/main.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/exit/src/main.rs)
и вызов `time::now()` из
[`user/log_value/src/main.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/log_value/src/main.rs)
получат Page Fault:

```console
$ (cd kernel; cargo test --test 3-process-4-syscall)
...
3_process_4_syscall::syscall_exit-----------------------------
...
04:55:08 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10007BB0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags:  } }
04:55:08 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000E09C, ss:rsp: 0x001B:0v7F7FFFFFEA78, rflags: PF }; info = { code: 0b111 = protection violation | write | user, address: 0v7F7FFFFEC038 }
04:55:08 0 D leaving the user mode; pid = 0:0
panicked at 'if the Page Fault was in the kernel mode, probably the `syscall` instruction is not initialized or the kernel has not switched to its own stack; if it was in the user mode, maybe the time functions from the first lab use `read-dont-modify-write` construction', kernel/tests/3-process-4-syscall.rs:71:5
--------------------------------------------------- [failed]
```


#### Пользовательская сторона системного вызова

Реализуйте [функцию](../../doc/lib/syscall/fn.syscall.html)

```rust
fn lib::syscall::syscall(
    number: usize,
    arg0: usize,
    arg1: usize,
    arg2: usize,
    arg3: usize,
    arg4: usize,
) -> Result<(usize, usize)>
```

в файле [`user/lib/src/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/lib/src/syscall.rs).

Она работает в режиме пользователя.
Её задача:

- Сохранить регистры `RBX` и `RBP` на стеке.
- Передать свои аргументы через регистры, в которых их ожидают функции
[`kernel::process::syscall::syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html) и
[`kernel::process::syscall::syscall()`](../../doc/kernel/process/syscall/fn.syscall.html).
- Запустить инструкцию [`syscall`](https://www.felixcloutier.com/x86/syscall), которая выполнит требуемый системный вызов.
- Восстановить `RBX` и `RBP`.
- Вернуть наружу результаты системного вызова из регистров, в которые их сохранила функция [`kernel::process::syscall::sysret()`](../../doc/kernel/process/syscall/fn.sysret.html).
- Неиспользованные регистры общего назначения она должна пометить как испорченные уже знакомой конструкцией `lateout(...) _,`.


### Проверьте себя

Запустите тест `3-process-4-syscall` из файла
[`kernel/src/tests/3-process-4-syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/3-process-4-syscall.rs):

```console
$ (cd kernel; cargo test --test 3-process-4-syscall)
...
3_process_4_syscall::syscall_exit-----------------------------
05:13:26 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
05:13:26 0 I duplicate; address_space = "process" @ 0p7F1B000
05:13:26 0 I switch to; address_space = "process" @ 0p7F1B000
05:13:26 0 D extend mapping; block = [0v10000000, 0v10007624), size 29.535 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
05:13:26 0 D elf loadable program header; file_block = [0v201741, 0v208D65), size 29.535 KiB; memory_block = [0v10000000, 0v10007624), size 29.535 KiB; flags =   R
05:13:26 0 D extend mapping; block = [0v10008000, 0v100547AD), size 305.919 KiB; page_block = [0v10008000, 0v10055000), size 308.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
05:13:26 0 D elf loadable program header; file_block = [0v208D71, 0v255EEE), size 308.372 KiB; memory_block = [0v10007630, 0v100547AD), size 308.372 KiB; flags = X R
05:13:26 0 D elf loadable program header; file_block = [0v255EF1, 0v255FE1), size 240 B; memory_block = [0v100547B0, 0v100548A0), size 240 B; flags =  WR
05:13:26 0 D extend mapping; block = [0v10055000, 0v1005AAC0), size 22.688 KiB; page_block = [0v10055000, 0v1005B000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
05:13:26 0 D elf loadable program header; file_block = [0v255FE1, 0v25C1D9), size 24.492 KiB; memory_block = [0v100548A0, 0v1005AAC0), size 24.531 KiB; flags =  WR
05:13:26 0 I switch to; address_space = "base" @ 0p1000
05:13:26 0 I loaded ELF file; context = { rip: 0v10007BA0, rsp: 0v7F7FFFFFF000 }; file_size = 5.372 MiB; process = { pid: <current>, address_space: "process" @ 0p7F1B000, { rip: 0v10007BA0, rsp: 0v7F7FFFFFF000 } }
05:13:26 0 I user process page table entry; entry_point = 0v10007BA0; frame = Frame(32507 @ 0p7EFB000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
05:13:26 0 I switch to; address_space = "0:0" @ 0p7F1B000
05:13:26 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10007BA0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags:  } }
05:13:26 0 I syscall = "exit"; pid = 0:0; code = 3141592653589793238; reason = None
05:13:26 0 D leaving the user mode; pid = 0:0
3_process_4_syscall::syscall_exit-------------------- [passed]

3_process_4_syscall::syscall_log_value------------------------
05:13:27 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
05:13:27 0 I duplicate; address_space = "process" @ 0p7E93000
05:13:27 0 I switch to; address_space = "process" @ 0p7E93000
05:13:27 0 D extend mapping; block = [0v10000000, 0v100073F4), size 28.988 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
05:13:27 0 D elf loadable program header; file_block = [0v760E00, 0v7681F4), size 28.988 KiB; memory_block = [0v10000000, 0v100073F4), size 28.988 KiB; flags =   R
05:13:27 0 D extend mapping; block = [0v10008000, 0v10052422), size 297.033 KiB; page_block = [0v10008000, 0v10053000), size 300.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
05:13:27 0 D elf loadable program header; file_block = [0v768200, 0v7B3222), size 300.033 KiB; memory_block = [0v10007400, 0v10052422), size 300.033 KiB; flags = X R
05:13:27 0 D elf loadable program header; file_block = [0v7B3228, 0v7B3318), size 240 B; memory_block = [0v10052428, 0v10052518), size 240 B; flags =  WR
05:13:27 0 D extend mapping; block = [0v10053000, 0v10058680), size 21.625 KiB; page_block = [0v10053000, 0v10059000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
05:13:27 0 D elf loadable program header; file_block = [0v7B3318, 0v7B9458), size 24.312 KiB; memory_block = [0v10052518, 0v10058680), size 24.352 KiB; flags =  WR
05:13:27 0 I switch to; address_space = "base" @ 0p1000
05:13:27 0 I loaded ELF file; context = { rip: 0v10008BD0, rsp: 0v7F7FFFFFF000 }; file_size = 5.374 MiB; process = { pid: <current>, address_space: "process" @ 0p7E93000, { rip: 0v10008BD0, rsp: 0v7F7FFFFFF000 } }
05:13:27 0 I drop; address_space = "0:0" @ 0p7F1B000
05:13:27 0 I user process page table entry; entry_point = 0v10008BD0; frame = Frame(32370 @ 0p7E72000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
05:13:27 0 I switch to; address_space = "0:0" @ 0p7E93000
05:13:27 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10008BD0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags:  } }
05:13:27 0 I user space can read the system time; value = 1666588407; hex_value = 0x63561EF7; pid = 0:0
05:13:27 0 I ; value = 0; hex_value = 0x0; pid = 0:0
05:13:27 0 W syscall failed; syscall = Some(LOG_VALUE); number = 1; arg0 = 1; arg1 = 1; arg2 = 0; arg3 = 0; arg4 = 1099513729752; error = PermissionDenied
05:13:27 0 W syscall failed; syscall = Some(LOG_VALUE); number = 1; arg0 = 0; arg1 = 0; arg2 = 0; arg3 = 0; arg4 = 1099513729752; error = Null
05:13:27 0 W syscall failed; syscall = Some(LOG_VALUE); number = 1; arg0 = 268437376; arg1 = 1; arg2 = 0; arg3 = 0; arg4 = 1099513729752; error = InvalidArgument
05:13:27 0 W syscall failed; syscall = Some(LOG_VALUE); number = 1; arg0 = 65536; arg1 = 18446744069414584320; arg2 = 0; arg3 = 0; arg4 = 1099513729752; error = InvalidArgument
05:13:27 0 W syscall failed; syscall = Some(LOG_VALUE); number = 1; arg0 = 18446744073709486080; arg1 = 1048576; arg2 = 0; arg3 = 0; arg4 = 1099513729752; error = Overflow
05:13:27 0 I syscall = "exit"; pid = 0:0; code = 0; reason = Some(OK)
05:13:27 0 D leaving the user mode; pid = 0:0
3_process_4_syscall::syscall_log_value--------------- [passed]
05:13:27 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/syscall.rs |  127 +++++++++++++++++++++++++++++++++++++++---
 user/lib/src/syscall.rs       |   54 +++++++++++++++++
 2 files changed, 173 insertions(+), 8 deletions(-)
```
