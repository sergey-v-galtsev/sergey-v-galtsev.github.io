## Вытесняющая многозадачность

### Задача 6 --- реализуйте вытеснение пользовательского процесса по прерыванию

Убедитесь, что в запускаемых процессах прерывания разрешены,
то есть установлен флаг
[`RFlags::INTERRUPT_FLAG`](../../doc/ku/process/registers/struct.RFlags.html#associatedconstant.INTERRUPT_FLAG).
См.
[задачу](../../lab/book/3-process-3-user-mode.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-3--%D0%BF%D0%B5%D1%80%D0%B5%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%BE%D1%80%D0%B0-%D0%B2-%D1%80%D0%B5%D0%B6%D0%B8%D0%BC-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8F-%D0%B8-%D0%B2%D0%BE%D0%B7%D0%B2%D1%80%D0%B0%D1%82-%D0%B8%D0%B7-%D0%BD%D0%B5%D0%B3%D0%BE)
про переключение процессора в режим пользователя и
[состояние регистров пользовательского процесса](../../lab/book/3-process-3-user-mode.html#%D0%A1%D0%BE%D1%81%D1%82%D0%BE%D1%8F%D0%BD%D0%B8%D0%B5-%D1%80%D0%B5%D0%B3%D0%B8%D1%81%D1%82%D1%80%D0%BE%D0%B2-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%D1%81%D0%BA%D0%BE%D0%B3%D0%BE-%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%B0).

Реализуйте [метод](../../doc/kernel/process/process/struct.Process.html#method.preempt)

```rust
fn Process::preempt(context: &mut InterruptContext)
```

в файле [`kernel/src/process/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/process.rs).

Он должен выполнить переключение текущего контекста исполнения `context` на контекст ядра в случае,
если текущий контекст исполняется в режиме пользователя.
Текущий контекст пользователя нужно будет сохранить в структуре
[`Process`](../../doc/kernel/process/process/struct.Process.html).
Но чтобы до неё добраться, нужно блокировать спинлок в таблице процессов.
А брать блокировки из обработчиков прерываний не стоит.
Поэтому для начала в самом прерывании сохраним контекст пользователя в промежуточном месте ---
в CPU--локальной структуре
[`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html).
Захватывать блокировку для доступа ней не нужно, так как она не разделяется между разными CPU
и доступ к ней не будет конкурентным.

Метод
[`Process::preempt`](../../doc/kernel/process/process/struct.Process.html#method.preempt)
вызывается из
[функции обработки прерывания от таймера](../../doc/kernel/interrupts/fn.apic_timer.html)
```rust
extern "x86-interrupt" fn apic_timer(mut context: InterruptContext)
```
находящейся в файле
[`kernel/src/interrupts.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/interrupts.rs).

[`kernel::interrupts::InterruptContext`](../../doc/kernel/interrupts/struct.InterruptContext.html) ---
обёртка для уже знакомого
[`kernel::process::registers::ModeContext`](../../doc/kernel/process/registers/struct.ModeContext.html).
Она помечает запись в него как
[`volatile::Volatile`](../../doc/volatile/struct.Volatile.html),
чтобы компилятор такую операцию записи не выкинул.
Дело в том, что
[`InterruptContext`](../../doc/kernel/interrupts/struct.InterruptContext.html)
формально является изменяемым аргументом
[`apic_timer()`](../../doc/kernel/interrupts/fn.apic_timer.html),
а не изменяемой ссылкой.
Если бы функция была обычной, запись в `context` сделанную последней, никто снаружи функции бы не заметил.
А значит, компилятор мог бы её выкинуть.
В нашем случае
[`apic_timer()`](../../doc/kernel/interrupts/fn.apic_timer.html) ---
[`extern "x86-interrupt"`](https://github.com/rust-lang/rust/issues/40180)
и эту запись увидит инструкция процессора
[`iretq`](https://www.felixcloutier.com/x86/iret:iretd:iretq).
Чтобы предотвратить выкидывание оптимизатором команд записи в `context` и нужен `Volatile`.

В [методе](../../doc/kernel/process/process/struct.Process.html#method.enter_user_mode)

```rust
fn Process::enter_user_mode(mut process: MutexGuard<Process>) -> bool
```

в файле [`kernel/src/process/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/process.rs)
после возвращения из режима пользователя, то есть после возвращения из
[`Registers::switch_to()`](../../doc/kernel/process/registers/struct.Registers.html#method.switch_to),
добавьте проверку, что в
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
есть сохранённый контекст пользователя.
Если его нет, то процесс вернулся из режима пользователя синхронно, например через системный вызов
`exit()` или `sched_yield()`, и дополнительно ничего делать не нужно.
Если же в
[`Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html)
сохранён контекст пользователя, то его нужно перенести в структуру
[`Process`](../../doc/kernel/process/process/struct.Process.html).
Для этого, по идентификатору
[`Pid`](../../doc/ku/process/pid/enum.Pid.html)
текущего процесса получите из
[`Table`](../../doc/kernel/process/struct.Table.html)
его заблокированную спинлоком структуру
[`Process`](../../doc/kernel/process/process/struct.Process.html).
и запишите пользовательский контекст в неё.
Верните из этого метода `true`, если процесс был вытеснен.

Вам пригодятся

- [`InterruptContext::is_user_mode()`](../../doc/kernel/interrupts/struct.InterruptContext.html#method.is_user_mode),
- [`InterruptContext::get()`](../../doc/kernel/interrupts/struct.InterruptContext.html#method.get),
- [`InterruptContext::set()`](../../doc/kernel/interrupts/struct.InterruptContext.html#method.set),
- [`Cpu::kernel_context()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.kernel_context),
- [`Cpu::set_user_context()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.set_user_context),
- [`Cpu::take_user_context()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.take_user_context),
- [`Table::get()`](../../doc/kernel/process/struct.Table.html#method.get),
- [`Registers::set_mode_context()`](../../doc/kernel/process/registers/struct.Registers.html#method.set_mode_context).


### Проверьте себя

После этого заработает тест `preemption()` в файле
[`kernel/src/tests/4-concurrency-6-preemption.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/4-concurrency-6-preemption.rs):

```console
$ (cd kernel; cargo test --test 4-concurrency-6-preemption)
...
4_concurrency_6_preemption::preemption----------------------
20:27:28 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:28 0 I duplicate; address_space = "process" @ 0p7E8A000
20:27:28 0 I switch to; address_space = "process" @ 0p7E8A000
20:27:28 0 D extend mapping; block = [0v10000000, 0v10006DA4), size 27.410 KiB; page_block = [0v10000000, 0v10007000), size 28.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:28 0 D elf loadable program header; file_block = [0v201A9A, 0v20883E), size 27.410 KiB; memory_block = [0v10000000, 0v10006DA4), size 27.410 KiB; flags =   R
20:27:28 0 D extend mapping; block = [0v10007000, 0v1004EAD2), size 286.705 KiB; page_block = [0v10007000, 0v1004F000), size 288.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:28 0 D elf loadable program header; file_block = [0v20884A, 0v25056C), size 287.283 KiB; memory_block = [0v10006DB0, 0v1004EAD2), size 287.283 KiB; flags = X R
20:27:28 0 D elf loadable program header; file_block = [0v250572, 0v250662), size 240 B; memory_block = [0v1004EAD8, 0v1004EBC8), size 240 B; flags =  WR
20:27:28 0 D extend mapping; block = [0v1004F000, 0v100547D0), size 21.953 KiB; page_block = [0v1004F000, 0v10055000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:28 0 D elf loadable program header; file_block = [0v250662, 0v256242), size 22.969 KiB; memory_block = [0v1004EBC8, 0v100547D0), size 23.008 KiB; flags =  WR
20:27:28 0 I switch to; address_space = "base" @ 0p1000
20:27:28 0 I loaded ELF file; context = { rip: 0v10006E60, rsp: 0v7F7FFFFFF000 }; file_size = 5.307 MiB; process = { pid: <current>, address_space: "process" @ 0p7E8A000, { rip: 0v10006E60, rsp: 0v7F7FFFFFF000 } }
20:27:28 0 I allocate; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E8A000, { rip: 0v10006E60, rsp: 0v7F7FFFFFF000 } }; process_count = 1
20:27:28 0 I user process page table entry; entry_point = 0v10006E60; frame = Frame(32366 @ 0p7E6E000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
20:27:28 0 D process_frames = 126
20:27:28 0 I switch to; address_space = "0:0" @ 0p7E8A000
20:27:28 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFED000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10006E60, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
20:27:28 0 D leaving the user mode; pid = 0:0
20:27:28 0 I the process was preempted; pid = 0:0; user_context = { mode: user, cs:rip: 0x0023:0v10006E1A, ss:rsp: 0x001B:0v7F7FFFFFEFB8, rflags: IF AF }
20:27:28 0 D returned from the user space
20:27:28 0 I free; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E8A000, { rip: 0v10006E1A, rsp: 0v7F7FFFFFEFB8 } }; process_count = 0
20:27:28 0 I switch to; address_space = "base" @ 0p1000
20:27:28 0 I drop the current address space; address_space = "0:0" @ 0p7E8A000; switch_to = "base" @ 0p1000
4_concurrency_6_preemption::preemption------------- [passed]
20:27:28 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/process.rs |   24 +++++++++++++++++++++---
 1 file changed, 21 insertions(+), 3 deletions(-)
```
