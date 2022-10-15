## Конкурентное выполнение задач

В этой лабораторке нужно будет реализовать конкурентное исполнение на уровне железа, то есть на разных процессорах одновременно.
А также, конкурентное исполнение пользовательских процессов на одном процессоре за счёт разделения его времени работы между ними.

### Ориентировочный объём работ этой лабораторки

```console
 kernel/src/interrupts.rs        |    5 +-
 kernel/src/process/process.rs   |   16 +++++-
 kernel/src/process/scheduler.rs |   26 +++++++++-
 kernel/src/process/table.rs     |  100 ++++++++++++++++++++++++++++++++++++++--
 kernel/src/smp/ap_init.rs       |   42 ++++++++++++++++
 kernel/src/smp/cpu.rs           |   32 +++++++++++-
 kernel/src/smp/local_apic.rs    |   17 ++++++
 7 files changed, 221 insertions(+), 17 deletions(-)
```

Однако, будьте готовы к тому что на написание и отладку [задачи 6](../../lab/book/4-concurrency-1-smp-3-ap-init.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-6--%D0%BF%D0%B5%D1%80%D0%B5%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-ap-%D0%B2-64-%D0%B1%D0%B8%D1%82%D0%BD%D1%8B%D0%B9-%D1%80%D0%B5%D0%B6%D0%B8%D0%BC) может потребоваться много времени. Также может потребоваться изучить ассемблер различных режимов работы процессора архитектуры [x86-64](https://en.wikipedia.org/wiki/X86-64).