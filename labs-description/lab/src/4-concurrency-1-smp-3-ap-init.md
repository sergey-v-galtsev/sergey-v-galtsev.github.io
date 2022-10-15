## Загрузка Application Processor

Перед тем как приступить к запуску AP, процессор BSP должен собрать всю информацию о системе: общее число CPU, их APIC ID и адреса, по которым располагаются MMIO для LAPIC.
Эту информацию собирает BIOS, а ядро получает её от него в таблицах
[Advanced Configuration and Power Interface](https://en.wikipedia.org/wiki/Advanced_Configuration_and_Power_Interface) (ACPI).
Чтение таблицы конфигурации процессоров реализовано с помощью внешней библиотеки
[`acpi`](../../doc/acpi/index.html) и находится в методе
[`kernel::smp::acpi_info::AcpiInfo::new()`](../../doc/kernel/smp/acpi_info/struct.AcpiInfo.html#method.new)
в файле [`kernel/src/smp/acpi_info.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/acpi_info.rs).

Непосредственно запуск AP из BSP происходит в функции
[`kernel::smp::ap_init::boot_ap()`](../../doc/kernel/smp/ap_init/fn.boot_ap.html)
в файле [`kernel/src/smp/ap_init.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/ap_init.rs).
BSP указывает адрес, c которого начинать выполнение кода загрузки AP, передавая его в
[inter-processor interrupt](https://en.wikipedia.org/wiki/Inter-processor_interrupt) (IPI)
с помощью метода
[`kernel::smp::local_apic::LocalApic::send_init()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.send_init).
BSP должен передать AP код загрузчика, слепок которого находится в функции
[`kernel::smp::ap_init::switch_from_real_mode_to_long_mode()`](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html)
в файле [`kernel/src/smp/ap_init.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/ap_init.rs).
Проблема в том, что AP ещё находится в [16-битном реальном режиме](https://en.wikipedia.org/wiki/Real_mode), в котором может адресовать только 1 мегабайт памяти.
Поэтому код загрузчика нужно перенести туда, откуда AP сможет его прочитать.
В Nikka выбран фиксированный физический адрес
[`kernel::smp::ap_init::BOOT_CODE`](../../doc/kernel/smp/ap_init/constant.BOOT_CODE.html).

В конец того же фрейма памяти записывается стек с дополнительной информацией для загрузки AP.
Через этот стек в
[`switch_from_real_mode_to_long_mode()`](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html)
передаётся дополнительная информация, необходимая для загрузки AP.
Например, дескриптор описывающий GDT, который можно передать инструкции `lgdt` как есть.
Или адрес корневой таблицы страниц, который можно как есть записать в `CR3`.
Это сделано, чтобы:

- Не нужно было в функции [`switch_from_real_mode_to_long_mode()`](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html) на 16-битном ассемблере строить GDT, таблицы страниц и т.д. То есть для максимального упрощения ассемблерной части кода.
- Содержимое системных регистров процессора на всех AP совпадало с аналогичными регистрами BSP. То есть, чтобы можно было один раз правильно настроить системные регистры BSP, и автоматически получить правильные и консистентные по системе в целом настройки всех процессоров. Естественно, исключая те системные регистры, которые должны быть разными и настраиваются в предыдущих задачах в [`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html).

Вся эта информация передаётся в виде структуры
[`kernel::smp::ap_init::BootStack`](../../doc/kernel/smp/ap_init/struct.BootStack.html),
которая определена в файле [`kernel/src/smp/ap_init.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/ap_init.rs).

Подготовку кода и стека выполняет функция
[`kernel::smp::ap_init::prepare_boot_code()`](../../doc/kernel/smp/ap_init/fn.prepare_boot_code.html).
Копирование кода она делегирует функции
[`kernel::smp::ap_init::copy_switch_mode_code()`](../../doc/kernel/smp/ap_init/fn.copy_switch_mode_code.html),
а подготовку стека --- методу
[`kernel::smp::ap_init::BootStack::new()`](../../doc/kernel/smp/ap_init/struct.BootStack.html#method.new).

После подготовки кода и данных загрузчика,
[`boot_ap()`](../../doc/kernel/smp/ap_init/fn.boot_ap.html)
с помощью
[`LocalApic::send_init()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.send_init)
посылает AP специальное прерывание
[`kernel::smp::local_apic::InterruptCommand::START_UP`](../../doc/kernel/smp/local_apic/struct.InterruptCommand.html#associatedconstant.START_UP)
вместе с указанием, с какого адреса начинать исполнение --- в нашем случае
[`BOOT_CODE`](../../doc/kernel/smp/ap_init/constant.BOOT_CODE.html).
Код загрузчика
[`switch_from_real_mode_to_long_mode()`](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html)
переводит процессор в защищённый режим, настраивает сегменты кода и данных ядра и виртуальную память, необходимую для перехода к выполнению кода на языке Rust.
После этого она переключается с временного стека в стек ядра, который мы подготовили в
[задаче 5](../../lab/book/4-concurrency-1-smp-2-cpus.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-5--%D0%98%D0%BD%D0%B8%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F-%D0%B2%D0%B5%D0%BA%D1%82%D0%BE%D1%80%D0%B0-%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%82%D1%83%D1%80-kernelsmpcpucpu).
И переходит в функцию
[`kernel::smp::ap_init::init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
из [`kernel/src/smp/acpi_info.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/acpi_info.rs),
которая станет первой функцией на Rust, запущенной на AP.

Функция
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
завершает инициализацию AP:

- Загружает основную `GDT` ядра. И переключает сегментные регистры на неё.
- Инициализирует его local APIC методом [`LocalApic::init()`](../../doc/kernel/smp/local_apic/struct.LocalApic.html#method.init).
- Инициализирует регистры `FS` и `TSS` методами [`Cpu::set_fs()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.set_fs) и [`Cpu::set_tss()`](../../doc/kernel/smp/cpu/struct.Cpu.html#method.set_tss).
- Инициализирует регистр `IDTR` и включает прерывания.

Все AP запускаются по очереди.
Функция
[`kernel::smp::init_smp()`](../../doc/kernel/smp/fn.init_smp.html)
из файла [`kernel/src/smp/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/mod.rs) в цикле запускает
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
для каждого из найденных в системе AP ---
[`kernel::smp::acpi_info::usable_aps()`](../../doc/kernel/smp/acpi_info/fn.usable_aps.html).
А функция
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
перед выходом ждёт когда запущенный им AP завершит свою инициализацию и сигнализирует об этом через
[`core::sync::atomic::AtomicBool`](https://doc.rust-lang.org/nightly/core/sync/atomic/struct.AtomicBool.html).
Этот
[`AtomicBool`](https://doc.rust-lang.org/nightly/core/sync/atomic/struct.AtomicBool.html)
хранится на стеке функции
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html).
За ожидание на нём отвечает функция
[`kernel::smp::ap_init::wait_initialized()`](../../doc/kernel/smp/ap_init/fn.wait_initialized.html),
а AP сигнализирует об окончании своей загрузки с помощью функции
[`kernel::smp::ap_init::signal_initialized()`](../../doc/kernel/smp/ap_init/fn.signal_initialized.html).


### Задача 6 --- переключение AP в 64-битный режим

Реализуйте [функцию](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html)

```rust
fn switch_from_real_mode_to_long_mode() -> !
```

Она:

- Запускается в [16-битном реальном режиме](https://en.wikipedia.org/wiki/Real_mode) и в процессе работы переключается в [64-битный режим](https://en.wikipedia.org/wiki/Long_mode) напрямую, минуя [32-х битный защищённый режим](https://en.wikipedia.org/wiki/Protected_mode). Это делается аналогично [статье](https://wiki.osdev.org/Entering_Long_Mode_Directly), но гораздо проще, так как все нужные структуры и значения регистров код на Rust копирует с BSP.
- Должна настроить сегментные регистры и переключиться на временный стек по адресу записанному в константе [`kernel::smp::ap_init::BOOT_STACK`](../../doc/kernel/smp/ap_init/constant.BOOT_STACK.html).
- Инициализирует системные регистры, переданные через временный стек. В частности, страничное отображение и GDT.
- После инициализации GDT, переинициализирует сегментные регистры селекторами новой GDT. Для переинициализации `CS` можно использовать `far ret`. Использовать `far jmp` не получится, так как для него селектор сегмента кода должен быть константой, а нам хочется передать селектор кода переменной. Она записана в поле [`BootStack::kernel_code`](../../doc/kernel/smp/ap_init/struct.BootStack.html#structfield.kernel_code).
- Далее, забирает с временного стека аргументы для функции [`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html). И помещает их в регистры, в соответствии с [x86-64 C ABI](https://wiki.osdev.org/System_V_ABI#x86-64).
- Финальным аккордом переключается в выделенный данному CPU в [задаче 5](../../lab/book/4-concurrency-1-smp-2-cpus.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-5--%D0%98%D0%BD%D0%B8%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F-%D0%B2%D0%B5%D0%BA%D1%82%D0%BE%D1%80%D0%B0-%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%82%D1%83%D1%80-kernelsmpcpucpu) стек ядра и передаёт управление в функцию [`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html).

Поля в
[`BootStack`](../../doc/kernel/smp/ap_init/struct.BootStack.html)
организованы в удобном для референсного кода порядке.
В частности, поля с селектором кода
[`BootStack::kernel_code`](../../doc/kernel/smp/ap_init/struct.BootStack.html#structfield.kernel_code)
и релоцированным адресом
[`BootStack::set_cs_rip_to_64bit`](../../doc/kernel/smp/ap_init/struct.BootStack.html#structfield.set_cs_rip_to_64bit)
метки `set_cs_rip_to_64bit:` лежат так, что образуют
[far pointer](https://en.wikipedia.org/wiki/Far_pointer)
`kernel_code:set_cs_rip_to_64bit`, который может быть использован инструкцией `far ret` как есть.

Для передачи управления в функцию
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
стоит использовать косвенный `jmp` по её абсолютному адресу.
Так как код вызывающей функции
[`switch_from_real_mode_to_long_mode()`](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html)
будет релоцирован по адресу
[`BOOT_CODE`](../../doc/kernel/smp/ap_init/constant.BOOT_CODE.html),
относительные адреса в нём работать не будут.
А `jmp` предпочтительнее чем `call`, так как возвращаться функция
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
не будет.
Это видно по возвращаемому [типу *никогда*](https://doc.rust-lang.ru/book/ch19-04-advanced-types.html#%D0%A2%D0%B8%D0%BF-never-%D0%BA%D0%BE%D1%82%D0%BE%D1%80%D1%8B%D0%B9-%D0%BD%D0%B8%D0%BA%D0%BE%D0%B3%D0%B4%D0%B0-%D0%BD%D0%B5-%D0%B2%D0%BE%D0%B7%D0%B2%D1%80%D0%B0%D1%89%D0%B0%D0%B5%D1%82%D1%81%D1%8F) в её сигнатуре.
А значит, адрес возврата просто съел бы место в стеке ядра.
Для получения абсолютного адреса определённой в том же исходном файле метки, и в том числе функции,
в ассемблере можно использовать выражение `OFFSET init_ap`.

При желании вы можете отступить от предложенной схемы загрузки AP и реализовать любой другой работающий вариант.
Также, можно передать через
[`BootStack`](../../doc/kernel/smp/ap_init/struct.BootStack.html)
какую-либо дополнительную информацию.

Учтите, что дело осложняется тем, что до завершения инициализации AP, ни логирования, ни обработки исключений, ни других удобных для отладки вещей доступно не будет.
И, например, в случае возникновения любого исключения до вызова `IDT.load()`, вся система просто перезагрузится.
К счастью, мы запускаем Nikka в эмуляторе, и перезагрузится эмулируемая машина.
Кроме того, эмулятор [позволяет подключиться к ядру отладчиком](../../lab/book/0-intro-5-gdb.html) и выполнять код функции
[`switch_from_real_mode_to_long_mode()`](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html)
пошагово.

Однако, будьте готовы к тому что на написание и отладку этой задачи может потребоваться много времени.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/smp/ap_init.rs |   42 ++++++++++++++++++++++++++++++++++++++++--
 1 file changed, 40 insertions(+), 2 deletions(-)
```
