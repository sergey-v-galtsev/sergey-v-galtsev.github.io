## Обработка исключений в режиме пользователя


### Пользовательская часть системного вызова `set_trap_handler`

Посмотрите на [функцию](../../doc/lib/syscall/fn.set_trap_handler.html)

```rust
fn lib::syscall::set_trap_handler(
    dst_pid: Pid,
    trap_handler: fn(&TrapInfo),
    trap_stack: Block<Page>,
) -> Result<()>
```

в файле
[`user/lib/src/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/lib/src/syscall.rs).

Она делает не совсем то, чего можно было бы ожидать.
А именно, она не передаёт адрес функции `trap_handler` в системный вызов.
Вместо этого она устанавливает в качестве обработчика прерываний функцию
[`lib::syscall::trap_trampoline()`](../../doc/lib/syscall/fn.trap_trampoline.html),
а `trap_handler` просто сохраняет в статическую переменную
[`static TRAP_HANDLER: AtomicPtr<()>`](../../doc/lib/syscall/static.TRAP_HANDLER.html).

Это позволяет функции `trap_handler` не заниматься той технической машинерией
по сохранению и восстановлению контекста, которую мы сейчас реализуем в
[`lib::syscall::trap_trampoline()`](../../doc/lib/syscall/fn.trap_trampoline.html).


### Трамплин обработчика прерываний

Реализуйте [функцию](../../doc/lib/syscall/fn.trap_trampoline.html)

```rust
extern "C" fn trap_trampoline() -> !
```

в файле
[`user/lib/src/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/lib/src/syscall.rs).

Она будет получать управление, если в коде пользователя возникло прерывание, например Page Fault.
Прерывание может возникнуть в неожиданный момент, поэтому нужно сохранить содержимое всех регистров в стеке.
Стек, на котором эта функция будет запущена, --- специальный.
Он может отличаться от стека в момент возникновения исключения.
Причём на момент вызова
[`lib::syscall::trap_trampoline()`](../../doc/lib/syscall/fn.trap_trampoline.html)
в стеке лежит структура
[`ku::process::trap_info::TrapInfo`](../../doc/ku/process/trap_info/struct.TrapInfo.html)
с информацией о возникшем прерывании.
Эту инофрмацию записывает в стек процесса ядро.

Это похоже на метод
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
[который вы реализовали](../../lab/book/3-process-3-user-mode.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-7--%D0%BF%D0%B5%D1%80%D0%B5%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%BE%D1%80%D0%B0-%D0%B2-%D1%80%D0%B5%D0%B6%D0%B8%D0%BC-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8F-%D0%B8-%D0%B2%D0%BE%D0%B7%D0%B2%D1%80%D0%B0%D1%82-%D0%B8%D0%B7-%D0%BD%D0%B5%D0%B3%D0%BE)
в одной из прошлых лабораторок.

**Важно** также сохранить в стек текущее состояние регистра флагов `RFLAGS`.

После сохранения регистров нужно вызвать [функцию](../../doc/lib/syscall/fn.trap_handler_invoker.html)
```rust
extern "C" fn lib::syscall::trap_handler_invoker(
    info: &mut TrapInfo, // rdi
)
```
Передав ей в регистре `RDI` адрес
[`ku::process::trap_info::TrapInfo`](../../doc/ku/process/trap_info/struct.TrapInfo.html),
на который указывал регистр `RSP` в момент вызова
[`lib::syscall::trap_trampoline()`](../../doc/lib/syscall/fn.trap_trampoline.html).
Мы только что положили в стек регистры, и `RSP` сдвинулся.
Поэтому для получения адреса
[`ku::process::trap_info::TrapInfo`](../../doc/ku/process/trap_info/struct.TrapInfo.html),
нужно прибавить к `RSP` объём сохранённых регистров.
После вызова
[`lib::syscall::trap_handler_invoker()`](../../doc/lib/syscall/fn.trap_handler_invoker.html)
нужно восстановить регистры из стека.

Далее нужно переключить стек --- `RSP` --- на состояние, в котором он был в момент возникновения прерывания.
И вернуть `RIP` в точку, в которой прерывание возникло.
Посмотрите, что делает
[`lib::syscall::trap_handler_invoker()`](../../doc/lib/syscall/fn.trap_handler_invoker.html):

- Вызывает функцию, сохранённую в переменной [`static TRAP_HANDLER: AtomicPtr<()>`](../../doc/lib/syscall/static.TRAP_HANDLER.html).
- Выполняет [`TrapInfo::prepare_for_ret()`](../../doc/ku/process/trap_info/struct.TrapInfo.html#method.prepare_for_ret).

А
[`TrapInfo::prepare_for_ret()`](../../doc/ku/process/trap_info/struct.TrapInfo.html#method.prepare_for_ret)
кладёт в стек времени возникновения прерывания регистр `RIP` --- адрес кода, который исполнялся в этот момент.
Значит, если мы установим `RSP` на место в памяти, где сохранён `RIP` и сделаем `ret`, то инструкция `ret` одновременно

- Вернёт управление в то место, которое исполнялось в момент прерывания.
- Вернёт стек --- регистр `RSP` --- в состояние на момент возникновения прерывания.

Что нам и нужно. Таким образом,
[`lib::syscall::trap_trampoline()`](../../doc/lib/syscall/fn.trap_trampoline.html)
должна переключить `RSP` на этот адрес и выполнить инструкцию
[`ret`](https://www.felixcloutier.com/x86/ret).
Лежит нужный нам `RSP` в поле
`TrapInfo::context`(../../doc/ku/process/trap_info/struct.TrapInfo.html#structfield.context)
структуры

```rust
#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct TrapInfo {
    number: usize,
    info: Info,
    context: MiniContext,

    /// `TrapInfo` can be pushed onto the same stack the `context` is pointing to.
    /// Eg. if the trap is recursive - the trap has happened inside a trap handler.
    /// In this case [`lib::syscall::trap_trampoline`] and [`lib::syscall::trap_handler_invoker`]
    /// will push a return address onto the `context` stack.
    /// That will effectively overwrite the `TrapInfo`.
    /// This field exists only to protect meaningfull fields of the `TrapInfo` from beeing overwritten.
    return_address_placeholder: [u8; Self::PLACEHOLDER_SIZE],
}
```

И к нему можно обратиться по
[смещению](../../doc/ku/process/trap_info/constant.RSP_OFFSET_IN_TRAP_INFO.html)

```rust
pub const RSP_OFFSET_IN_TRAP_INFO: usize = offset_of!(TrapInfo, context) + RSP_OFFSET_IN_MINI_CONTEXT;
```

от начала структуры
[`ku::process::trap_info::TrapInfo`](../../doc/ku/process/trap_info/struct.TrapInfo.html),
которое сейчас находится в `RSP`.


### Ядерная часть системного вызова `set_trap_handler`

Реализуйте
[системный вызов](../../doc/kernel/process/syscall/fn.set_trap_handler.html)

```rust
fn kernel::process::syscall::set_trap_handler(
    process: MutexGuard<Process>,
    dst_pid: usize,
    rip: usize,
    stack_address: usize,
    stack_size: usize,
) -> Result<SyscallResult>
```

в файле
[`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Он устанавливает для целевого процесса, заданного идентификатором `dst_pid`,
пользовательский обработчик прерывания с виртуальным адресом `rip`.
И стеком, который задаётся блоком виртуальных адресов начиная с `stack_address` и размера `stack_size`.
Стек может быть не выровнен по границе страниц.
Проверять его на права доступа пока бессмысленно, так как пользовательский код может изменить доступы к этим адресам позже.
Проверять права доступа к памяти надо непосредственно перед доступом.
В случае обработчика прерываний доступ будет позднее, в методе
[`Process::trap()`](../../doc/kernel/process/process/struct.Process.html#method.trap),
и проверку придётся отложить до соответствующего момента.

Вам пригодятся методы
[`Process::set_trap_context()`](../../doc/kernel/process/process/struct.Process.html#method.set_trap_context) и
[`TrapContext::new()`](../../doc/kernel/process/process/struct.TrapContext.html#method.new).
[`kernel::process::process::TrapContext`](../../doc/kernel/process/process/struct.TrapContext.html) ---
это просто пара из контекста пользовательского обработчика
[`TrapContext::mini_context`](../../doc/kernel/process/process/struct.TrapContext.html#structfield.mini_context)
и его стека
[`TrapContext::stack`](../../doc/kernel/process/process/struct.TrapContext.html#structfield.stack),
который нужен для определения рекурсивности прерывания в функции
[`Process::trap()`](../../doc/kernel/process/process/struct.Process.html#method.trap):

```rust
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct TrapContext {
    mini_context: MiniContext,
    stack: Block<Virt>,
}
```


### Передача прерывания из режима ядра в режим пользователя

Реализуйте
[метод](../../doc/kernel/process/process/struct.Process.html#method.trap):

```rust
fn Process::trap(
    &mut self,
    context: &mut InterruptContext,
    number: usize,
    info: Info,
) -> bool
```

в файле
[`kernel/src/process/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/process.rs).
Она вызывается из функции
[`kernel::interrupts::generic_trap()`](../../doc/kernel/interrupts/fn.generic_trap.html) в файле
[`kernel/src/interrupts.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/interrupts.rs),
если прерывание произошло в режиме пользователя.

Её задача --- вернуть управление в код пользователя (запускается она в режиме ядра) в контекст
пользовательского обработчика прерывания
[`Process::trap_context`](../../doc/kernel/process/process/struct.Process.html#structfield.trap_context).
Делает это она аналогично
[реализованному вами ранее](../../lab/book/4-concurrency-3-preemption.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-6--%D1%80%D0%B5%D0%B0%D0%BB%D0%B8%D0%B7%D1%83%D0%B9%D1%82%D0%B5-%D0%B2%D1%8B%D1%82%D0%B5%D1%81%D0%BD%D0%B5%D0%BD%D0%B8%D0%B5-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%D1%81%D0%BA%D0%BE%D0%B3%D0%BE-%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%B0-%D0%BF%D0%BE-%D0%BF%D1%80%D0%B5%D1%80%D1%8B%D0%B2%D0%B0%D0%BD%D0%B8%D1%8E)
методу
[`Process::preempt()`](../../doc/kernel/process/process/struct.Process.html#method.preempt),
подменяя контекст прерывания `context` из
обработчика которого вызывается.

Учтите, что возможна ситуация, когда пользовательский обработчик прерывания сам вызовет исключение.
Например, в
[`cow_fork`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/cow_fork/src/main.rs)
так и будет.
Обработчик Page Fault сам будет иногда вызывать Page Fault.
Который сам же и починит, будучи вызванным фактически рекурсивно.
Поэтому нельзя безусловно использовать значение регистра `RSP` из
[`Process::trap_context`](../../doc/kernel/process/process/struct.Process.html#structfield.trap_context).
Так как тогда рекурсивный вызов обработчика прерывания перезапишет стек первоначального вызова.
Нужно проверить, что стек `context` указывает внутрь стека, который задаётся
[`Process::trap_context`](../../doc/kernel/process/process/struct.Process.html#structfield.trap_context).
Если это так, это означает что пользовательский код как раз исполняет обработчик прерывания, так как использует его стек.
Тогда переключать стек не нужно, значение `RSP` должно остаться как было в `context`.
Если же пользовательский `RSP` указывает не в стек обработчика прерываний, то его нужно туда переключить.
Ведь, возможно, Page Fault был вызван попыткой обратиться в обычный стек и если запустить
пользовательский обработчик прерываний, не переключив стек, Page Fault повторится и программа зациклится в рекурсивных вызовах обработчика прерываний.
Соберите
[`ku::process::mini_context::MiniContext`](../../doc/ku/process/mini_context/struct.MiniContext.html)
из
[`Process::trap_context`](../../doc/kernel/process/process/struct.Process.html#structfield.trap_context).
и `context` описанным образом.

С помощью метода
[`MiniContext::push()`](../../doc/ku/process/mini_context/struct.MiniContext.html#method.push)
выделите на стеке пользователя блок памяти под структуру
[`ku::process::trap_info::TrapInfo`](../../doc/ku/process/trap_info/struct.TrapInfo.html).
Помните, --- доверять пользовательскому стеку нельзя!
Он может быт некорректным изначально или просто уже исчерпаться.
Поэтому обязательно проверьте, что выделенный блок памяти доступен пользователю для записи методом
[`AddressSpace::check_permission_mut<T>()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission_mut).
Только после этого в него можно записать структуру
[`ku::process::trap_info::TrapInfo`](../../doc/ku/process/trap_info/struct.TrapInfo.html)
с описанием возникшего прерывания и его контекста из `context`.
Метод
[`AddressSpace::check_permission_mut<T>()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission_mut)
возвращает срез, а у нас на самом деле один элемент, --- просто используйте `[0]`.

Если пользовательский обработчик прерываний не установлен,
или же в процессе записи информации в его стек возникла какая-либо ошибка, верните `false`.
Иначе, подмените в `context` контекст, в котором возникло прерывание,
на контекст пользовательского обработчика, чтобы в итоге попасть в него.
И верните `true` в вызывающую функцию.


### Проверьте себя

Теперь должен заработать тест `trap_handler()` в файле
[`kernel/tests/5-um-4-trap-handler.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/5-um-4-trap-handler.rs):

```console
$ (cd kernel; cargo test --test 5-um-4-trap-handler)
...
5_um_4_trap_handler::trap_handler---------------------------
20:23:47 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:23:47 0 I duplicate; address_space = "process" @ 0p7E0A000
20:23:47 0 I switch to; address_space = "process" @ 0p7E0A000
20:23:47 0 D extend mapping; block = [0v10000000, 0v10007AAC), size 30.668 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:23:47 0 D elf loadable program header; file_block = [0v201D83, 0v20982F), size 30.668 KiB; memory_block = [0v10000000, 0v10007AAC), size 30.668 KiB; flags =   R
20:23:47 0 D extend mapping; block = [0v10008000, 0v1005A3BD), size 328.935 KiB; page_block = [0v10008000, 0v1005B000), size 332.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:23:47 0 D elf loadable program header; file_block = [0v209833, 0v25C140), size 330.263 KiB; memory_block = [0v10007AB0, 0v1005A3BD), size 330.263 KiB; flags = X R
20:23:47 0 D elf loadable program header; file_block = [0v25C143, 0v25C253), size 272 B; memory_block = [0v1005A3C0, 0v1005A4D0), size 272 B; flags =  WR
20:23:47 0 D extend mapping; block = [0v1005B000, 0v10060E10), size 23.516 KiB; page_block = [0v1005B000, 0v10061000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:23:47 0 D elf loadable program header; file_block = [0v25C253, 0v262B6B), size 26.273 KiB; memory_block = [0v1005A4D0, 0v10060E10), size 26.312 KiB; flags =  WR
20:23:47 0 I switch to; address_space = "base" @ 0p1000
20:23:47 0 I loaded ELF file; context = { rip: 0v1000B250, rsp: 0v7F7FFFFFF000 }; file_size = 5.581 MiB; process = { pid: <current>, address_space: "process" @ 0p7E0A000, { rip: 0v1000B250, rsp: 0v7F7FFFFFF000 } }
20:23:47 0 I allocate; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E0A000, { rip: 0v1000B250, rsp: 0v7F7FFFFFF000 } }; process_count = 1
20:23:47 0 I user process page table entry; entry_point = 0v1000B250; frame = Frame(32233 @ 0p7DE9000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
20:23:47 0 D process_frames = 155
20:23:47 0 I dequeue; pid = Some(0:0)
20:23:47 0 I switch to; address_space = "0:0" @ 0p7E0A000
20:23:47 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFDB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v1000B250, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
20:23:47 0 I trap_stack = [0v7F7FFFFD7000, 0v7F7FFFFDB000), size 16.000 KiB; pid = 0:0
20:23:47 0 I stored from main(); value = 333333333; pid = 0:0
20:23:47 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10023BD6, ss:rsp: 0x001B:0v7F7FFFFFDBE8, rflags: IF AF PF }; info = { address: 0v7F7FFFFD6000, code: 0b100 = non-present page | read | user }
20:23:47 0 D leaving the user mode; pid = 0:0
20:23:47 0 I the process was preempted; pid = 0:0; user_context = { mode: user, cs:rip: 0x0023:0v1000D320, ss:rsp: 0x001B:0v7F7FFFFDAFC8, rflags: IF AF PF }
20:23:47 0 I returned
20:23:47 0 I dequeue; pid = Some(0:0)
20:23:47 0 I switch to; address_space = "0:0" @ 0p7E0A000
20:23:47 0 D entering the user mode; pid = 0:0; registers = { rax: 0x1005B8E8, rdi: 0x7F7FFFFD6000, rsi: 0x7F7FFFFFE7C8, { mode: user, cs:rip: 0x0023:0v1000D320, ss:rsp: 0x001B:0v7F7FFFFDAFC8, rflags: AF PF } }
20:23:47 0 I trap handler called for a page fault on an address; value = 140187732369408; hex_value = 0x7F7FFFFD6000; pid = 0:0
20:23:47 0 I stored from simple_trap_handler(); value = 777777777; pid = 0:0
20:23:47 0 I stored from main(); value = 555555555; pid = 0:0
20:23:47 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10023BD6, ss:rsp: 0x001B:0v7F7FFFFFDBE8, rflags: IF AF PF }; info = { address: 0v7F7FFFFD6000, code: 0b100 = non-present page | read | user }
20:23:47 0 I recursive page fault at level; value = 0; hex_value = 0x0; pid = 0:0
20:23:47 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A393, ss:rsp: 0x001B:0v7F7FFFFDAD88, rflags: IF }; info = { address: 0v7F7FFFFD6008, code: 0b100 = non-present page | read | user }
20:23:47 0 D leaving the user mode; pid = 0:0
20:23:47 0 I the process was preempted; pid = 0:0; user_context = { mode: user, cs:rip: 0x0023:0v1000D320, ss:rsp: 0x001B:0v7F7FFFFDAD50, rflags: IF }
20:23:47 0 I returned
20:23:47 0 I dequeue; pid = Some(0:0)
20:23:47 0 I switch to; address_space = "0:0" @ 0p7E0A000
20:23:47 0 D entering the user mode; pid = 0:0; registers = { rax: 0x7F7FFFFD6000, rdi: 0x7F7FFFFDAEB8, rsi: 0x1005C978, { mode: user, cs:rip: 0x0023:0v1000D320, ss:rsp: 0x001B:0v7F7FFFFDAD50, rflags:  } }
20:23:48.001 0 I recursive page fault at level; value = 1; hex_value = 0x1; pid = 0:0
20:23:48.009 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A393, ss:rsp: 0x001B:0v7F7FFFFDAB10, rflags: IF }; info = { address: 0v7F7FFFFD6010, code: 0b100 = non-present page | read | user }
20:23:48.025 0 I recursive page fault at level; value = 2; hex_value = 0x2; pid = 0:0
20:23:48.033 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A393, ss:rsp: 0x001B:0v7F7FFFFDA898, rflags: IF }; info = { address: 0v7F7FFFFD6018, code: 0b100 = non-present page | read | user }
20:23:48.047 0 I recursive page fault at level; value = 3; hex_value = 0x3; pid = 0:0
20:23:48.055 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A393, ss:rsp: 0x001B:0v7F7FFFFDA620, rflags: IF }; info = { address: 0v7F7FFFFD6020, code: 0b100 = non-present page | read | user }
20:23:48.069 0 I recursive page fault at level; value = 4; hex_value = 0x4; pid = 0:0
20:23:48.077 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A393, ss:rsp: 0x001B:0v7F7FFFFDA3A8, rflags: IF }; info = { address: 0v7F7FFFFD6028, code: 0b100 = non-present page | read | user }
20:23:48.091 0 I recursive page fault at level; value = 5; hex_value = 0x5; pid = 0:0
20:23:48.099 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A393, ss:rsp: 0x001B:0v7F7FFFFDA130, rflags: IF }; info = { address: 0v7F7FFFFD6030, code: 0b100 = non-present page | read | user }
20:23:48.113 0 I recursive page fault at level; value = 6; hex_value = 0x6; pid = 0:0
20:23:48.121 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A393, ss:rsp: 0x001B:0v7F7FFFFD9EB8, rflags: IF }; info = { address: 0v7F7FFFFD6038, code: 0b100 = non-present page | read | user }
20:23:48.135 0 I recursive page fault at level; value = 7; hex_value = 0x7; pid = 0:0
20:23:48.143 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A393, ss:rsp: 0x001B:0v7F7FFFFD9C40, rflags: IF }; info = { address: 0v7F7FFFFD6040, code: 0b100 = non-present page | read | user }
20:23:48.157 0 D leaving the user mode; pid = 0:0
20:23:48.161 0 I the process was preempted; pid = 0:0; user_context = { mode: user, cs:rip: 0x0023:0v1000D320, ss:rsp: 0x001B:0v7F7FFFFD9C08, rflags: IF }
20:23:48.171 0 I returned
20:23:48.175 0 I dequeue; pid = Some(0:0)
20:23:48.179 0 I switch to; address_space = "0:0" @ 0p7E0A000
20:23:48.183 0 D entering the user mode; pid = 0:0; registers = { rax: 0x7F7FFFFD6038, rdi: 0x7F7FFFFD9D70, rsi: 0x1005C978, { mode: user, cs:rip: 0x0023:0v1000D320, ss:rsp: 0x001B:0v7F7FFFFD9C08, rflags:  } }
20:23:48.197 0 I recursive page fault at level; value = 8; hex_value = 0x8; pid = 0:0
20:23:48.205 0 I setting the simple trap handler from the recursive trap handler, new trap_stack rsp; value = 140187732369408; hex_value = 0x7F7FFFFD6000; pid = 0:0
20:23:48.217 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v1000A393, ss:rsp: 0x001B:0v7F7FFFFD9C40, rflags: IF }; info = { address: 0v7F7FFFFD6040, code: 0b100 = non-present page | read | user }
20:23:48.231 0 I trap handler called for a page fault on an address; value = 140187732369472; hex_value = 0x7F7FFFFD6040; pid = 0:0
20:23:47.925 0 I stored from recursive_trap_handler(); value = 777777785; pid = 0:0
20:23:48.251 0 I free; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E0A000, { rip: 0v1000D320, rsp: 0v7F7FFFFD9C08 } }; process_count = 0
20:23:48.259 0 I switch to; address_space = "base" @ 0p1000
20:23:48.265 0 I drop the current address space; address_space = "0:0" @ 0p7E0A000; switch_to = "base" @ 0p1000
20:23:48.323 0 I syscall = "exit"; pid = 0:0; code = 0; reason = Some(OK)
20:23:48.327 0 D leaving the user mode; pid = 0:0
20:23:48.333 0 I dequeue; pid = None
5_um_4_trap_handler::trap_handler------------------ [passed]
20:23:48.341 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/process.rs |   50 ++++++++++++++++++++++++++++++++++++++++++++++++--
 kernel/src/process/syscall.rs |   12 ++++++++++--
 user/lib/src/syscall.rs       |   48 ++++++++++++++++++++++++++++++++++++++++++++++--
 3 files changed, 104 insertions(+), 6 deletions(-)
```
