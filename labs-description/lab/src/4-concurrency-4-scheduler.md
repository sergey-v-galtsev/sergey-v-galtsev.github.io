## Round-robin планировщик

Планировщик процессов
[`kernel::process::scheduler::Scheduler`](../../doc/kernel/process/scheduler/struct.Scheduler.html)
расположен в файле
[`kernel/src/process/scheduler.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/scheduler.rs)
и реализует простейшее
[циклическое исполнение процессов](https://en.wikipedia.org/wiki/Round-robin_scheduling).
Он содержит очередь процессов
[`Scheduler::queue`](../../doc/kernel/process/scheduler/struct.Scheduler.html#structfield.queue)
такой же ёмкости, как таблица процессов.
И, так же как и таблица процессов, является [синглтоном](https://en.wikipedia.org/wiki/Singleton_pattern)
[`static ref SCHEDULER: Mutex<Scheduler>`](../../doc/kernel/process/scheduler/struct.SCHEDULER.html).


### Задача 7 --- планировщик

#### Реализуйте методы планировщика

- [`fn Scheduler::enqueue(pid: Pid)`](../../doc/kernel/process/scheduler/struct.Scheduler.html#method.enqueue) ставит процесс, заданный идентификатором `pid`, в очередь исполнения.
- [`fn Scheduler::dequeue() -> Option<Pid>`](../../doc/kernel/process/scheduler/struct.Scheduler.html#method.dequeue) достаёт из очереди первый процесс.
- [`fn Scheduler::run_one() -> bool`](../../doc/kernel/process/scheduler/struct.Scheduler.html#method.run_one) выполняет один цикл работы --- берёт первый процесс из очереди и исполняет его пользовательский код. Если метод [`Process::enter_user_mode()`](../../doc/kernel/process/process/struct.Process.html#method.enter_user_mode) вернёт `true`, то есть процесс был снят с CPU принудительно по прерыванию таймера, [`Scheduler::run_one()`](../../doc/kernel/process/scheduler/struct.Scheduler.html#method.run_one) перепланирует исполнение процесса, ставя его в конец очереди. Метод [`Scheduler::run_one()`](../../doc/kernel/process/scheduler/struct.Scheduler.html#method.run_one) возвращает `true` если в очереди на исполнение нашёлся хотя бы один процесс. Должен корректно обрабатывать ситуацию, когда `pid` есть в очереди планирования, но соответствующего процесса уже нет в [`kernel::process::Table`](../../doc/kernel/process/struct.Table.html).

Метод
[`fn Scheduler::run() -> !`](../../doc/kernel/process/scheduler/struct.Scheduler.html#method.run)
уже реализован.
Он в вечном цикле выполняет
[`Scheduler::run_one()`](../../doc/kernel/process/scheduler/struct.Scheduler.html#method.run_one).
Если в очереди на исполнение процессов не нашлось,
то он выключает процессор до прихода следующего прерывания, самое долгое --- до следующего тика таймера

```rust
extern "x86-interrupt" fn apic_timer(mut context: InterruptContext)
```

Для этого служит специальная инструкция
[`hlt`](https://www.felixcloutier.com/x86/hlt),
которая зовётся через функцию
[`x86_64::instructions::hlt()`](../../doc/x86_64/instructions/fn.hlt.html).

Добавьте вызов
[`Scheduler::run()`](../../doc/kernel/process/scheduler/struct.Scheduler.html#method.run)
в конец функции
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
в файле
[`kernel/src/smp/ap_init.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/ap_init.rs),
чтобы все CPU занялись исполнением процессов.


#### Системный вызов [`kernel::process::syscall::sched_yield()`](../../doc/kernel/process/syscall/fn.sched_yield.html)

Добавьте в файл
[`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs)
реализацию системного вызова
[`kernel::process::syscall::sched_yield()`](../../doc/kernel/process/syscall/fn.sched_yield.html)
с номером
[`ku::process::syscall::Syscall::SCHED_YIELD`](../../doc/ku/process/syscall/struct.Syscall.html#associatedconstant.SCHED_YIELD).
Он должен перепланировать процесс в конец очереди и забрать у него CPU функцией
[`kernel::process::process::Process::sched_yield()`](../../doc/kernel/process/process/struct.Process.html#method.sched_yield),
которая вернёт управление в другой контекст ядра --- в контекст из которого была вызвана функция
[`kernel::process::process::Process::enter_user_mode()`](../../doc/kernel/process/process/struct.Process.html#method.enter_user_mode).
То есть, управление вернётся в цикл планировщика.


### Проверьте себя

Теперь должны заработать тесты `syscall_sched_yield()` и `scheduler()` в файле
[`kernel/src/tests/4-concurrency-7-scheduler.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/4-concurrency-7-scheduler.rs):

```console
$ (cd kernel; cargo test --test 4-concurrency-7-scheduler)
...
4_concurrency_7_scheduler::syscall_sched_yield--------------
20:27:37 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:37 0 I duplicate; address_space = "process" @ 0p7E8A000
20:27:37 0 I switch to; address_space = "process" @ 0p7E8A000
20:27:37 0 D extend mapping; block = [0v10000000, 0v10006DA4), size 27.410 KiB; page_block = [0v10000000, 0v10007000), size 28.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:37 0 D elf loadable program header; file_block = [0v201B61, 0v208905), size 27.410 KiB; memory_block = [0v10000000, 0v10006DA4), size 27.410 KiB; flags =   R
20:27:37 0 D extend mapping; block = [0v10007000, 0v1004EA72), size 286.611 KiB; page_block = [0v10007000, 0v1004F000), size 288.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:37 0 D elf loadable program header; file_block = [0v208911, 0v2505D3), size 287.189 KiB; memory_block = [0v10006DB0, 0v1004EA72), size 287.189 KiB; flags = X R
20:27:37 0 D elf loadable program header; file_block = [0v2505D9, 0v2506C9), size 240 B; memory_block = [0v1004EA78, 0v1004EB68), size 240 B; flags =  WR
20:27:37 0 D extend mapping; block = [0v1004F000, 0v10054770), size 21.859 KiB; page_block = [0v1004F000, 0v10055000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:37 0 D elf loadable program header; file_block = [0v2506C9, 0v2562A9), size 22.969 KiB; memory_block = [0v1004EB68, 0v10054770), size 23.008 KiB; flags =  WR
20:27:37 0 I switch to; address_space = "base" @ 0p1000
20:27:37 0 I loaded ELF file; context = { rip: 0v10006E00, rsp: 0v7F7FFFFFF000 }; file_size = 5.307 MiB; process = { pid: <current>, address_space: "process" @ 0p7E8A000, { rip: 0v10006E00, rsp: 0v7F7FFFFFF000 } }
20:27:37 0 I allocate; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E8A000, { rip: 0v10006E00, rsp: 0v7F7FFFFFF000 } }; process_count = 1
20:27:37 0 I user process page table entry; entry_point = 0v10006E00; frame = Frame(32361 @ 0p7E69000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
20:27:37 0 D process_frames = 131
20:27:37 0 I switch to; address_space = "0:0" @ 0p7E8A000
20:27:37 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFED000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10006E00, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags:  } }
20:27:37 0 W log is not mapped properly; pid = 0:0
20:27:37 0 I syscall = "sched_yield"; pid = 0:0
20:27:37 0 D leaving the user mode; pid = 0:0
20:27:37 0 D returned from the user space; user_registers = [0, 0, 0, 0, 140187732463616, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
20:27:37 0 I switch to; address_space = "0:0" @ 0p7E8A000
20:27:37 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFED000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v1000801E, ss:rsp: 0x001B:0v7F7FFFFFEE18, rflags:  } }
20:27:37 0 W log is not mapped properly; pid = 0:0
20:27:37 0 I syscall = "sched_yield"; pid = 0:0
20:27:37 0 D leaving the user mode; pid = 0:0
20:27:37 0 D returned from the user space; user_registers = [0, 0, 0, 0, 140187732463616, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
20:27:37 0 I switch to; address_space = "0:0" @ 0p7E8A000
20:27:37 0 D entering the user mode; pid = 0:0; registers = { rax: 0x0, rdi: 0x7F7FFFFED000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v1000801E, ss:rsp: 0x001B:0v7F7FFFFFEE18, rflags:  } }
20:27:37 0 W log is not mapped properly; pid = 0:0
20:27:37 0 I syscall = "sched_yield"; pid = 0:0
20:27:37 0 D leaving the user mode; pid = 0:0
20:27:37 0 I free; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E8A000, { rip: 0v1000801E, rsp: 0v7F7FFFFFEE18 } }; process_count = 0
20:27:37 0 I switch to; address_space = "base" @ 0p1000
20:27:37 0 I drop the current address space; address_space = "0:0" @ 0p7E8A000; switch_to = "base" @ 0p1000
4_concurrency_7_scheduler::syscall_sched_yield----- [passed]

4_concurrency_7_scheduler::scheduler------------------------
20:27:37 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:37 0 I duplicate; address_space = "process" @ 0p7E8A000
20:27:37 0 I switch to; address_space = "process" @ 0p7E8A000
20:27:37 0 D extend mapping; block = [0v10000000, 0v10007514), size 29.270 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:37 0 D elf loadable program header; file_block = [0v750795, 0v757CA9), size 29.270 KiB; memory_block = [0v10000000, 0v10007514), size 29.270 KiB; flags =   R
20:27:37 0 D extend mapping; block = [0v10008000, 0v100539CD), size 302.450 KiB; page_block = [0v10008000, 0v10054000), size 304.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:37 0 D elf loadable program header; file_block = [0v757CB5, 0v7A4162), size 305.169 KiB; memory_block = [0v10007520, 0v100539CD), size 305.169 KiB; flags = X R
20:27:37 0 D elf loadable program header; file_block = [0v7A4165, 0v7A4255), size 240 B; memory_block = [0v100539D0, 0v10053AC0), size 240 B; flags =  WR
20:27:37 0 D extend mapping; block = [0v10054000, 0v10059B80), size 22.875 KiB; page_block = [0v10054000, 0v1005A000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:37 0 D elf loadable program header; file_block = [0v7A4255, 0v7AA2ED), size 24.148 KiB; memory_block = [0v10053AC0, 0v10059B80), size 24.188 KiB; flags =  WR
20:27:37 0 I switch to; address_space = "base" @ 0p1000
20:27:37 0 I loaded ELF file; context = { rip: 0v10007A90, rsp: 0v7F7FFFFFF000 }; file_size = 5.355 MiB; process = { pid: <current>, address_space: "process" @ 0p7E8A000, { rip: 0v10007A90, rsp: 0v7F7FFFFFF000 } }
20:27:37 0 I allocate; slot = Process { pid: 0:1, address_space: "0:1" @ 0p7E8A000, { rip: 0v10007A90, rsp: 0v7F7FFFFFF000 } }; process_count = 1
20:27:37 0 I user process page table entry; entry_point = 0v10007A90; frame = Frame(32392 @ 0p7E88000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
20:27:37 0 D process_frames = 136
20:27:37 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:37 0 I duplicate; address_space = "process" @ 0p7E02000
20:27:37 0 I switch to; address_space = "process" @ 0p7E02000
20:27:37 0 D extend mapping; block = [0v10000000, 0v10007514), size 29.270 KiB; page_block = [0v10000000, 0v10008000), size 32.000 KiB; flags =   R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:37 0 D elf loadable program header; file_block = [0vCAB6CD, 0vCB2BE1), size 29.270 KiB; memory_block = [0v10000000, 0v10007514), size 29.270 KiB; flags =   R
20:27:37 0 D extend mapping; block = [0v10008000, 0v100539ED), size 302.481 KiB; page_block = [0v10008000, 0v10054000), size 304.000 KiB; flags = X R; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:37 0 D elf loadable program header; file_block = [0vCB2BED, 0vCFF0BA), size 305.200 KiB; memory_block = [0v10007520, 0v100539ED), size 305.200 KiB; flags = X R
20:27:37 0 D elf loadable program header; file_block = [0vCFF0BD, 0vCFF1AD), size 240 B; memory_block = [0v100539F0, 0v10053AE0), size 240 B; flags =  WR
20:27:37 0 D extend mapping; block = [0v10054000, 0v10059BA0), size 22.906 KiB; page_block = [0v10054000, 0v1005A000), size 24.000 KiB; flags =  WR; page_flags = PRESENT | WRITABLE | USER_ACCESSIBLE
20:27:37 0 D elf loadable program header; file_block = [0vCFF1AD, 0vD05245), size 24.148 KiB; memory_block = [0v10053AE0, 0v10059BA0), size 24.188 KiB; flags =  WR
20:27:37 0 I switch to; address_space = "base" @ 0p1000
20:27:37 0 I loaded ELF file; context = { rip: 0v10007AB0, rsp: 0v7F7FFFFFF000 }; file_size = 5.354 MiB; process = { pid: <current>, address_space: "process" @ 0p7E02000, { rip: 0v10007AB0, rsp: 0v7F7FFFFFF000 } }
20:27:37 0 I allocate; slot = Process { pid: 1:0, address_space: "1:0" @ 0p7E02000, { rip: 0v10007AB0, rsp: 0v7F7FFFFFF000 } }; process_count = 2
20:27:37 0 I user process page table entry; entry_point = 0v10007AB0; frame = Frame(32224 @ 0p7DE0000); flags = PRESENT | WRITABLE | USER_ACCESSIBLE | ACCESSED | DIRTY
20:27:37 0 D process_frames = 136
20:27:37 0 I dequeue; pid = Some(0:0)
20:27:37 0 I dequeue; pid = Some(0:0)
20:27:37 0 I dequeue; pid = Some(0:0)
20:27:37 0 I dequeue; pid = Some(0:1)
20:27:37 0 I switch to; address_space = "0:1" @ 0p7E8A000
20:27:37 0 D entering the user mode; pid = 0:1; registers = { rax: 0x0, rdi: 0x7F7FFFFED000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10007A90, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
20:27:37 0 D leaving the user mode; pid = 0:1
20:27:37 0 I the process was preempted; pid = 0:1; user_context = { mode: user, cs:rip: 0x0023:0v1000BDF2, ss:rsp: 0x001B:0v7F7FFFFFEE88, rflags: IF ZF PF }
20:27:37 0 I returned
20:27:37 0 I dequeue; pid = Some(1:0)
20:27:37 0 I switch to; address_space = "1:0" @ 0p7E02000
20:27:37 0 D entering the user mode; pid = 1:0; registers = { rax: 0x0, rdi: 0x7F7FFFFED000, rsi: 0x0, { mode: user, cs:rip: 0x0023:0v10007AB0, ss:rsp: 0x001B:0v7F7FFFFFF000, rflags: IF } }
20:27:37 0 D leaving the user mode; pid = 1:0
20:27:37 0 I the process was preempted; pid = 1:0; user_context = { mode: user, cs:rip: 0x0023:0v1000BDF3, ss:rsp: 0x001B:0v7F7FFFFFEEA8, rflags: IF AF PF }
20:27:37 0 I returned
20:27:37 0 I dequeue; pid = Some(0:1)
20:27:37 0 I switch to; address_space = "0:1" @ 0p7E8A000
20:27:37 0 D entering the user mode; pid = 0:1; registers = { rax: 0x1, rdi: 0x7F7FFFFFEF50, rsi: 0x7F7FFFFFEF20, { mode: user, cs:rip: 0x0023:0v1000BDF2, ss:rsp: 0x001B:0v7F7FFFFFEE88, rflags: IF ZF PF } }
20:27:37 0 W log is not mapped properly; pid = 0:1
20:27:37 0 I free; slot = Process { pid: 0:1, address_space: "0:1" @ 0p7E8A000, { rip: 0v10007A4D, rsp: 0v0 } }; process_count = 1
20:27:37 0 I switch to; address_space = "base" @ 0p1000
20:27:37 0 I drop the current address space; address_space = "0:1" @ 0p7E8A000; switch_to = "base" @ 0p1000
20:27:37 0 I syscall = "exit"; pid = 0:1; code = 3141592653589793238; reason = None
20:27:37 0 D leaving the user mode; pid = 0:1
20:27:37 0 I dequeue; pid = Some(1:0)
20:27:37 0 I switch to; address_space = "1:0" @ 0p7E02000
20:27:37 0 D entering the user mode; pid = 1:0; registers = { rax: 0xD0F79FF, rdi: 0x7F7FFFFFEF70, rsi: 0x7F7FFFFFEF40, { mode: user, cs:rip: 0x0023:0v1000BDF3, ss:rsp: 0x001B:0v7F7FFFFFEEA8, rflags: IF AF PF } }
20:27:37 0 D trap = "Page Fault"; context = { mode: user, cs:rip: 0x0023:0v10007A61, ss:rsp: 0x001B:0v0, rflags: IF ZF PF }; info = { code: 0b100 = non-present page | read | user, address: 0v0 }
20:27:37 0 W log is not mapped properly; pid = 1:0
20:27:37 0 I user mode trap; trap = "Page Fault"; number = 14; info = { code: 0b100 = non-present page | read | user, address: 0v0 }; context = { mode: user, cs:rip: 0x0023:0v10007A61, ss:rsp: 0x001B:0v0, rflags: IF ZF PF }; pid = 1:0
20:27:37 0 I free; slot = Process { pid: 1:0, address_space: "1:0" @ 0p7E02000, { rip: 0v1000BDF3, rsp: 0v7F7FFFFFEEA8 } }; process_count = 0
20:27:37 0 I switch to; address_space = "base" @ 0p1000
20:27:37 0 I drop the current address space; address_space = "1:0" @ 0p7E02000; switch_to = "base" @ 0p1000
20:27:37 0 D leaving the user mode; pid = 1:0
20:27:37 0 I dequeue; pid = None
4_concurrency_7_scheduler::scheduler--------------- [passed]
20:27:37 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/scheduler.rs |   26 +++++++++++++++++++++-----
 1 file changed, 21 insertions(+), 5 deletions(-)
```
