## Поддержка нескольких процессоров --- Symmetric multiprocessing (SMP)

В этой части лабораторке нужно будет реализовать управление процессорами в симметричной архитектуре.
Для вашего удобства, часть разбита на три задачи, которые нужно делать по порядку:

- Работа с local APIC.
- Состояние каждого процессора.
- Загрузка Application Processor.

В [x86-64](https://en.wikipedia.org/wiki/X86-64) [многопроцессорность](https://en.wikipedia.org/wiki/Multiprocessing) выполнена либо в модели
[SMP](https://en.wikipedia.org/wiki/Symmetric_multiprocessing) (Symmetric Multiprocessing), либо
[NUMA](https://en.wikipedia.org/wiki/Non-uniform_memory_access) (Non-uniform memory access).
В обоих случаях все процессоры, как правило, одинаковые и выполняют один и тот же код операционной системы.
Тем не менее во время загрузки сперва работает только один процессор, называемый Bootstrap Processor (BP).
Какой именно это будет процессор, определяется железом.
После того как ОС загрузилась на BP, она может запустить остальные процессоры, которые именуются Application Processors (AP).
Чтобы запустить AP, операционная система c процессора BP посылает AP прерывание с помощью
local [Advanced Programmable Interrupt Controller](https://en.wikipedia.org/wiki/Advanced_Programmable_Interrupt_Controller) (local APIC, LAPIC).

![](https://upload.wikimedia.org/wikipedia/commons/1/1c/SMP_-_Symmetric_Multiprocessor_System.svg)


### Код работы с SMP в Nikka собран в модуль [`kernel::smp`](../../doc/kernel/smp/index.html) в директории `kernel/src/smp`

- [`kernel/src/smp/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/mod.rs) --- корневая часть модуля [`kernel::smp`](../../doc/kernel/smp/index.html). Содержит функцию [`fn kernel::smp::init(boot_info: &'static BootInfo)`](../../doc/kernel/smp/fn.init.html), инициализирующую работу с SMP. Основную часть работы она перекладывает на внутреннюю функцию [`fn kernel::smp::init_smp(phys2virt: Page) -> Result<()>`](../../doc/kernel/smp/fn.init_smp.html).
- [`kernel/src/smp/acpi_info.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/acpi_info.rs) --- обвязка внешней библиотеки [`acpi`](../../doc/acpi/index.html), которая используется для получения информации о конфигурации оборудования из таблиц, предоставляемых BIOS.
- [`kernel/src/smp/ap_init.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/ap_init.rs) --- код инициализации Application Processors.
- [`kernel/src/smp/cpu.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/cpu.rs) --- код для работы с вектором структур [`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html), каждая из которых принадлежит своему процессору системы.
- [`kernel/src/smp/local_apic.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/local_apic.rs) --- код работы с local APIC.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/smp/ap_init.rs    |   55 ++++++++++++++++++++++++++++++++++++++++---
 kernel/src/smp/cpu.rs        |   54 +++++++++++++++++++++++++++++++++++-------
 kernel/src/smp/local_apic.rs |   19 +++++++++++++-
 3 files changed, 115 insertions(+), 13 deletions(-)
```

Однако, будьте готовы к тому что на написание и отладку
[задачи 4](../../lab/book/4-concurrency-1-smp-3-ap-init.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-4--%D0%BF%D0%B5%D1%80%D0%B5%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-ap-%D0%B2-64-%D0%B1%D0%B8%D1%82%D0%BD%D1%8B%D0%B9-%D1%80%D0%B5%D0%B6%D0%B8%D0%BC)
может потребоваться много времени.
Также может потребоваться изучить ассемблер различных режимов работы процессора архитектуры
[x86-64](https://en.wikipedia.org/wiki/X86-64).
