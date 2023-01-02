## Собирая всё вместе

В файле [`kernel/src/main.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/main.rs) определена функция `kernel_main()`.
Вы можете использовать её по своему усмотрению, например проверяя какую-нибудь функциональность.

Например:

```rust
fn kernel_main(boot_info: &'static BootInfo) -> ! {
    kernel::init_subsystems(boot_info, Subsystems::empty());

    while INTERRUPT_STATS[RTC].count() < 10 {
        if let Some(frequency) = Pit::tsc_per_second() {
            debug!(%frequency, "CPU frequency measured by PIT");
        }

        if let Some(frequency) = Rtc::tsc_per_second() {
            debug!(%frequency, "CPU frequency measured by RTC");
        }

        debug!(time_precision = %time::timer().lap());

        for (number, stats) in INTERRUPT_STATS.iter().enumerate() {
            let count = stats.count();
            if count != 0 {
                let mnemonic = stats.mnemonic();
                debug!(number, %mnemonic, count, "interrupt stats");
            }
        }

        x86_64::instructions::hlt();
    }

    kernel::exit_qemu(ExitCode::SUCCESS);
}
```

Сначала выполняется инициализация системы функцией
[`kernel::init()`](../../doc/kernel/fn.init.html)
из файла [`kernel/src/lib.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/lib.rs).
А затем мы в цикле выводим в лог статистику счётчиков прерываний и
вычисленную с помощью RTC и PIT частоту процессора.
Инструкция
[`HLT`](https://www.felixcloutier.com/x86/hlt),
которую мы используем через функцию
[`x86_64::instructions::hlt()`](../../doc/x86_64/instructions/fn.hlt.html),
выключает процессор до прихода следующего прерывания.
Реализация PIT устроена также, как и изученная вами реализация RTC.
Только он настроен тикать 20 раз в секунду и не привязан к реальному времени.

Запускаем:

```console
$ make run
```

или

```console
$ (cd kernel; cargo run)
```

В файле `kernel/serial.out` появляется лог, время должно соответствовать команде `date -u`:
```console
14:58:18 0 I RTC init; acknowledged_settings = USE_24_HOUR_FORMAT | USE_BINARY_FORMAT | UPDATE_ENDED_INTERRUPT
14:58:18 0 I time init
14:58:18 0 I Nikka booted; now = 2022-09-17 14:58:18 UTC; tsc = Tsc(5139186658)
14:58:18 0 I GDT init
14:58:18 0 I interrupts init
```
Видно, что RTC инициализировался, и выдаёт разумное время --- `now = 2022-09-17 14:58:18 UTC`.
А время в логе пока имеет разрешение в секунду.
Дальше запускается наш цикл сбора статистик прерываний.
На первой итерации их ещё нет и он печатает только одну строку:
```console
14:58:18 0 D time_precision = 61.005 ktsc
```
Так как мы пока не откалибровали частоту процессора, в ней точность времени указана в тысячах его тиков --- `ktsc`.
Потом тикает PIT:
```console
14:58:18 0 D CPU frequency measured by PIT; frequency = 3.434 GHz
14:58:18 0 D time_precision = 2.572 ktsc
14:58:18 0 D interrupt stats; number = 32; mnemonic = #TI; count = 1
```
Он сразу готов оценить частоту процессора, так как при инициализации в его
[`CorrelationInterval::base`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#structfield.base)
записывается валидное значение с
[`CorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.count)
равным нулю.
Ждём дальше.
PIT тикает уже 9 раз, и в первый раз тикает RTC.
Текущее время в логе увеличивается на 1 секунду:
```console
14:58:19 0 D time_precision = 2.871 ktsc
14:58:19 0 D interrupt stats; number = 32; mnemonic = #TI; count = 9
14:58:19 0 D interrupt stats; number = 40; mnemonic = #RT; count = 1
14:58:19 0 D CPU frequency measured by PIT; frequency = 3.773 GHz
```

RTC тикает во второй раз, и на основе его показаний уже можно оценить частоту процессора.
Также увеличивается разрешение системного времени в лог--записях:
```
14:58:20.001 0 D CPU frequency measured by PIT; frequency = 3.557 GHz
14:58:20.005 0 D CPU frequency measured by RTC; frequency = 3.424 GHz
14:58:20.009 0 D time_precision = 881.745 ns
14:58:20.016 0 D interrupt stats; number = 32; mnemonic = #TI; count = 28
14:58:20.020 0 D interrupt stats; number = 40; mnemonic = #RT; count = 2
```
А вычисление интервалов времени начинает опираться на секунды --- `time_precision = 881.745 ns`.
То есть, между последовательными обращениями к `RDTSC` проходит около 881 наносекунд.
Такая низкая точность объясняется дебажной сборкой.

Если же собрать релизную, то получим более разумную цифру:

```console
$ (cd kernel; cargo run --release)
...
15:08:31.792 0 D time_precision = 93.029 ns
```

Правда, она всё ещё далека от идеала.
Это связано с запуском под эмулятором.
Если запустить Nikka на железе, то получаем прерно 30--80 тактов, или около 10-20 наносекунд:
![](1-time-7-time-precision.png)


> ### Больше информации про время в компьютерных системах
>
> Если вас заинтересовала тема отслеживания времени в компьютерных системах,
> вы можете посмотреть небольшой отрывок с
> [семинара из курса распределённых систем](https://lk.yandexdataschool.ru/courses/2021-autumn/7.946-raspredelennye-sistemy/classes/7879/).
> В [видеозаписи](https://disk.yandex.ru/i/MwH4kiQ_p4XCsA) он начинается с 44:44.
> Там, в частности рассказано:
>
>   - Что такое високосные секунды.
>   - Оказывается, есть несколько стандартов текущего времени. И некоторые из них зависят, например, от приливов.
>   - Как устроено отслеживание точного времени на Земле.
>   - Про несколько серьёзных компьютерных сбоев, связанных с неаккуратной работой со временем в программах. Например, про [сбой в Cloudflare](https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/) из-за использования немонотонных часов при измерении интервала времени.
>
> Дополнительные ссылки про системы отслеживания времени:
>
> - [Как устроены атомные часы](https://habr.com/ru/post/677064/) --- самый точный доступный источник времени.
> - [Грядущая отмена високосных секунд](https://www.nature.com/articles/d41586-022-03783-5).
> - [История часов](https://en.wikipedia.org/wiki/History_of_timekeeping_devices).
