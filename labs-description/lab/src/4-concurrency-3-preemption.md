## Вытесняющая многозадачность

### Задача 6 --- реализуйте вытеснение пользовательского процесса по прерыванию

Убедитесь, что в запускаемых процессах прерывания разрешены,
то есть установлен флаг
[`RFlags::INTERRUPT_FLAG`](../../doc/ku/process/registers/struct.RFlags.html#associatedconstant.INTERRUPT_FLAG).
См.
[задачу](../../lab/book/3-process-3-user-mode.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-2--%D0%BF%D0%B5%D1%80%D0%B5%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%BE%D1%80%D0%B0-%D0%B2-%D1%80%D0%B5%D0%B6%D0%B8%D0%BC-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8F-%D0%B8-%D0%B2%D0%BE%D0%B7%D0%B2%D1%80%D0%B0%D1%82-%D0%B8%D0%B7-%D0%BD%D0%B5%D0%B3%D0%BE)
про переключение процессора в режим пользователя и
[состояние регистров пользовательского процесса](../../lab/book/3-process-3-user-mode.html#%D0%A1%D0%BE%D1%81%D1%82%D0%BE%D1%8F%D0%BD%D0%B8%D0%B5-%D1%80%D0%B5%D0%B3%D0%B8%D1%81%D1%82%D1%80%D0%BE%D0%B2-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%D1%81%D0%BA%D0%BE%D0%B3%D0%BE-%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%B0).

В функции обработки прерывания от таймера
```rust
extern "x86-interrupt" fn apic_timer(mut context: InterruptContext)
```

в файле [`kernel/src/interrupts.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/interrupts.rs)
добавьте переключение текущего контекста исполнения `context` на контекст ядра в случае, если текущий контекст исполняется в режиме пользователя.
Текущий контекст пользователя нужно будет сохранить в структуре `Process`.
Но чтобы до неё добраться, нужно блокировать мьютекс в таблице процессов.
А блокировать мьютексы из обработчиков прерываний не стоит.
Поэтому для начала в самом прерывании сохраним контекст пользователя в промежуточном месте ---
в CPU--локальной структуре `Cpu`.
Захватывать блокировку для доступа ней не нужно, так как она не разделяется между разными CPU и доступ к ней не будет конкурентным.

В методе
```rust
fn Process::enter_user_mode(mut process: MutexGuard<Process>) -> bool
```

в файле [`kernel/src/process/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/process.rs)
после возвращения из режима пользователя, то есть после возвращения из `Registers::switch_to()`,
добавьте проверку, что в `Cpu` есть сохранённый контекст пользователя.
Если его нет, то процесс вернулся из режима пользователя синхронно, например через системный вызов
`exit()` или `sched_yield()`, и дополнительно ничего делать не нужно.
Если же в `Cpu` сохранён контекст пользователя, то его нужно перенести в структуру `Process`.
Для этого, по идентификатору `Pid` текущего процесса получите из `Table` его заблокированную мьютексом структуру
`Process` и запишите пользовательский контекст в неё.
Верните из этого метода `true`, если процесс был вытеснен.

Вам пригодятся

- `InterruptContext::is_user_mode()`
- `InterruptContext::get()`
- `InterruptContext::set()`
- `Cpu::kernel_context()`
- `Cpu::set_user_context()`
- `Cpu::take_user_context()`
- `Table::get()`
- `Registers::set_mode_context()`

После этого заработает тест `preemption()` в файле [`kernel/src/tests/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/process.rs):

```console
kernel::tests::process::preemption--------------------------
14:11:24.149 0 I page allocator init; free_page_count = 33688649728; block = [2.000 TiB, 127.500 TiB), size 125.500 TiB
14:11:24.160 0 I duplicate; address_space = "process" @ 0p30B0000
14:11:24.164 0 I switch to; address_space = "process" @ 0p30B0000
14:11:24.176 0 D extend mapping; block = [0x10000000, 0x10004e86), size 19.631 KiB; page_block = [0x10000, 0x10005), size 20.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
14:11:24.202 0 D elf loadable program header; file_block = [0x20290e, 0x207794), size 19.631 KiB; memory_block = [0x10000000, 0x10004e86), size 19.631 KiB; flags =   R
14:11:24.221 0 D extend mapping; block = [0x10005000, 0x1002dde6), size 163.475 KiB; page_block = [0x10005, 0x1002e), size 164.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
14:11:24.229 0 D elf loadable program header; file_block = [0x20779e, 0x2306f4), size 163.834 KiB; memory_block = [0x10004e90, 0x1002dde6), size 163.834 KiB; flags = X R
14:11:24.243 0 D elf loadable program header; file_block = [0x2306f6, 0x2307e6), size 240 B; memory_block = [0x1002dde8, 0x1002ded8), size 240 B; flags =  WR
14:11:24.250 0 D extend mapping; block = [0x1002e000, 0x10030970), size 10.359 KiB; page_block = [0x1002e, 0x10031), size 12.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
14:11:24.258 0 D elf loadable program header; file_block = [0x2307e6, 0x233256), size 10.609 KiB; memory_block = [0x1002ded8, 0x10030970), size 10.648 KiB; flags =  WR
14:11:24.288 0 I switch to; address_space = "base" @ 0p1000
14:11:24.304 0 I loaded ELF file; context = { rip: 0v10004F40, rsp: 0v7F7FFFFFF000 }; file_size = 408.516 KiB; process = { pid: <current>, address_space: "process" @ 0p30B0000, { rip: 0v10004F40, rsp: 0v7F7FFFFFF000 } }
14:11:24.318 0 I switch to; address_space = "0:5" @ 0p30B0000
14:11:24.323 0 I allocate; slot = Process { pid: 0:5, address_space: "0:5" @ 0p30B0000, { rip: 0v10004F40, rsp: 0v7F7FFFFFF000 } }; process_count = 1
14:11:24.330 0 I user process page table entry; entry_point = 0v10004F40; frame = Frame(12340 @ 0p3034000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
14:11:24.339 0 D process_frames = 90
14:11:24.342 0 I switch to; address_space = "0:5" @ 0p30B0000
14:11:24.346 0 D entering the user mode; pid = 0:5; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10004F40, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
14:11:24.447 0 D leaving the user mode; pid = 0:5
14:11:24.450 0 I the process was preempted; pid = 0:5; user_context = { mode: user, cs:rip: 0x0023:0v10004EFA, ss:rsp: 0x001B:0v7F7FFFFFEFB8, rflags: IF AF }
14:11:24.458 0 D returned from the user space
14:11:24.461 0 I free; slot = Process { pid: 0:5, address_space: "0:5" @ 0p30B0000, { rip: 0v10004EFA, rsp: 0v7F7FFFFFEFB8 } }; process_count = 0
14:11:24.469 0 I switch to; address_space = "base" @ 0p1000
14:11:24.472 0 I drop the current address space; address_space = "0:5" @ 0p30B0000; switch_to = "base" @ 0p1000
kernel::tests::process::preemption----------------- [passed]
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/interrupts.rs      |    5 ++++-
 kernel/src/process/process.rs |   16 ++++++++++++++--
 2 files changed, 18 insertions(+), 3 deletions(-)
```
