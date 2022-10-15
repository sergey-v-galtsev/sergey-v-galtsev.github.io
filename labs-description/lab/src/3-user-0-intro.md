## Поддержка пользовательских процессов

В этой лабораторке нужно будет добавить в Nikka пользовательские процессы.
А именно, написать код инициализации и загрузки процесса в память,
а также передачу управления пользовательскому коду.


### Структура кода работы с пользовательскими процессами в Nikka


Код работы с пользовательскими процессами в ядре собран в модуль [`kernel::process`](../../doc/kernel/process/index.html) в директории `kernel/src/process`:

- [`kernel/src/process/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/mod.rs) --- корневая часть модуля [`kernel::process`](../../doc/kernel/process/index.html). Содержит функцию [`fn kernel::process::init()`](../../doc/kernel/process/fn.init.html), инициализирующую работу с процессами. Она вызывает функции инициализации своих подсистем --- системных вызовов, таблицы процессов, планировщика.
- [`kernel/src/process/elf.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/elf.rs) --- содержит функцию загрузки ELF--файла в память [`fn kernel::process::elf::load()`](../../doc/kernel/process/elf/fn.load.html).
- [`kernel/src/process/process.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/process.rs) --- содержит основную структуру [`kernel::process::process::Process`](../../doc/kernel/process/process/struct.Process.html), описывающую пользовательский процесс.
- [`kernel/src/process/registers.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/registers.rs) --- содержит структуру [`kernel::process::registers::Registers`](../../doc/kernel/process/registers/struct.Registers.html) для низкоуровневого контроля состояния процесса.
- [`kernel/src/process/scheduler.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/scheduler.rs) --- планировщик исполнения процессов [`kernel::process::scheduler::Scheduler`](../../doc/kernel/process/scheduler/struct.Scheduler.html).
- [`kernel/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/syscall.rs) --- содержит функцию [`fn kernel::process::syscall::syscall()`](../../doc/kernel/process/syscall/fn.syscall.html), которая является входной точкой системных вызовов и выполняет их диспетчеризацию. Функции, реализующие разные системные вызовы находятся в этом же файле. Также содержит функцию [`fn kernel::process::syscall::init()`](../../doc/kernel/process/syscall/fn.init.html) инициализации системных вызовов.
- [`kernel/src/process/table.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/table.rs) --- содержит таблицу процессов [`kernel::process::table::Table`](../../doc/kernel/process/table/struct.Table.html).

Код, который используется и в ядре и в пространстве пользователя, собран в модуль [`ku::process`](../../doc/ku/process/index.html) в директории `ku/src/process`:

- [`ku/src/process/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/process/mod.rs) --- корневая часть модуля [`ku::process`](../../doc/ku/process/index.html).
- [`ku/src/process/trap_info.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/process/trap_info.rs) --- содержит структуру [`ku::process::trap_info::TrapInfo`](../../doc/ku/process/trap_info/struct.TrapInfo.html), которая передаёт из ядра в режим пользователя информацию о возникшем прерывании.
- [`ku/src/process/mini_context.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/process/mini_context.rs) --- содержит структуру [`ku::process::mini_context::MiniContext`](../../doc/ku/process/mini_context/struct.MiniContext.html), которая инкапсулирует минимальный контекст исполнения --- регистры `RIP` и `RSP`.
- [`ku/src/process/pid.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/process/pid.rs) --- содержит структуру [`ku::process::pid::Pid`](../../doc/ku/process/pid/enum.Pid.html), которая описывает идентификатор процесса.
- [`ku/src/process/syscall.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/process/syscall.rs) --- модуль [`ku::process::syscall`](../../doc/ku/process/syscall/index.html), содержит константы для системных вызовов.


### Ориентировочный объём работ этой лабораторки

```console
 kernel/src/memory/address_space.rs |   22 +++++-
 kernel/src/process/elf.rs          |   71 +++++++++++++++++++-
 kernel/src/process/registers.rs    |   63 +++++++++++++++++-
 kernel/src/process/syscall.rs      |  127 ++++++++++++++++++++++++++++++++++---
 user/lib/src/syscall.rs            |   54 +++++++++++++++
 5 files changed, 319 insertions(+), 18 deletions(-)
```
