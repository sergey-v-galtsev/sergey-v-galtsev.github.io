## Часы реального времени

Краткое описание возможностей микросхемы RTC и её низкоуровневого интерфейса можно посмотреть в статьях
[RTC](https://wiki.osdev.org/RTC) и [CMOS](https://wiki.osdev.org/CMOS)
на сайте [OSDev.org](https://wiki.osdev.org/).
Подробное описание есть в
[спецификации микросхемы Motorola MC146818](https://pdf1.alldatasheet.com/datasheet-pdf/view/122156/MOTOROLA/MC146818.html).
Современные микросхемы RTC поддерживают совместимость с ней.

Прежде всего напишем драйвер для работы с микросхемой
[часов реального времени (Real-time clock, RTC)](https://en.wikipedia.org/wiki/Real-time_clock).
Основная работа с RTC собрана в модуле
[`kernel::time::rtc`](../../doc/kernel/time/rtc/index.html),
который находится в файле
[`kernel/src/time/rtc.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/time/rtc.rs).


### Порты ввода--вывода

Взаимодействие процессора с устройствами называется [вводом--выводом](https://en.wikipedia.org/wiki/Input/output) (input/output, I/O, IO).
В [x86-64](https://en.wikipedia.org/wiki/X86-64) этот процесс
осуществляется одним из двух механизмов, в зависимости от устройства:

- Через [порты ввода--вывода](https://ru.wikipedia.org/wiki/%D0%9F%D0%BE%D1%80%D1%82_%D0%B2%D0%B2%D0%BE%D0%B4%D0%B0-%D0%B2%D1%8B%D0%B2%D0%BE%D0%B4%D0%B0) ([I/O port](https://wiki.osdev.org/I/O_Ports), [Port I/O](https://wiki.osdev.org/Port_IO)).
- Через специально выделенные диапазоны адресов памяти. Это называется [ввод--вывод через память](https://en.wikipedia.org/wiki/Memory-mapped_I/O). При этом собственно микросхемы памяти не задействуются, то есть термин немного не точен. Адреса ввода--вывода перехватываются другими устройствами, подключённым к [системной шине](https://en.wikipedia.org/wiki/System_bus).

Порты в x86-64 в основном используются для старых устройств,
новые чаще используют ввод--вывод через память.
В частности, микросхема RTC появилась в архитектуре x86-64 давно и использует порты ввода--вывода.
Поэтому с ними мы немного столкнёмся в этой лабораторке.
Не нужно пугаться от того как страшненько выглядит интерфейс ввода--вывода через порты ---
это просто наслоения легаси, экономии всего в ранних моделях компьютеров, и обратной совместимости с ними.

А вот новый контроллер прерываний
[APIC](https://en.wikipedia.org/wiki/Advanced_Programmable_Interrupt_Controller)
появился относительно недавно, вместе с многопроцессорностью.
Он использует ввод--вывод через память, с которым мы тоже поработаем.
Но в [будущей лабораторке](4-concurrency-1-smp-1-local-apic.md).

Порты ввода--вывода в x86-64 составляют пространство с 16--битными номерами от `0x0000` до `0xFFFF`.
Они могут быть одно-, двух- и четырёхбайтовыми.
Это определяется командой процессора, которая используется при чтении или записи.
И дополнительно ограничивается натуральным выравниванием номеров.
Например, порт `0x0001` может быть только однобайтовым.
А порт `0x0002` может быть либо однобайтовым, либо двухбайтовым в зависимости от используемой инструкции обращения к нему.
Во втором случае он объединяет однобайтовые порты `0x0002` и `0x0003`.
То есть,  порты похожи на байты памяти, только другое пространство номеров и другие инструкции доступа.

В старые добрые времена часто экономили номера портов.
Для этого ограничивали количество портов, через которые можно получить доступ к устройству.
И одни и те же порты отвечали за разные функции, в зависимости от обстоятельств.
Например, на чтение порт мог работать совсем не так, как на запись.
То есть, формат записываемых в порт данных мог отличаться от формата считываемых --- один и тот же бит имел разный смысл.

Другой подход состоял в мультиплексировании.
То есть, один порт использовался для выбора, что будут означать данные читаемые или записываемые в другой порт.
Так, с помощью всего двух портов, можно было эмулировать набор нескольких.
В микросхеме RTC применена разновидность этого подхода.
А именно, в самой микросхеме есть целый блок собственной памяти, часть которой выделена под её управляющие регистры:

- 10 байт под данные даты, времени и будильника.
- 4 байта под управляющие регистры микросхемы.
- Ещё [50 байт энергонезависимой памяти](https://wiki.osdev.org/CMOS), которые [BIOS](https://en.wikipedia.org/wiki/BIOS) использует под нужды не связанные с RTC.

Доступ к этому блоку внутренней памяти микросхемы RTC осуществляется всего через два однобайтовых порта.
Первым шагом в порт номер
[`kernel::time::rtc::ADDRESS_PORT = 0x0070`](../../doc/kernel/time/rtc/constant.ADDRESS_PORT.html)
записывается номер байта внутренней памяти микросхемы RTC.
Вторым шагом либо из порта номер
[`kernel::time::rtc::DATA_PORT = 0x0071`](../../doc/kernel/time/rtc/constant.DATA_PORT.html)
читается значение, которое находится в этом байте внутренней памяти микросхемы RTC.
Либо в этот порт записывается значение, которое нужно сохранить в память RTC.

Это делают функции
[`kernel::time::rtc::rtc_read()`](../../doc/kernel/time/rtc/fn.rtc_read.html):

```rust
fn rtc_read(address: u8) -> u8 {
    unsafe {
        io::outb(ADDRESS_PORT, address);
        io::inb(DATA_PORT)
    }
}
```

И
[`kernel::time::rtc::rtc_write()`](../../doc/kernel/time/rtc/fn.rtc_read.html):

```rust
fn rtc_write(address: u8, data: u8) {
    unsafe {
        io::outb(ADDRESS_PORT, address);
        io::outb(DATA_PORT, data);
    }
}
```

Для чтения и записи собственно в порты ввода--вывода они используют однобайтовые инструкции `INB` и `OUTB`,
обёрнутые в функции
[`x86::io::inb()`](../../doc/x86/io/fn.inb.html) и
[`x86::io::outb()`](../../doc/x86/io/fn.outb.html)
внешней библиотеки [`x86`](../../doc/x86/index.html).

Байты номер `0xA`, `0xB`, `0xC` и `0xD` в памяти микросхемы отведены под её
[регистры управления](https://en.wikipedia.org/wiki/Device_register).
Смысл их битов вынесен в соответствующие наборы флагов
[`kernel::time::rtc::RegisterA`](../../doc/kernel/time/rtc/struct.RegisterA.html),
[`kernel::time::rtc::RegisterB`](../../doc/kernel/time/rtc/struct.RegisterB.html),
[`kernel::time::rtc::RegisterC`](../../doc/kernel/time/rtc/struct.RegisterC.html) и
[`kernel::time::rtc::RegisterD`](../../doc/kernel/time/rtc/struct.RegisterD.html).


### Прерывания

[Прерывание](https://en.wikipedia.org/wiki/Interrupt) --- это событие, которое останавливает текущую активность
процессора и заставляет его переключиться на выполнение специального кода обработки возникшего прерывания.
Прерывания происходят:

- Либо асинхронно, в произвольный момент с точки зрения текущего исполняющегося кода. Обычно --- когда оборудование требует от процессора внимания.
- Либо синхронно, на фиксированной инструкции исполняющегося кода. Обычно, если возникла особая ситуация при выполнении текущего кода.
  - Это может быть ошибка в программе. Например, деление на ноль или [недопустимое обращение к памяти (Page Fault)](https://en.wikipedia.org/wiki/Page_fault).
  - А может быть предусмотренное действие. Например, чтобы из режима пользователя переключиться в режим ядра для выполнения [системного вызова](https://en.wikipedia.org/wiki/System_call), такого как чтение файла.

За настройки прерываний отвечает функция
[`kernel::interrupts::init()`](../../doc/kernel/interrupts/fn.init.html)
в файле [`kernel/src/interrupts.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/interrupts.rs).
Она инициализирует таблицу обработчиков прерываний
[`kernel::interrupts::IDT`](../../doc/kernel/interrupts/struct.IDT.html)
находящимися в том же файле функциями.
Для RTC выделен номер прерывания
[`kernel::interrupts::RTC`](../../doc/kernel/interrupts/constant.RTC.html),
а его обработчик --- функция
[`kernel::interrupts::rtc()`](../../doc/kernel/interrupts/fn.rtc.html).

Она помечена как [`extern "x86-interrupt"`](https://github.com/rust-lang/rust/issues/40180),
поэтому Rust знает что это обработчик прерывания.
То есть, --- код, который может запуститься в произвольный момент
времени и прервать исполняющийся в этот момент обычный код.
Поэтому компилятор сохраняет все нужные регистры на стек при входе в функцию
[`kernel::interrupts::rtc()`](../../doc/kernel/interrupts/fn.rtc.html).
Есть надежда, что он достаточно умён, и сохранит на стек только те регистры,
которые реально используются кодом обработчика прерываний.
А не вообще все регистры процессора, как сделали бы мы, если бы сохраняли регистры вручную.


### Инициализация микросхемы часов реального времени

Функция
[`kernel::time::rtc::init()`](../../doc/kernel/time/rtc/fn.init.html)
выполняет инициализацию микросхемы:

```rust
interrupts::without_interrupts(|| {
    defer! {
        rtc_read(!DISABLE_NMI | REGISTER_B);
    }

    old_settings = RegisterB::from_bits(rtc_read(DISABLE_NMI | REGISTER_B)).unwrap();
    new_settings =
        (old_settings & !RegisterB::DAYLIGHT_SAVING) | RegisterB::UPDATE_ENDED_INTERRUPT;
    rtc_write(DISABLE_NMI | REGISTER_B, new_settings.bits());
    acknowledged_settings = RegisterB::from_bits(rtc_read(DISABLE_NMI | REGISTER_B)).unwrap();

    SETTINGS.store(acknowledged_settings.bits(), Ordering::Relaxed);
});
```

То есть, она

- Выключает все [прерывания](https://en.wikipedia.org/wiki/Interrupt), в том числе [немаскируемые](https://en.wikipedia.org/wiki/Non-maskable_interrupt), на время конфигурирования микросхемы. Иначе она может остаться в [некоррекном состоянии](https://wiki.osdev.org/RTC#Avoiding_NMI_and_Other_Interrupts_While_Programming).
- Выключает переход на летнее время --- `!`[`RegisterB::DAYLIGHT_SAVING`](../../doc/kernel/time/rtc/struct.RegisterB.html#associatedconstant.DAYLIGHT_SAVING).
- Включает [прерывание](https://en.wikipedia.org/wiki/Interrupt), посылаемое процессору микросхемой после обновления показаний времени при тике, --- [`RegisterB::UPDATE_ENDED_INTERRUPT`](../../doc/kernel/time/rtc/struct.RegisterB.html#associatedconstant.UPDATE_ENDED_INTERRUPT).
- Остальные настройки оставляет без изменений.

Далее [`rtc::init()`](../../doc/kernel/time/rtc/fn.init.html):

- Сохраняет конфигурацию микросхемы в глобальной переменной [`kernel::time::rtc::SETTINGS`](../../doc/kernel/time/rtc/static.SETTINGS.html).
- Проверяет что микросхема подтвердила изменение конфигурации.
- Читает текущие показания времени из микросхемы.

```rust
SETTINGS.store(acknowledged_settings.bits(), Ordering::Relaxed);

if acknowledged_settings == new_settings {
    let rtc = SYSTEM_INFO.rtc();
    rtc.store_prev(CorrelationPoint::invalid(
        timestamp().unwrap_or(0) * TICKS_PER_SECOND,
    ));

    enable_next_interrupt();

    if is_time_valid() {
        info!(?acknowledged_settings, "RTC init");
    } else {
        error!("RTC reports low battery, its time and date values are incorrect");
    }
} else {
    // ...
}
```

Количество тиков в секунду ---
[`ku::time::rtc::TICKS_PER_SECOND`](../../doc/ku/time/rtc/constant.TICKS_PER_SECOND.html) ---
для RTC равно 1.
Про то, что такое
[`ku::info::SYSTEM_INFO`](../../doc/ku/info/static.SYSTEM_INFO.html) и
[`ku::time::correlation_point::CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html)
узнаем чуть позже.

Микросхема RTC выдаёт текущее время, разбитое на компоненты --- год, месяц, день, час, минута, секунда.
Оно переводится в
[секунды с момента начала Unix--эпохи](https://en.wikipedia.org/wiki/Unix_time)
функцией
[`kernel::time::rtc::timestamp()`](../../doc/kernel/time/rtc/fn.timestamp.html):

```rust
fn timestamp() -> Option<i64> {
    Date::read().map(|date| DateTime::<Utc>::from_utc(date.into(), Utc).timestamp())
}
```

В ней используется внешняя библиотека
[`chrono`](../../doc/chrono/index.html),
которая реализует работу со временем и календарём.

При этом код считает, что микросхема RTC хранит
[всемирное координированное время (Coordinated Universal Time, UTC)](https://en.wikipedia.org/wiki/Coordinated_Universal_Time).
Это так в тестах, которые запускают Nikka в эмуляторе [`qemu`](https://en.wikipedia.org/wiki/QEMU).
По умолчанию в [`qemu`](https://en.wikipedia.org/wiki/QEMU) используется UTC.

Функция [`enable_next_interrupt()`](../../doc/kernel/time/rtc/fn.enable_next_interrupt.html)
говорит микросхеме RTC, что процессор обработал
[прерывание](https://en.wikipedia.org/wiki/Interrupt) от неё.
Пока процессор этого не сделает, микросхема не пошлёт следующее прерывание,
считая что процессор ещё занят обработкой предыдущего.
То есть, если забыть это сделать, то "время остановится".
Такой сигнал оборудованию от процессора иногда называется
[end of interrupt (EOI)](https://en.wikipedia.org/wiki/End_of_interrupt).
Он встречается не только для RTC, но и для другого оборудования.
Например, контроллер прерываний можно сконфигурировать так,
чтобы он тоже ждал от процессора подтверждения каждого прерывания.
Посылать EOI соответствующему оборудованию нужно из каждого прерывания.
Мы также посылаем его один раз при инициализации микросхемы RTC ---
на всякий случай стоит перевести микросхему в определённое состояние.
Кроме того, возможно она уже успела послать прерывание до того как ядро инициализировало их обработку.
Тогда мы его потеряли, но должны разблокировать последующие.
В частном случае микросхемы RTC, отправка ей EOI и чтение её регистра статуса прерывания функцией
[`interrupt_status()`](../../doc/kernel/time/rtc/fn.interrupt_status.html), ---
это одно и то же действие:

```rust
fn enable_next_interrupt() {
    interrupt_status();
}
```


### Задача 1 --- чтение реального времени из микросхемы RTC

#### Неконсистентное чтение даты и времени из микросхемы RTC

Реализуйте статический [метод](../../doc/kernel/time/rtc/struct.Date.html#method.read_inconsistent)

```rust
fn Date::read_inconsistent() -> Date
```

в файле [`kernel/src/time/rtc.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/time/rtc.rs),
который считывает из микросхемы RTC показания даты и времени и возвращает их в виде
[структуры](../../doc/kernel/time/rtc/struct.Date.html)

```rust
#[derive(Clone, Copy, Default, Display, Eq, PartialEq)]
#[display(
    fmt = "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
    year,
    month,
    day,
    hour,
    minute,
    second
)]
struct Date {
    year: u16,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
}
```

Метод называется `...inconsistent()`, потому что может вернуть некорректное значение
[`Date`](../../doc/kernel/time/rtc/struct.Date.html),
если во время его работы произошёл тик RTC и микросхема конкурентно
обновляла содержимое соответствующих полей в своей памяти.

Реализуйте и используйте вспомогательный [метод](../../doc/kernel/time/rtc/fn.parse_value.html)

```rust
fn kernel::time::rtc::parse_value(
    x: u8,
    format: RegisterB,
) -> u8
```

Он переводит значение `x` из формата, в котором микросхема хранит время в двоичный.
Дело в том, что время может храниться как в обычном
[двоичном коде](https://en.wikipedia.org/wiki/Binary_number),
если в `format` установлен флаг
[`RegisterB::USE_BINARY_FORMAT`](../../doc/kernel/time/rtc/struct.RegisterB.html#associatedconstant.USE_BINARY_FORMAT).
Так и в [двоично--десятичном](https://en.wikipedia.org/wiki/Binary-coded_decimal), если этот флаг не установлен.

Реализуйте и используйте вспомогательный [метод](../../doc/kernel/time/rtc/fn.parse_hour.html)

```rust
fn kernel::time::rtc::parse_hour(
    hour: u8,
    format: RegisterB,
) -> u8
```

Он переводит значение текущего часа `hour` из формата, в котором микросхема хранит время в двоичный 24-часовой.
Кроме [двоично--десятичного](https://en.wikipedia.org/wiki/Binary-coded_decimal) варианта, тут возможен ещё и
[12-часовой формат](https://en.wikipedia.org/wiki/12-hour_clock).
Если в `format` установлен бит
[`RegisterB::USE_24_HOUR_FORMAT`](../../doc/kernel/time/rtc/struct.RegisterB.html#associatedconstant.USE_24_HOUR_FORMAT),
то формат времени [24-часовой](https://en.wikipedia.org/wiki/24-hour_clock).
Обратите внимание на
[путаницу в значениях 12am и 12pm](https://en.wikipedia.org/wiki/12-hour_clock#Confusion_at_noon_and_midnight)
для [12-часового формата](https://en.wikipedia.org/wiki/12-hour_clock).
Наш вариант --- "digital watches".
[Подробнее про формат времени в RTC](https://wiki.osdev.org/CMOS#Format_of_Bytes).

Вам могут пригодиться:

- Конфигурация микросхемы в глобальной переменной [`kernel::time::rtc::SETTINGS`](../../doc/kernel/time/rtc/static.SETTINGS.html). Из неё можно узнать формат в котором она хранит время.
- Функция [`kernel::time::rtc::rtc_read(address)`](../../doc/kernel/time/rtc/fn.rtc_read.html), которая читает из микросхемы один байт [`u8`](https://doc.rust-lang.org/nightly/core/primitive.u8.html), расположенный по адресу `address` в памяти микросхемы RTC. Адрес `address` не имеет отношения к основной памяти компьютера, он адресует внутреннюю память микросхемы RTC.
- [Таблица адресов памяти RTC](http://www.bioscentral.com/misc/cmosmap.htm) или её [подходящий фрагмент](https://wiki.osdev.org/CMOS#Getting_Current_Date_and_Time_from_RTC). Либо вы можете найти эту таблицу в первоисточнике --- [спецификации микросхемы Motorola MC146818](https://pdf1.alldatasheet.com/datasheet-pdf/view/122156/MOTOROLA/MC146818.html).
- Метод [`u16::from(u8)`](https://doc.rust-lang.org/nightly/core/primitive.u16.html#impl-From%3Cu8%3E-for-u16) для перевода значения типа [`u8`](https://doc.rust-lang.org/nightly/core/primitive.u8.html) в значение типа [`u16`](https://doc.rust-lang.org/nightly/core/primitive.u16.html).


> ##### [Путаница в значениях 12am и 12pm](https://en.wikipedia.org/wiki/12-hour_clock#Confusion_at_noon_and_midnight)
>
> Функция [`parse_hour()`](../../doc/kernel/time/rtc/fn.parse_hour.html)
> проверяется тестом `different_rtc_formats()` в файле
> [`kernel/tests/1-time-1-rtc.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/1-time-1-rtc.rs).
> Можно вручную убедиться, что тест
> [не путает 12am и 12pm](https://en.wikipedia.org/wiki/12-hour_clock#Confusion_at_noon_and_midnight),
> а также проверить что вы реализовали [12-ти часовой](https://en.wikipedia.org/wiki/12-hour_clock) формат правильно.
> Для этого включите 12-ти часовой формат в
> [`rtc::init()`](../../doc/kernel/time/rtc/fn.init.html)
> и установите время, например на `11:59:55 am`:
>
> ```rust
> interrupts::without_interrupts(|| {
>     // ...
>
>     new_settings =
>         (old_settings & !RegisterB::DAYLIGHT_SAVING & !RegisterB::USE_24_HOUR_FORMAT) |
>         RegisterB::UPDATE_ENDED_INTERRUPT;
>
>     rtc_write(DISABLE_NMI | REGISTER_B, (new_settings | RegisterB::SET_CLOCK).bits());
>
>     if new_settings.contains(RegisterB::USE_BINARY_FORMAT) {
>         rtc_write(4, 11);
>         rtc_write(2, 59);
>         rtc_write(0, 55);
>     } else {
>         rtc_write(4, 1 * 16 + 1);
>         rtc_write(2, 5 * 16 + 9);
>         rtc_write(0, 5 * 16 + 5);
>     }
>
>     rtc_write(DISABLE_NMI | REGISTER_B, new_settings.bits());
>     acknowledged_settings = RegisterB::from_bits(rtc_read(DISABLE_NMI | REGISTER_B)).unwrap();
>
>     // ...
> });
> ```
>
> После этого запустите
>
> ```console
> $ (cd kernel; cargo run)
> ```
>
> В логе время печатается в
> [24-часовом](https://en.wikipedia.org/wiki/24-hour_clock)
> формате, вне зависимости от настроек RTC.
> В нём вы увидите как `11:59:59` сменяется на `12:00:00`:
>
> ```console
> $ cat kernel/serial.out
> ...
> 11:59:59.985 0 D time_precision = 933.673 ns
> 11:59:59.989 0 D interrupt stats; number = 32; mnemonic = #TI; count = 85
> 11:59:59.993 0 D interrupt stats; number = 40; mnemonic = #RT; count = 4
> 12:00:00.001 0 D CPU frequency measured by PIT; frequency = 3.471 GHz
> 12:00:00.005 0 D CPU frequency measured by RTC; frequency = 3.437 GHz
> 12:00:00.009 0 D time_precision = 814.689 ns
> ...
> ```
>
> Если же установить время на `11:59:55 pm`, то в логе `23:59:59` сменяется на `00:00:00`:
>
> ```console
> $ cat kernel/serial.out
> ...
> 23:59:59.969 0 D time_precision = 1.375 us
> 23:59:59.973 0 D interrupt stats; number = 32; mnemonic = #TI; count = 84
> 23:59:59.979 0 D interrupt stats; number = 40; mnemonic = #RT; count = 4
> 00:00:00.001 0 D CPU frequency measured by PIT; frequency = 3.471 GHz
> 00:00:00.005 0 D CPU frequency measured by RTC; frequency = 3.428 GHz
> 00:00:00.009 0 D time_precision = 1.222 us
> ...
> ```
>
> При неверной реализации функции
> [`parse_hour()`](../../doc/kernel/time/rtc/fn.parse_hour.html)
> показания времени в логе после перехода через полдень или полночь будут вести себя гораздо интереснее.
>
> > В качестве дополнительного упражнения, посмотрите как 12-часовой формат реализован в Linux.


#### Консистентное чтение даты и времени из микросхемы RTC

Реализуйте статический [метод](../../doc/kernel/time/rtc/struct.Date.html#method.read)

```rust
fn Date::read() -> Option<Date>
```

Он
[пытается несколько раз прочитать данные из микросхемы RTC](https://wiki.osdev.org/CMOS#RTC_Update_In_Progress)
уже реализованным вами методом
[`Date::read_inconsistent()`](../../doc/kernel/time/rtc/struct.Date.html#method.read_inconsistent).
Перед каждым чтением он в цикле ждёт, пока в регистре `A` микросхемы RTC флаг
[`kernel::time::rtc::RegisterA::UPDATE_IN_PROGRESS`](../../doc/kernel/time/rtc/struct.RegisterA.html#associatedconstant.UPDATE_IN_PROGRESS)
установлен, то есть пока микросхема обновляет данные в своей памяти.

Если

- Два чтения подряд вернут одинаковое значение структуры [`Date`](../../doc/kernel/time/rtc/struct.Date.html).
- Перед чтениями флаг [`RegisterA::UPDATE_IN_PROGRESS`](../../doc/kernel/time/rtc/struct.RegisterA.html#associatedconstant.UPDATE_IN_PROGRESS) был сброшен.
- Предполагаем, что микросхема обновляет поля всегда в одном порядке.
- Чтение одного [`u8`](https://doc.rust-lang.org/nightly/core/primitive.u8.html) из её памяти атомарно.

То можно считать совпавшее значение структуры
[`Date`](../../doc/kernel/time/rtc/struct.Date.html)
консистентным и вернуть его,
[обернув](https://doc.rust-lang.ru/book/ch06-01-defining-an-enum.html#%D0%9F%D0%B5%D1%80%D0%B5%D1%87%D0%B8%D1%81%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5-option-%D0%B8-%D0%B5%D0%B3%D0%BE-%D0%BF%D1%80%D0%B5%D0%B8%D0%BC%D1%83%D1%89%D0%B5%D1%81%D1%82%D0%B2%D0%B0-%D0%BF%D0%B5%D1%80%D0%B5%D0%B4-null-%D0%B7%D0%BD%D0%B0%D1%87%D0%B5%D0%BD%D0%B8%D1%8F%D0%BC%D0%B8) в
[`core::option::Option::Some`](https://doc.rust-lang.org/nightly/core/option/enum.Option.html#variant.Some):

```rust
return Some(date);
```

Если же за несколько попыток прочитать дважды одинаковые значения
[`Date`](../../doc/kernel/time/rtc/struct.Date.html)
не получилось,
стоит сдаться и вернуть
[`core::option::Option::None`](https://doc.rust-lang.org/nightly/core/option/enum.Option.html#variant.None):

```rust
return None;
```


Вам могут пригодиться:

- Метод [`Date::default()`](../../doc/kernel/time/rtc/struct.Date.html#method.default), который возвращает [`Date`](../../doc/kernel/time/rtc/struct.Date.html), заполненную нулями. Что не соответствует разумной дате настоящего времени.
- Функция [`core::hint::spin_loop()`](https://doc.rust-lang.org/nightly/core/hint/fn.spin_loop.html), которая сообщает процессору, что он находится в цикле ожидания внешнего события. И может, например, снизить частоту и энергопотребление.
- Операторы равенства `==` и неравенства `!=` для [`Date`](../../doc/kernel/time/rtc/struct.Date.html).

В этом методе нужно писать код очень внимательно, так как он не покрывается тестами.
А использование в будущем лога с неконсистентной датой при отладке может привести к потере времени.

> Полные пути `core::option::Option::` можно не указывать, так как `Option`, `None`, `Some` и другие стандартные вещи
> импортируются по умолчанию прелюдией
> [`core::prelude`](https://doc.rust-lang.org/nightly/core/prelude/index.html).
> У нас [редакция 2021](https://doc.rust-lang.org/edition-guide/rust-2021/index.html),
> соответствующая прелюдия ---
> [`core::prelude::rust_2021`](https://doc.rust-lang.org/nightly/core/prelude/rust_2021/index.html).
> А она перекладывает основную работу на
> [`core::prelude::v1`](https://doc.rust-lang.org/nightly/core/prelude/v1/index.html),
> где и импортируются `Option`, `None`, `Some` и многое другое.
>
> Метод [`Date::default()`](../../doc/kernel/time/rtc/struct.Date.html#method.default) определён в
> [типаже](https://doc.rust-lang.ru/book/ch10-02-traits.html)
> [`core::default::Default`](https://doc.rust-lang.org/nightly/core/default/trait.Default.html#tymethod.default),
> который реализован для [`Date`](../../doc/kernel/time/rtc/struct.Date.html) автоматически за счёт атрибута
> [`derive`](https://doc.rust-lang.ru/book/appendix-03-derivable-traits.html) ---
> [`#[derive(Default)]`](https://doc.rust-lang.ru/book/appendix-03-derivable-traits.html#default-%D0%B4%D0%BB%D1%8F-%D0%B7%D0%BD%D0%B0%D1%87%D0%B5%D0%BD%D0%B8%D0%B9-%D0%BF%D0%BE-%D1%83%D0%BC%D0%BE%D0%BB%D1%87%D0%B0%D0%BD%D0%B8%D1%8E).
> Всю соответствующую работу выполняет макрос
> [`core::prelude::v1::derive`](https://doc.rust-lang.org/nightly/core/prelude/v1/macro.derive.html).
>
> Операторы равенства и неравенства для [`Date`](../../doc/kernel/time/rtc/struct.Date.html) определены в
> [типажах](https://doc.rust-lang.ru/book/ch10-02-traits.html)
> [`core::cmp::PartialEq`](https://doc.rust-lang.org/nightly/core/cmp/trait.PartialEq.html) и
> [`core::cmp::Eq`](https://doc.rust-lang.org/nightly/core/cmp/trait.Eq.html),
> которые реализованы для [`Date`](../../doc/kernel/time/rtc/struct.Date.html) автоматически за счёт атрибута
> [`#[derive(..., Eq, PartialEq)]`](https://doc.rust-lang.ru/book/appendix-03-derivable-traits.html#partialeq-%D0%B8-eq-%D0%B4%D0%BB%D1%8F-%D1%81%D1%80%D0%B0%D0%B2%D0%BD%D0%B5%D0%BD%D0%B8%D1%8F-%D1%80%D0%B0%D0%B2%D0%B5%D0%BD%D1%81%D1%82%D0%B2%D0%B0).
> Типаж [`core::cmp::PartialEq`](https://doc.rust-lang.org/nightly/core/cmp/trait.PartialEq.html) определяет методы
> [`PartialEq::eq()`](https://doc.rust-lang.org/nightly/core/cmp/trait.PartialEq.html#tymethod.eq) и
> [`PartialEq::ne()`](https://doc.rust-lang.org/nightly/core/cmp/trait.PartialEq.html#method.ne)
> для проверки на равенство или неравенство соответственно.
> Rust рассахаривает операторы `==` и `!=` в обращения к этим методам.
> А дополнительный типаж
> [`core::cmp::Eq`](https://doc.rust-lang.org/nightly/core/cmp/trait.Eq.html)
> сигнализирует, что операции `PartialEq` для
> [`Date`](../../doc/kernel/time/rtc/struct.Date.html) задают
> [отношение эквивалентности](https://en.wikipedia.org/wiki/Equivalence_relation), то есть
> [рефлексивное](https://en.wikipedia.org/wiki/Reflexive_relation),
> [симметричное](https://en.wikipedia.org/wiki/Symmetric_relation) и
> [транзитивное](https://en.wikipedia.org/wiki/Transitive_relation).


### Запуск тестов

Тесты можно запустить командой `cargo test --test 1-time-1-rtc` в директории `kernel` репозитория.
Вы увидите сборку, запуск эмулятора [`qemu`](https://en.wikipedia.org/wiki/QEMU), логи инициализации ядра и логи тестов:

```console
$ (cd kernel; cargo test --test 1-time-1-rtc)
...
Running: `qemu-system-x86_64 -drive format=raw,file=/home/sergey/shad-os/target/kernel/debug/deps/bootimage-time-8696ef78d2ec023a.bin -no-reboot -m size=50M -smp cpus=4 -device isa-debug-exit,iobase=0xF4,iosize=0x04 -serial stdio -display none`
00:00:00 0 I RTC init; acknowledged_settings = USE_24_HOUR_FORMAT | USE_BINARY_FORMAT | UPDATE_ENDED_INTERRUPT
00:00:00 0 I time init
00:00:00 0 I Nikka booted; now = 1970-01-01 00:00:00 UTC; tsc = Tsc(5345850832)
00:00:00 0 I GDT init
00:00:00 0 I interrupts init
running 4 tests

time::rtc_read_inconsistent---------------------------------
00:00:00 0 D start = 1970-01-01 00:00:00 UTC
panicked at 'the RTC date does not pass the sanity check', kernel/tests/time.rs:43:5
--------------------------------------------------- [failed]
00:00:00 0 I exit qemu; exit_code = FAILURE
error: test failed, to rerun pass '--test time'
```

Если запустить тест из корня репозитория, то вы столкнётесь ошибкой:

```console
error: language item required, but not found: `eh_personality`
  |
  = note: this can occur when a binary crate with `#![no_std]` is compiled for a target where `eh_personality` is defined in the standard library
  = help: you may be able to compile for a target that doesn't need `eh_personality`, specify a target with `--target` or in `.cargo/config`
```

Это ожидаемо, запускайте тест из директории `kernel`.

До решения задачи тест `fn rtc_read_inconsistent()` из файла
[`kernel/tests/time.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/time.rs)
падает:

```console
time::rtc_read_inconsistent---------------------------------
00:00:00 0 D start = 1970-01-01 00:00:00 UTC
panicked at 'the RTC date does not pass the sanity check', kernel/tests/time.rs:43:5
--------------------------------------------------- [failed]
```

А после выполнения задачи он должен проходить:

```console
$ (cd kernel; cargo test --test 1-time-1-rtc)
...
time::rtc_read_inconsistent---------------------------------
10:25:26 0 D start = 2022-09-17 10:25:26 UTC
10:25:27 0 D now = 2022-09-17 10:25:27 UTC
10:25:28 0 D now = 2022-09-17 10:25:28 UTC
10:25:29 0 D now = 2022-09-17 10:25:29 UTC
10:25:30 0 D now = 2022-09-17 10:25:30 UTC
10:25:31 0 D now = 2022-09-17 10:25:31 UTC
10:25:32 0 D now = 2022-09-17 10:25:32 UTC
10:25:33 0 D now = 2022-09-17 10:25:33 UTC
10:25:34 0 D now = 2022-09-17 10:25:34 UTC
10:25:35 0 D now = 2022-09-17 10:25:35 UTC
time::rtc_read_inconsistent------------------------ [passed]
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/time/rtc.rs |   65 ++++++++++++++++++++++++++++++++++++++++++++-----
 1 file changed, 59 insertions(+), 6 deletions(-)
```
