## Обработка исключений в режиме пользователя


### Пользовательская часть системного вызова `set_trap_handler`

Посмотрите на функцию

```rust
fn set_trap_handler(
    dst_pid: Pid,
    trap_handler: fn(&TrapInfo),
    trap_stack: Block<Page>,
) -> Result<()>
```

в файле [`user/lib/src/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/lib/src/syscall.rs).

Она делает не совсем то, чего можно было бы ожидать.
А именно, она не передаёт адрес функции `trap_stack` в системный вызов.
Вместо этого она устанавливает в качестве обработчика прерываний функцию `trap_trampoline()`,
а `trap_handler` просто сохраняет в статическую переменную
`static mut TRAP_HANDLER: fn(&TrapInfo)`.

Это позволяет функции `trap_handler` не заниматься той технической машинерией по сохранению и восстановлению контекста, которую мы сейчас реализуем в `trap_trampoline()`.


### Трамплин обработчика прерываний

Реализуйте функцию

```rust
extern "C" fn trap_trampoline() -> !
```

в файле [`user/lib/src/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/lib/src/syscall.rs).

Она будет получать управление, если в коде пользователя возникло прерывание, например Page Fault.
Прерывание может возникнуть в произвольный момент, поэтому нужно сохранить содержимое всех регистров в стеке.
Стек, на котором эта функция будет запущена, специальный, он может отличаться от стека в момент возникновения исключения.
Причём на момент вызова `trap_trampoline()` в стеке лежит структура `TrapInfo` с информацией о возникшем прерывании.

Это похоже на метод
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to)
[который вы реализовали](../../lab/book/3-user-3-user-mode.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-7--%D0%BF%D0%B5%D1%80%D0%B5%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%BE%D1%80%D0%B0-%D0%B2-%D1%80%D0%B5%D0%B6%D0%B8%D0%BC-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8F-%D0%B8-%D0%B2%D0%BE%D0%B7%D0%B2%D1%80%D0%B0%D1%82-%D0%B8%D0%B7-%D0%BD%D0%B5%D0%B3%D0%BE)
в одной из прошлых лабораторок.

**Важно** также сохранить в стек текущее состояние регистра флагов `RFLAGS`.

После сохранения регистров нужно вызвать функцию
```rust
extern "C" fn trap_handler_invoker(
    info: &mut TrapInfo, // rdi
)
```
Передав ей в регистре `RDI` адрес `TrapInfo`, на который указывал регистр `RSP` в момент вызова `trap_trampoline()`.
Мы только что положили в стек регистры, и `RSP` сдвинулся.
Поэтому для получения адреса `TrapInfo` нужно прибавить к нему объём сохранённых регистров.
После вызова `trap_handler_invoker()` нужно восстановить регистры из стека.

Далее нужно переключить стек --- `RSP` --- на состояние в котором он был в момент возникновения исключения.
И вернуть `RIP` в точку, в которой исключение возникло.
Посмотрите, что делает `trap_handler_invoker()`:

- Вызывает функцию, сохранённую в переменной `static mut TRAP_HANDLER: fn(&TrapInfo)`.
- Выполняет `TrapInfo::prepare_for_ret()`.

А `TrapInfo::prepare_for_ret()` кладёт в стек времени возникновения исключения регистр `RIP` --- адрес кода, который исполнялся в этот момент.
Значит, если мы установим `RSP` на место в памяти, где сохранён `RIP` и сделаем `ret`, то инструкция `ret` одновременно

- Вернёт управление в то место, которое исполнялось в момент исключения.
- Вернёт стек --- регистр `RSP` --- в состояние на момент возникновения исключения.

Что нам и нужно. Таким образом, `trap_trampoline()` должна переключить `RSP` на этот адрес и выполнить `ret`.
Лежит нужный нам `RSP` в поле `TrapInfo::context` структуры

```rust
#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct TrapInfo {
    number: usize,
    info: Info,
    context: MiniContext,

    /// `TrapInfo` can be pushed into the same stack the `context` is pointing to.
    /// Eg. if the trap is recursive - the trap has happened inside a trap handler.
    /// In this case [`lib::syscall::trap_trampoline`] and [`lib::syscall::trap_handler_invoker`]
    /// will push on the `context` stack a return address effectively overwriting the `TrapInfo`.
    /// This field exists only to protect meaningfull fields of the `TrapInfo` from beeing overwritten.
    return_address_placeholder: [u8; Self::PLACEHOLDER_SIZE],
}
```

И к нему можно обратиться по смещению

```rust
pub const RSP_OFFSET_IN_TRAP_INFO: usize = offset_of!(TrapInfo, context) + RSP_OFFSET_IN_MINI_CONTEXT;
```

от начала структуры `TrapInfo`, которое сейчас находится в `RSP`.


### Ядерная часть системного вызова `set_trap_handler`

Реализуйте системный вызов

```rust
fn set_trap_handler(
    process: MutexGuard<Process>,
    dst_pid: usize,
    rip: usize,
    stack_address: usize,
    stack_size: usize,
) -> Result<SyscallResult>
```

в файле [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs).

Он устанавливает для целевого процесса, заданного идентификатором `dst_pid` пользовательский обработчик прерывания с виртуальным адресом `rip` и стеком, который задаётся блоком виртуальных адресов начиная с `stack_address` и размера `stack_size`.
Стек может быть не выровнен по границе страниц.
Проверять его на права доступа пока бессмысленно, так как пользовательский код может изменить доступы к этим адресам позже.
Проверять права доступа к памяти надо непосредственно перед доступом.
В случае обработчика исключений доступ будет позднее, в функции `user_trap_handler()`, и проверку придётся отложить до соответствующего момента.

Вам пригодятся методы `Process::set_trap_context()` и `TrapContext::new()`.
`TrapContext` --- это просто пара из контекста пользовательского обработчика `context` и его стека `stack`,
который нужен для определения рекурсивности прерывания в функции `user_trap_handler()`:

```rust
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct TrapContext {
    context: MiniContext,
    stack: Block<Virt>,
}
```


### Передача прерывания из режима ядра в режим пользователя

Реализуйте функцию

```rust
fn user_trap_handler(
    process: &mut MutexGuard<Process>,
    original_context: &mut InterruptContext,
    number: usize,
    info: Info,
) -> Result<()>
```

в файле [`kernel/src/interrupts.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/interrupts.rs).

Её задача --- вернуть управление в код пользователя (запускается она в режиме ядра) в контекст
пользовательского обработчика прерывания.
Этот контекст возвращает метод `Process::trap_context()`.

Но учтите, что возможна ситуация, когда пользовательский обработчик прерывания сам вызовет исключение.
Например, в `cow_fork` так и будет, обработчик Page Fault сам будет иногда вызывать Page Fault, который сам же и починит, будучи вызванным фактически рекурсивно.
Поэтому нельзя безусловно использовать значение регистра `RSP` из `Process::trap_context()`.
Так как тогда рекурсивный вызов обработчика прерывания перезапишет стек первоначального вызова.
Нужно проверить, что стек `original_context` указывает внутрь стека, который задаётся `Process::trap_context()`.
Если это так, это означает что пользовательский код как раз исполняет обработчик прерывания, так как использует его стек.
Тогда переключать стек не нужно, значение `RSP` должно остаться как было в `original_context`.
Если же пользовательский `RSP` указывает не в стек обработчика прерываний, то его нужно туда переключить.
Ведь, возможно, Page Fault был вызван попыткой обратиться в обычный стек и если запустить
пользовательский обработчик прерываний, не переключив стек, Page Fault повторится и программа зациклится в рекурсивных вызовах обработчика прерываний.
Соберите `MiniContext` из `Process::trap_context()` и `original_context` описанным образом.

С помощью метода `MiniContext::push()` выделите на стеке пользователя блок памяти под структуру `TrapInfo`.
Помните, --- доверять пользовательскому стеку нельзя!
Он может быт некорректным изначально или просто уже исчерпаться.
Поэтому обязательно проверьте, что выделенный блок памяти доступен пользователю для записи методом
[`AddressSpace::check_permission_mut<T>()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission_mut).
Только после этого в него можно записать структуру `TrapInfo` с описанием возникшего прерывания и его контекста из `original_context`.
Метод
[`AddressSpace::check_permission_mut<T>()`](../../doc/kernel/memory/address_space/struct.AddressSpace.html#method.check_permission_mut)
возвращает срез, а у нас на самом деле один элемент, --- просто используйте `[0]`.

Если в процессе возникла какая-либо ошибка, верните её в вызывающую функцию.
Иначе, подмените в `original_context` контекст, в котором возникло прерывание,
на контекст пользовательского обработчика, чтобы в итоге попасть в него.
И верните `Ok` в вызывающую функцию.


### Вызов `user_trap_handler()` из `generic_trap()`

Поправьте функцию

```rust
fn generic_trap(
    context: &mut InterruptContext,
    number: usize,
    info: Info,
    fatal: Fatal,
)
```

в файле [`kernel/src/interrupts.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/interrupts.rs), чтобы в случае если

- прерывание произошло в режиме пользователя и
- установлен пользовательский обработчик исключений (`Process::trap_context().is_valid()` возвращает `true`),

вызвать функцию `user_trap_handler()`.
Если она вернёт `Ok`, выйдите из `generic_trap()`, иначе --- продолжите исполнение обработчика
`generic_trap()`, как если бы пользовательский обработчик не был установлен.
Естественно, ошибочную ситуацию стоит залогировать.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/interrupts.rs      |   40 ++++++++++++++++++++-
 kernel/src/process/syscall.rs |    8 +++-
 user/lib/src/syscall.rs       |   79 +++++++++++++++++++++++++++++++++++++++++-
 3 files changed, 123 insertions(+), 4 deletions(-)
```
