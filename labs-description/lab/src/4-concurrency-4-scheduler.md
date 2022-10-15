## Round-robin планировщик

Планировщик процессов расположен в файле [`kernel/src/process/scheduler.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/scheduler.rs) и реализует простейшее
[циклическое исполнение процессов](https://en.wikipedia.org/wiki/Round-robin_scheduling).
Он содержит очередь процессов `Scheduler::queue` такой же ёмкости, как таблица процессов.
И, так же как и таблица процессов, является [синглтоном](https://en.wikipedia.org/wiki/Singleton_pattern)
`static ref SCHEDULER: Mutex<Scheduler>`.

### Задача 8 --- реализуйте методы планировщика

- `fn Scheduler::enqueue(pid: Pid)` ставит процесс, заданный идентификатором `pid` в очередь исполнения.
- `fn Scheduler::dequeue() -> Option<Pid>` достаёт из очереди первый процесс.
- `fn Scheduler::run_one() -> bool` выполняет один цикл работы --- берёт первый процесс из очереди и исполняет его пользовательский код. Если метод `Process::enter_user_mode()` вернёт `true`, то есть процесс был снят с CPU принудительно по прерыванию таймера, `run_one()` перепланирует исполнение процесса, ставя его в конец очереди. `run_one()` возвращает `true` если в очереди на исполнение нашёлся хотя бы один процесс.

Метод `fn Scheduler::run() -> !` уже реализован.
Он в вечном цикле выполняет `Scheduler::run_one()`.
Если в очереди на исполнение, процессов не нашлось,
то он выключает процессор до прихода следующего прерывания, самое долгое --- до следующего тика таймера

```rust
extern "x86-interrupt" fn apic_timer(mut context: InterruptContext)
```

Для этого служит специальная инструкция `hlt` ---
[`x86_64::instructions::hlt()`](../../doc/x86_64/instructions/fn.hlt.html).

Добавьте вызов `Scheduler::run()` в конец функции
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
в файле [`kernel/src/smp/ap_init.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/ap_init.rs), чтобы все CPU занялись исполнением процессов.


### Проверьте себя

Теперь должен заработать тест `scheduler()` в файле [`kernel/src/tests/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/process.rs):

```console
kernel::tests::process::scheduler---------------------------
15:08:34.039 0 I page allocator init; free_page_count = 33688649728; block = [2.000 TiB, 127.500 TiB), size 125.500 TiB
15:08:34.061 0 I duplicate; address_space = "process" @ 0p30B0000
15:08:34.065 0 I switch to; address_space = "process" @ 0p30B0000
15:08:34.075 0 D extend mapping; block = [0x10000000, 0x10004e86), size 19.631 KiB; page_block = [0x10000, 0x10005), size 20.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:34.086 0 D elf loadable program header; file_block = [0x268bf1, 0x26da77), size 19.631 KiB; memory_block = [0x10000000, 0x10004e86), size 19.631 KiB; flags =   R
15:08:34.105 0 D extend mapping; block = [0x10005000, 0x1002ddd6), size 163.459 KiB; page_block = [0x10005, 0x1002e), size 164.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:34.113 0 D elf loadable program header; file_block = [0x26da81, 0x2969c7), size 163.818 KiB; memory_block = [0x10004e90, 0x1002ddd6), size 163.818 KiB; flags = X R
15:08:34.130 0 D elf loadable program header; file_block = [0x2969c9, 0x296ab9), size 240 B; memory_block = [0x1002ddd8, 0x1002dec8), size 240 B; flags =  WR
15:08:34.137 0 D extend mapping; block = [0x1002e000, 0x10030960), size 10.344 KiB; page_block = [0x1002e, 0x10031), size 12.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:34.145 0 D elf loadable program header; file_block = [0x296ab9, 0x299529), size 10.609 KiB; memory_block = [0x1002dec8, 0x10030960), size 10.648 KiB; flags =  WR
15:08:34.184 0 I switch to; address_space = "base" @ 0p1000
15:08:34.195 0 I loaded ELF file; context = { rip: 0v10004F30, rsp: 0v7F7FFFFFF000 }; file_size = 408.727 KiB; process = { pid: <current>, address_space: "process" @ 0p30B0000, { rip: 0v10004F30, rsp: 0v7F7FFFFFF000 } }
15:08:34.221 0 I switch to; address_space = "0:7" @ 0p30B0000
15:08:34.232 0 I allocate; slot = Process { pid: 0:7, address_space: "0:7" @ 0p30B0000, { rip: 0v10004F30, rsp: 0v7F7FFFFFF000 } }; process_count = 1
15:08:34.240 0 I user process page table entry; entry_point = 0v10004F30; frame = Frame(12386 @ 0p3062000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
15:08:34.248 0 D process_frames = 90
15:08:34.295 0 I page allocator init; free_page_count = 33688649728; block = [2.000 TiB, 127.500 TiB), size 125.500 TiB
15:08:34.311 0 I duplicate; address_space = "process" @ 0p306D000
15:08:34.321 0 I switch to; address_space = "process" @ 0p306D000
15:08:34.331 0 D extend mapping; block = [0x10000000, 0x10004ecf), size 19.702 KiB; page_block = [0x10000, 0x10005), size 20.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:34.342 0 D elf loadable program header; file_block = [0x3373a7, 0x33c276), size 19.702 KiB; memory_block = [0x10000000, 0x10004ecf), size 19.702 KiB; flags =   R
15:08:34.362 0 D extend mapping; block = [0x10005000, 0x1002de8a), size 163.635 KiB; page_block = [0x10005, 0x1002e), size 164.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:34.370 0 D elf loadable program header; file_block = [0x33c277, 0x365231), size 163.932 KiB; memory_block = [0x10004ed0, 0x1002de8a), size 163.932 KiB; flags = X R
15:08:34.387 0 D elf loadable program header; file_block = [0x365237, 0x365327), size 240 B; memory_block = [0x1002de90, 0x1002df80), size 240 B; flags =  WR
15:08:34.393 0 D extend mapping; block = [0x1002e000, 0x10030a30), size 10.547 KiB; page_block = [0x1002e, 0x10031), size 12.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
15:08:34.401 0 D elf loadable program header; file_block = [0x365327, 0x367daf), size 10.633 KiB; memory_block = [0x1002df80, 0x10030a30), size 10.672 KiB; flags =  WR
15:08:34.428 0 I switch to; address_space = "base" @ 0p1000
15:08:34.443 0 I loaded ELF file; context = { rip: 0v10008260, rsp: 0v7F7FFFFFF000 }; file_size = 408.961 KiB; process = { pid: <current>, address_space: "process" @ 0p306D000, { rip: 0v10008260, rsp: 0v7F7FFFFFF000 } }
15:08:34.457 0 I switch to; address_space = "1:0" @ 0p306D000
15:08:34.462 0 I allocate; slot = Process { pid: 1:0, address_space: "1:0" @ 0p306D000, { rip: 0v10008260, rsp: 0v7F7FFFFFF000 } }; process_count = 2
15:08:34.469 0 I user process page table entry; entry_point = 0v10008260; frame = Frame(12425 @ 0p3089000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
15:08:34.478 0 D process_frames = 90
15:08:34.481 0 I dequeue; pid = Some(0:2)
15:08:34.484 0 I dequeue; pid = Some(0:2)
15:08:34.487 0 I dequeue; pid = Some(0:2)
15:08:34.489 0 I dequeue; pid = Some(0:7)
15:08:34.492 0 I switch to; address_space = "0:7" @ 0p30B0000
15:08:34.496 0 D entering the user mode; pid = 0:7; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10004F30, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
15:08:34.518 0 D leaving the user mode; pid = 0:7
15:08:34.521 0 I the process was preempted; pid = 0:7; user_context = { mode: user, cs:rip: 0x0023:0v1001A1B6, ss:rsp: 0x001B:0v7F7FFFFFEF28, rflags: IF AF }
15:08:34.528 0 I returned
15:08:34.531 0 I dequeue; pid = Some(1:0)
15:08:34.534 0 I switch to; address_space = "1:0" @ 0p306D000
15:08:34.537 0 D entering the user mode; pid = 1:0; registers = { rax: 0x0, rdi: 0x7F7FFFFEB000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10008260, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
15:08:34.547 0 D exception = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10004F96, ss:rsp: 0x001B:0v7F7FFFFFEF78, rflags: IF ZF PF }
15:08:34.578 0 I user mode exception; exception = "Page Fault"; number = 14; info = { code: 0b100 = non-present page | read | user, address: 0v1 }; context = { mode: user, cs:rip: 0x0023:0v10004F96, ss:rsp: 0x001B:0v7F7FFFFFEF78, rflags: IF ZF PF }; pid = 1:0
15:08:34.595 0 I free; slot = Process { pid: 1:0, address_space: "1:0" @ 0p306D000, { rip: 0v10008260, rsp: 0v7F7FFFFFF000 } }; process_count = 1
15:08:34.601 0 I switch to; address_space = "base" @ 0p1000
15:08:34.604 0 I drop the current address space; address_space = "1:0" @ 0p306D000; switch_to = "base" @ 0p1000
15:08:34.645 0 D leaving the user mode; pid = 1:0
15:08:34.649 0 I dequeue; pid = Some(0:7)
15:08:34.652 0 I switch to; address_space = "0:7" @ 0p30B0000
15:08:34.655 0 D entering the user mode; pid = 0:7; registers = { rax: 0x10030950, rdi: 0x10030950, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v1001A1B6, ss:rsp: 0x001B:0v7F7FFFFFEF28, rflags: IF AF } }
15:08:34.664 0 D leaving the user mode; pid = 0:7
15:08:34.679 0 I the process was preempted; pid = 0:7; user_context = { mode: user, cs:rip: 0x0023:0v1001A1B6, ss:rsp: 0x001B:0v7F7FFFFFEF28, rflags: IF AF }
15:08:34.689 0 I returned
15:08:34.692 0 I dequeue; pid = Some(0:7)
15:08:34.695 0 I switch to; address_space = "0:7" @ 0p30B0000
15:08:34.699 0 D entering the user mode; pid = 0:7; registers = { rax: 0x10030950, rdi: 0x10030950, rsi: 0x1, { mode: user, cs:rip: 0x0023:0v1001A1B6, ss:rsp: 0x001B:0v7F7FFFFFEF28, rflags: IF AF } }
15:08:34.713 0 I free; slot = Process { pid: 0:7, address_space: "0:7" @ 0p30B0000, { rip: 0v10004EEC, rsp: 0v0 } }; process_count = 0
15:08:34.719 0 I switch to; address_space = "base" @ 0p1000
15:08:34.722 0 I drop the current address space; address_space = "0:7" @ 0p30B0000; switch_to = "base" @ 0p1000
15:08:34.764 0 I syscall = "exit"; pid = 0:7; code = 3141592653589793238; reason = None
15:08:34.771 0 D leaving the user mode; pid = 0:7
15:08:34.774 0 I dequeue; pid = None
kernel::tests::process::scheduler------------------ [passed]
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/scheduler.rs |   26 +++++++++++++++++++++++---
 1 file changed, 23 insertions(+), 3 deletions(-)
```
