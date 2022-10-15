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


### Задача 8 --- инициализация системных вызовов

Реализуйте [функцию](../../doc/kernel/process/syscall/fn.init.html)

```rust
fn kernel::process::syscall::init()
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Она подготавливает процессор к выполнению инструкций
[`syscall` и `sysret`](https://wiki.osdev.org/SYSENTER#AMD:_SYSCALL.2FSYSRET):

- Включает бит [`x86_64::registers::model_specific::EferFlags::SYSTEM_CALL_EXTENSIONS`](../../doc/x86_64/registers/model_specific/struct.EferFlags.html#associatedconstant.SYSTEM_CALL_EXTENSIONS) в регистре [`x86_64::registers::model_specific::Efer`](../../doc/x86_64/registers/model_specific/struct.Efer.html), оставляя остальные биты в исходном состоянии.
- Записывает в регистр [`x86_64::registers::model_specific::Star`](../../doc/x86_64/registers/model_specific/struct.Star.html) методом [`Star::write()`](../../doc/x86_64/registers/model_specific/struct.Star.html#method.write) селекторы кода и данных для режимов пользователя и ядра --- `Gdt::user_code()`, `Gdt::user_data()`, `Gdt::kernel_code()`, `Gdt::kernel_data()`.
- Записывает в регистр [`x86_64::registers::model_specific::LStar`](../../doc/x86_64/registers/model_specific/struct.LStar.html) виртуальный адрес функции [`kernel::process::syscall::syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html).
- Записывает в регистр [`x86_64::registers::model_specific::SFMask`](../../doc/x86_64/registers/model_specific/struct.SFMask.html) маску для регистра флагов `RFLAGS`, которая определяет какие флаги в `RFLAGS` будут сброшены при входе в системный вызов. Обычно сбрасывают флаг прерываний. Но предлагается сделать наоборот, --- флаг прерываний не сбрасывать. Nikka не сломается от получения прерывания в момент выполнения системного вызова. А сбросить все остальные флаги, просто для определённости состояния `RFLAGS` в момент системного вызова.


### Задача 9 --- диспетчеризация системных вызовов

Реализуйте на ассемблере [функцию](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)

```rust
extern "C" fn syscall_trampoline() -> !
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Она получает управление при выполнении инструкции `syscall` и должна передать управление в
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

написанную на Rust.
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
Например, имя функции `syscall_trampoline()`, у которой такой аннотации нет, в ассемблере будет
`_ZN6kernel7process7syscall7syscall17hc1ae395af68eb49cE`.
Программа `rustfilt` позволяет восстановить искажённое имя:
```console
$ rustfilt _ZN6kernel7process7syscall7syscall17hc1ae395af68eb49cE
kernel::process::syscall::syscall
```
Чтобы не писать в ассемблере что-нибудь вроде
`call _ZN6kernel7process7syscall7syscall17hc1ae395af68eb49cE`,
просто используем аннотацию
[`#[no_mangle]`](https://doc.rust-lang.org/reference/abi.html#the-no_mangle-attribute),
но тогда мы сами должны гарантировать уникальность имени, как в ассемблере или C.

На момент входа в [`syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)
регистр `RSP` указывает на стек пользователя.
Мы не можем ему доверять, --- код режима пользователя мог его переполнить, неправильно выровнять, поместить на недоступный для пользователя адрес, например внутрь данных ядра.
Поэтому прежде чем пользоваться стеком,
[`syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)
переключается в стек ядра.
Адрес пользовательского стека --- старое значение `RSP` --- она должна передать в функцию
[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html)
в соответствующем [x86-64 C ABI](https://wiki.osdev.org/System_V_ABI#x86-64) регистре.
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
не возвращается, сохранять адрес возврата в стеке инструкцией `call` не обязательно, можно сделать `jmp`.
Но если вы предпочли вариант с `jmp`, то скорректируйте значение регистра `RSP`, так как вызываемая функция при
поиске части аргументов передаваемых через стек пропускает в нём адрес возврата, считая что он был сохранён инструкцией `call`.

Реализуйте функцию [`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html).
Она выполняет диспетчеризацию системных вызовов по аргументу `number`,
передавая в реализующие конкретные системные вызовы функции нужную часть аргументов `arg0`--`arg4`.
Пока что нам хватит системных вызовов

- [`kernel::process::syscall::exit()`](../../doc/kernel/process/syscall/fn.exit.html) с номером [`ku::process::syscall::Syscall::EXIT`](../../doc/ku/process/syscall/struct.Syscall.html#associatedconstant.EXIT) и
- [`kernel::process::syscall::log_value()`](../../doc/kernel/process/syscall/fn.log_value.html) с номером [`ku::process::syscall::Syscall::TRAINING_WHEELS`](../../doc/ku/process/syscall/struct.Syscall.html#associatedconstant.TRAINING_WHEELS).

После выполнения функции, реализующей нужный системный вызов,
[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html)
передаёт управление в функцию
[`kernel::process::syscall::sysret()`](../../doc/kernel/process/syscall/fn.sysret.html).


### Задача 10 --- возврат из системного вызова

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
- Записывает в регистр `R11` состояние регистра флагов, которое должно быть в пространстве пользователя. Как минимум должен быть установлен `RFlags::INTERRUPT_FLAG`.
- Записывает адрес возврата в код пользователя в регистр `RCX`. Функции [`syscall_trampoline()`](../../doc/kernel/process/syscall/fn.syscall_trampoline.html)/[`syscall()`](../../doc/kernel/process/syscall/fn.syscall.html) получили этот адрес в этом же регистре. И должны были его передать вместе с адресом стека пользователя в аргументе `context`.
- Переключает регистр `RSP` на стек пользователя.
- Зануляет все неиспользованные выше регистры общего назначения, чтобы предотвратить утечку информации из режима ядра в режим пользователя.
- Выполняет инструкцию `sysretq`, которая передаёт управление в код пользователя в соответствии с настройками в регистрах `Star`, `R11` и `RCX`. Обратите внимание на суффикс `q` у `sysretq`. Если его не указать, код получится для другого режима работы процессора и до некоторого момента это будет не заметно, так как делать он будет почти то же самое. А потом в неожиданный момент всё сломается и найти такую ошибку будет тяжело.


### Задача 11 --- системный вызов `exit`

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
[`kernel::process::process::Process::leave_user_mode()`](../../doc/kernel/process/process/struct.Process.html#method.leave_user_mode),
который не возвращает управление, как и сама функция
[`kernel::process::syscall::exit()`](../../doc/kernel/process/syscall/fn.exit.html).


### Задача 12 --- системный вызов `log_value`

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
[`ku::error::Error::InvalidArgument`](../../doc/ku/error/enum.Error.html#variant.InvalidArgument)

Далее системный вызов
[`log_value()`](../../doc/kernel/process/syscall/fn.log_value.html)
делает свою основную работу --- логирует получившуюся строку и `value`.
После чего возвращает управление.


### Задача 13 --- пользовательская сторона системного вызова

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
- Запустить инструкцию `syscall`, которая выполнит требуемый системный вызов.
- Восстановить `RBX` и `RBP`.
- Вернуть наружу результаты системного вызова из регистров, в которые их сохранила функция [`kernel::process::syscall::sysret()`](../../doc/kernel/process/syscall/fn.sysret.html).
- Неиспользованные регистры общего назначения она должна пометить как испорченные уже знакомой конструкцией `lateout(...) _,`.


### Проверьте себя

Теперь должен заработать тест `syscall_exit()` в файле [`kernel/src/tests/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/process.rs):

```console
kernel::tests::process::syscall_exit------------------------
15:08:29 0 I page allocator init; free_page_count = 33688649728; block = [2.000 TiB, 127.500 TiB), size 125.500 TiB
15:08:29 0 I duplicate; address_space = "process" @ 0p30B0000
15:08:29 0 I switch to; address_space = "process" @ 0p30B0000
15:08:29 0 D extend mapping; block = [0x10000000, 0x10004e86), size 19.631 KiB; page_block = [0x10000, 0x10005), size 20.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:29 0 D elf loadable program header; file_block = [0x268bf1, 0x26da77), size 19.631 KiB; memory_block = [0x10000000, 0x10004e86), size 19.631 KiB; flags =   R
15:08:29 0 D extend mapping; block = [0x10005000, 0x1002ddd6), size 163.459 KiB; page_block = [0x10005, 0x1002e), size 164.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:29 0 D elf loadable program header; file_block = [0x26da81, 0x2969c7), size 163.818 KiB; memory_block = [0x10004e90, 0x1002ddd6), size 163.818 KiB; flags = X R
15:08:29 0 D elf loadable program header; file_block = [0x2969c9, 0x296ab9), size 240 B; memory_block = [0x1002ddd8, 0x1002dec8), size 240 B; flags =  WR
15:08:29 0 D extend mapping; block = [0x1002e000, 0x10030960), size 10.344 KiB; page_block = [0x1002e, 0x10031), size 12.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:29 0 D elf loadable program header; file_block = [0x296ab9, 0x299529), size 10.609 KiB; memory_block = [0x1002dec8, 0x10030960), size 10.648 KiB; flags =  WR
15:08:29 0 I switch to; address_space = "base" @ 0p1000
15:08:29 0 I loaded ELF file; context = { rip: 0v10004F30, rsp: 0v7F7FFFFFF000 }; file_size = 408.727 KiB; process = { pid: <current>, address_space: "process" @ 0p30B0000, { rip: 0v10004F30, rsp: 0v7F7FFFFFF000 } }
15:08:29 0 I switch to; address_space = "0:1" @ 0p30B0000
15:08:29 0 I allocate; slot = Process { pid: 0:1, address_space: "0:1" @ 0p30B0000, { rip: 0v10004F30, rsp: 0v7F7FFFFFF000 } }; process_count = 1
15:08:29 0 I user process page table entry; entry_point = 0v10004F30; frame = Frame(12448 @ 0p30A0000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
15:08:29 0 D process_frames = 90
15:08:29 0 I switch to; address_space = "0:1" @ 0p30B0000
15:08:29 0 D entering the user mode; pid = 0:1; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10004F30, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags:  } }
15:08:29 0 I free; slot = Process { pid: 0:1, address_space: "0:1" @ 0p30B0000, { rip: 0v10004EEC, rsp: 0v0 } }; process_count = 0
15:08:29 0 I switch to; address_space = "base" @ 0p1000
15:08:29 0 I drop the current address space; address_space = "0:1" @ 0p30B0000; switch_to = "base" @ 0p1000
15:08:29 0 I syscall = "exit"; pid = 0:1; code = 3141592653589793238; reason = None
15:08:29 0 D leaving the user mode; pid = 0:1
kernel::tests::process::syscall_exit--------------- [passed]
```

### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/syscall.rs |  127 +++++++++++++++++++++++++++++++++++++++---
 user/lib/src/syscall.rs       |   54 +++++++++++++++++
 2 files changed, 173 insertions(+), 8 deletions(-)
```
