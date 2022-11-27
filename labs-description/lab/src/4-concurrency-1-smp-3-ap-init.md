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
Или адрес корневой таблицы страниц, который можно записать в `CR3` как есть.
Это сделано, чтобы:

- Не нужно было в функции [`switch_from_real_mode_to_long_mode()`](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html) на 16-битном ассемблере строить GDT, таблицы страниц и т.д. То есть для максимального упрощения ассемблерной части кода.
- Содержимое системных регистров процессора на всех AP гарантированно совпадало с аналогичными регистрами BSP. То есть, чтобы можно было один раз правильно настроить системные регистры BSP, и автоматически получить правильные и консистентные по системе в целом настройки всех процессоров. Естественно, исключая те системные регистры, которые должны быть разными и настраиваются в предыдущих задачах в [`kernel::smp::cpu::Cpu`](../../doc/kernel/smp/cpu/struct.Cpu.html).

Вся эта информация передаётся в виде структуры
[`kernel::smp::ap_init::BootStack`](../../doc/kernel/smp/ap_init/struct.BootStack.html),
которая определена в файле [`kernel/src/smp/ap_init.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/smp/ap_init.rs).

> В этой структуре есть поле
> [`BootStack::small_gdt`](../../doc/kernel/smp/ap_init/struct.BootStack.html#structfield.small_gdt).
> Оно нужно по техническим причинам --- в реальном режиме нужно чтобы адрес GDT был 24-битным.
> Чтобы не накладывать такое ограничение на основную GDT ядра, в
> [`kernel::smp::ap_init::BootStack`](../../doc/kernel/smp/ap_init/struct.BootStack.html)
> и кладётся минимальная `small_gdt`, которая нужна только в функции
> [`switch_from_real_mode_to_long_mode()`](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html).
> Далее в
> [`kernel::smp::ap_init::init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
> Application Processor переключится на основную GDT ядра.

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
[предыдущей задаче](../../lab/book/4-concurrency-1-smp-2-cpus.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-3--%D0%B2%D0%B5%D0%BA%D1%82%D0%BE%D1%80-%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%82%D1%83%D1%80-kernelsmpcpucpu).
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
перед выходом ждёт когда запущенный ею AP завершит свою инициализацию и сигнализирует об этом через
[`core::sync::atomic::AtomicBool`](https://doc.rust-lang.org/nightly/core/sync/atomic/struct.AtomicBool.html).
Этот
[`AtomicBool`](https://doc.rust-lang.org/nightly/core/sync/atomic/struct.AtomicBool.html)
хранится на стеке функции
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html).
За ожидание на нём отвечает функция
[`kernel::smp::ap_init::wait_initialized()`](../../doc/kernel/smp/ap_init/fn.wait_initialized.html),
а AP сигнализирует об окончании своей загрузки с помощью функции
[`kernel::smp::ap_init::signal_initialized()`](../../doc/kernel/smp/ap_init/fn.signal_initialized.html).


### Задача 4 --- переключение AP в 64-битный режим

Реализуйте [функцию](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html)

```rust
fn switch_from_real_mode_to_long_mode() -> !
```

Она:

- Запускается в [16-битном реальном режиме](https://en.wikipedia.org/wiki/Real_mode) и в процессе работы переключается в [64-битный режим](https://en.wikipedia.org/wiki/Long_mode) напрямую, минуя [32-х битный защищённый режим](https://en.wikipedia.org/wiki/Protected_mode). Это делается аналогично статье [Entering Long Mode Directly](https://wiki.osdev.org/Entering_Long_Mode_Directly). Но гораздо проще, так как все нужные структуры и значения регистров код на Rust копирует с BSP в [`kernel::smp::ap_init::BootStack`](../../doc/kernel/smp/ap_init/struct.BootStack.html).
- Должна настроить сегментные регистры и переключиться на временный стек по адресу записанному в константе [`kernel::smp::ap_init::BOOT_STACK`](../../doc/kernel/smp/ap_init/constant.BOOT_STACK.html).
- Инициализирует системные регистры, переданные через временный стек. В частности, страничное отображение и GDT.
- После инициализации GDT, переинициализирует сегментные регистры селекторами новой GDT. Для переинициализации `CS` можно использовать [`far ret`](https://www.felixcloutier.com/x86/ret). Использовать [`far jmp`](https://www.felixcloutier.com/x86/jmp) не получится, так как для него селектор сегмента кода должен быть константой, а нам хочется передать селектор кода переменной. Она записана в поле [`BootStack::kernel_code`](../../doc/kernel/smp/ap_init/struct.BootStack.html#structfield.kernel_code). Обратите внимание на следующий момент в документации [`far ret`](https://www.felixcloutier.com/x86/ret): `In 64-bit mode ... the default operation size of far returns is 32 bits`.
- Далее, после метки `set_cs_rip_to_64bit`, забирает с временного стека аргументы для функции [`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html). И помещает их в регистры, в соответствии с [x86-64 C ABI](https://wiki.osdev.org/System_V_ABI#x86-64).
- Финальным аккордом переключается в выделенный данному CPU в [предыдущей задаче](../../lab/book/4-concurrency-1-smp-2-cpus.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-3--%D0%B2%D0%B5%D0%BA%D1%82%D0%BE%D1%80-%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%82%D1%83%D1%80-kernelsmpcpucpu) стек ядра и передаёт управление в функцию [`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html).

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
Вы можете менять порядок полей и их состав, так как удобнее вам.

Метки `switch_mode_start` и `switch_mode_end` отмечают границы загрузочного кода,
который должен быть скопирован.
Поэтому пишите код загрузки AP строго внутри них.

Для передачи управления в функцию
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
стоит использовать косвенный
[`jmp`](https://www.felixcloutier.com/x86/jmp)
по её абсолютному адресу.
Так как код вызывающей функции
[`switch_from_real_mode_to_long_mode()`](../../doc/kernel/smp/ap_init/fn.switch_from_real_mode_to_long_mode.html)
будет релоцирован по адресу
[`BOOT_CODE`](../../doc/kernel/smp/ap_init/constant.BOOT_CODE.html),
относительные адреса в нём работать не будут.
Непосредственный
[`jmp`](https://www.felixcloutier.com/x86/jmp)
перешёл бы по относительному адресу, то есть гарантированно сломался бы из-за релокации кода загрузки AP.
Это было бы видно в его машинном коде в дизассемблере --- у непосредственного
[`jmp`](https://www.felixcloutier.com/x86/jmp)
в машинном коде было бы смещение, которое не совпадало бы с абсолютным адресом
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html).
При этом для удобства пользователя в мнемонике дизассемблер показал бы абсолютный адрес.
А [`jmp`](https://www.felixcloutier.com/x86/jmp)
предпочтительнее чем
[`call`](https://www.felixcloutier.com/x86/call),
так как возвращаться функция
[`init_ap()`](../../doc/kernel/smp/ap_init/fn.init_ap.html)
не будет.
Это видно по возвращаемому
[типу *никогда*](https://doc.rust-lang.ru/book/ch19-04-advanced-types.html#%D0%A2%D0%B8%D0%BF-never-%D0%BA%D0%BE%D1%82%D0%BE%D1%80%D1%8B%D0%B9-%D0%BD%D0%B8%D0%BA%D0%BE%D0%B3%D0%B4%D0%B0-%D0%BD%D0%B5-%D0%B2%D0%BE%D0%B7%D0%B2%D1%80%D0%B0%D1%89%D0%B0%D0%B5%D1%82%D1%81%D1%8F) ---
`!` --- в её сигнатуре.
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


#### Дизассемблирование с помощью `objdump`

При использовании отладчика и дизассемблера, учтите что `.code16` и `.code64` --- макрокоманды,
которые не записываются в машинный код сами по себе.
Но они влияют на порождаемый машинный код --- декодирование инструкций в
[x86-64](https://en.wikipedia.org/wiki/X86-64)
зависит от режима работы процессора.
Дизассемблер ничего не знает про макрокоманды, так как их нет в машинном коде.
И, чтобы знать в каком режиме дизассемблировать код, ему либо нужна подсказка,
либо он должен хранить состояние процессора.
Иначе он будет показывать ерунду, которая сбивает с толку.
Теоретически понимать в каком режиме находится процессор мог бы отладчик,
но не произвольный дизассемблер вроде `objdump`.
Поэтому кроме мнемоник в дизассемблере в этой задаче полезно обращать внимание и на машинные коды.

Дизассемблировать ваш код до метки `set_cs_rip_to_64bit` можно указав архитектуру `i8086`:
```console
$ objdump --disassemble --architecture=i8086 --section=.switch_from_real_mode_to_long_mode --demangle --stop-address=$(objdump --syms target/kernel/debug/kernel | grep set_cs_rip_to_64bit | sed 's/^0*\([^ ]*\).*$/0x\1/') target/kernel/debug/kernel

target/kernel/debug/kernel:     file format elf64-x86-64


Disassembly of section .switch_from_real_mode_to_long_mode:

0000000000312c30 <kernel::smp::ap_init::switch_from_real_mode_to_long_mode>:
  312c30:	.. /* машинный код */	...    /* мнемоники вашего кода *
  ...
  ......:	cb                   	lret   /* то как дизассемблируется retf в неправильном режиме (он в коде уже в .code64) */

```
А после метки `set_cs_rip_to_64bit` код уже сформирован для 64--битного режима, как и весь файл.
Поэтому после неё архитектуру указывать не нужно:
```code
$ objdump -d --section=.switch_from_real_mode_to_long_mode --demangle --start-address=$(objdump --syms target/kernel/debug/kernel | grep set_cs_rip_to_64bit | sed 's/^0*\([^ ]*\).*$/0x\1/') target/kernel/debug/kernel

target/kernel/debug/kernel:     file format elf64-x86-64


Disassembly of section .switch_from_real_mode_to_long_mode:

0000000000...... <set_cs_rip_to_64bit>:
  ......:	.. /* машинный код */	...    /* мнемоники вашего кода *
  ...

0000000000...... <switch_mode_end>:
  ......:	0f 0b                	ud2
```

В этом дампе вы можете разглядеть ошибки.
Например, если вы воспользуетесь относительным
[`jmp`](https://www.felixcloutier.com/x86/jmp)
вместо абсолютного, то увидите что-то вроде:
```console
  312c75:	e9 a6 63 f6 ff       	jmp    279020 <init_ap>

0000000000312c7a <switch_mode_end>:
```
В машинном коде нет ни намёка на правильный адрес, хотя дизассемблер и подставил его в
мнемонику `jmp    279020 <init_ap>`.
Так как в машинном коде в обратном порядке байтов указано смещение `a6 63 f6 ff`
абсолютного адреса `0x279020 <init_ap>` относительно адреса следующей инструкции:
```console
(gdb) print /x 0x279020 - 0x312c7a
$1 = 0xfff663a6
```
А значит, после релокации такой код сломается, так как адрес следующей инструкции будет уже другой.


#### Дизассемблирование в `gdb`

Для указания архитектуры в `gdb` есть команда `set architecture`:
```console
(gdb) file target/kernel/debug/kernel
(gdb) set architecture
Requires an argument. Valid arguments are i386, i386:x86-64, i386:x64-32, i8086, i386:intel, i386:x86-64:intel, i386:x64-32:intel, auto.
(gdb) set architecture i8086
The target architecture is set to "i8086".
(gdb) disassemble switch_from_real_mode_to_long_mode, set_cs_rip_to_64bit
Dump of assembler code from 0x312c30 to 0x......:
   0x00312c30 <...+0>:	...	/* мнемоники вашего кода *
   ...
   0x00...... <...+..>:	lret	/* то как дизассемблируется retf в неправильном режиме (он в коде уже в .code64) */
End of assembler dump.
(gdb) set architecture i386:x86-64
The target architecture is set to "i386:x86-64".
(gdb) disassemble set_cs_rip_to_64bit, switch_mode_end
Dump of assembler code from 0x...... to 0x......:
   0x0000000000...... <...+..>:	...	/* мнемоники вашего кода *
   ...
End of assembler dump.
```


#### Пошаговое выполнение в `gdb`

Аналогично можно указать архитектуру при подключении `gdb` к `qemu`.
Сначала запустите тест, чтобы подглядеть нужные аргументы `qemu`:
``` console
$ cd kernel; cargo test --test 4-concurrency-4-ap-init 2>/dev/null | grep qemu
Running: `qemu-system-x86_64 -drive format=raw,file=/.../target/kernel/debug/deps/bootimage-4_concurrency_4_ap_init-91a7e203d980f479.bin -no-reboot -m size=128M -smp cpus=4 -device isa-debug-exit,iobase=0xF4,iosize=0x04 -serial stdio -display none`
...
```
Дальше в одной консоли запустите `qemu`, взяв команду из теста и добавив к ней опции `-gdb tcp::1234 -S`:
```console
$ qemu-system-x86_64 -drive format=raw,file=/.../target/kernel/debug/deps/bootimage-4_concurrency_4_ap_init-91a7e203d980f479.bin -no-reboot -m size=128M -smp cpus=4 -device isa-debug-exit,iobase=0xF4,iosize=0x04 -serial stdio -display none -gdb tcp::1234 -S
```
Он будет ждать подключения `gdb`.

То же самое сделает запуск скрипта
```console
$ ./run-gdb.sh 4-concurrency-4-ap-init
```

Теперь в другой консоли запустите `gdb`:
```console
$ gdb
...
```
Команду `file` можно указать, но это не обязательно:
```console
(gdb) file target/kernel/debug/kernel
```
Подключитесь к `localhost:1234`:
```console
(gdb) target remote localhost:1234
Remote debugging using localhost:1234
0x000000000000fff0 in ?? ()
(gdb) break *0x7000
Breakpoint 1 at 0x7000
(gdb) continue
Continuing.

Thread 2 received signal SIGTRAP, Trace/breakpoint trap.
[Switching to Thread 1.2]
0x0000000000000000 in ?? ()
```
Установите архитектуру, хотя `gdb` и выдаст предупреждения:
```console
(gdb) set architecture i8086
warning: Selected architecture i8086 is not compatible with reported target architecture i386:x86-64
warning: A handler for the OS ABI "GNU/Linux" is not built into this configuration
of GDB.  Attempting to continue with the default i8086 settings.

Architecture `i8086' not recognized.
The target architecture is set to "i8086".
```
Ноль в качестве текущего адреса --- `0x0000000000000000 in ?? ()` показывается потому что `CS:IP` равно `0x700:0x0`, а не эквивалентное `0x0:0x7000`:
```console
(gdb) info registers
...
rip            0x0                 0x0
eflags         0x2                 [ IOPL=0 ]
cs             0x700               1792
...
(gdb) print /x $cs * 16 + $rip
$1 = 0x7000
```
Теперь можно дизассемблировать и пройти по коду пошагово:
```console
(gdb) disassemble 0x7000, 0x7100
Dump of assembler code from 0x7000 to 0x7100:
   0x0000000000007000:	...	/* мнемоники вашего кода *
   ...
(gdb) stepi
0x00000000000000.. in ?? ()
```

Будьте готовы к тому что на написание и отладку этой задачи может потребоваться много времени.


### Проверьте себя

Запустите тест `4-concurrency-4-ap-init` из файла
[`kernel/tests/4-concurrency-4-ap-init.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/4-concurrency-4-ap-init.rs).
Сразу после времени логирование печатает номер текущего процессора.
Теперь их у нас четыре:

```console
$ (cd kernel; cargo test --test 4-concurrency-4-ap-init)
...
4_concurrency_4_ap_init::ap_init----------------------------
20:26:45 0 I acpi_info = AcpiInfo { local_apic_address: Phys(0pFEE00000), bsp_id: 0, ap_ids: [1, 2, 3] }
20:26:45 0 I Local APIC init; cpu = 0; cpu_count = 4; local_apic_address = 0pFEE00000
20:26:46 0 D set FS register to Cpu structure address; cpu = 0; fs = 0v7FFFFFEB8000
20:26:46 0 I Bootstrap Processor; cpu = 0
20:26:46 0 D boot_stack = { efer: 0xD01, cr4: 0x20, cr3: 0x1000, cr0: 0x80010011, gdt: { base: 0p007FD8, limit: 0x0027 }, kernel_code: SegmentSelector { index: 1, rpl: Ring0 }, kernel_data: SegmentSelector { index: 2, rpl: Ring0 }, set_cs_rip_to_64bit: 0p7035, kernel_stack: 0v7FFFFFEE9000, cpu: 0v7FFFFFEB8100, initialized: 0v10000200418 }
20:26:46 1 D set FS register to Cpu structure address; cpu = 1; fs = 0v7FFFFFEB8100
20:26:46 1 I report for duty; cpu = 1
20:26:46 0 I cpu = 1; duration = 30.504 ms; "boot Application Processor"
20:26:46 1 I arrived at the barrier; cpu = 1; cpu_count = 4; cpus_waiting = 0; last = false
20:26:46 0 D boot_stack = { efer: 0xD01, cr4: 0x20, cr3: 0x1000, cr0: 0x80010011, gdt: { base: 0p007FD8, limit: 0x0027 }, kernel_code: SegmentSelector { index: 1, rpl: Ring0 }, kernel_data: SegmentSelector { index: 2, rpl: Ring0 }, set_cs_rip_to_64bit: 0p7035, kernel_stack: 0v7FFFFFF09000, cpu: 0v7FFFFFEB8200, initialized: 0v10000200418 }
20:26:46 2 D set FS register to Cpu structure address; cpu = 2; fs = 0v7FFFFFEB8200
20:26:46 2 I report for duty; cpu = 2
20:26:46 0 I cpu = 2; duration = 30.957 ms; "boot Application Processor"
20:26:46 2 I arrived at the barrier; cpu = 2; cpu_count = 4; cpus_waiting = 1; last = false
20:26:46 0 D boot_stack = { efer: 0xD01, cr4: 0x20, cr3: 0x1000, cr0: 0x80010011, gdt: { base: 0p007FD8, limit: 0x0027 }, kernel_code: SegmentSelector { index: 1, rpl: Ring0 }, kernel_data: SegmentSelector { index: 2, rpl: Ring0 }, set_cs_rip_to_64bit: 0p7035, kernel_stack: 0v7FFFFFF29000, cpu: 0v7FFFFFEB8300, initialized: 0v10000200418 }
20:26:46 3 D set FS register to Cpu structure address; cpu = 3; fs = 0v7FFFFFEB8300
20:26:46 3 I report for duty; cpu = 3
20:26:46 0 I cpu = 3; duration = 30.971 ms; "boot Application Processor"
20:26:46 3 I arrived at the barrier; cpu = 3; cpu_count = 4; cpus_waiting = 2; last = false
20:26:46 0 I arrived at the barrier; cpu = 0; cpu_count = 4; cpus_waiting = 3; last = true
20:26:46 1 I all CPUs have arrived at the barrier; cpu = 1; cpu_count = 4
20:26:46 3 I all CPUs have arrived at the barrier; cpu = 3; cpu_count = 4
20:26:46 0 I all CPUs have arrived at the barrier; cpu = 0; cpu_count = 4
20:26:46 2 I all CPUs have arrived at the barrier; cpu = 2; cpu_count = 4
20:26:47.485 1 I AP halted; cpu = 1
20:26:47.491 3 I AP halted; cpu = 3
20:26:47.495 0 I racy_counter = 14031486; racefree_counter = 20000000
4_concurrency_4_ap_init::ap_init------------------- [passed]
20:26:47.503 0 I exit qemu; exit_code = SUCCESS
```

> Попробуйте реализовать `RACY_COUNTER` из теста без `unsafe`.


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/smp/ap_init.rs |   55 +++++++++++++++++++++++++++++++++++++++++++---
 1 file changed, 52 insertions(+), 3 deletions(-)
```
