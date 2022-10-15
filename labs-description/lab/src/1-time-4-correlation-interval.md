## Измерение частоты процессора и повышение разрешения часов

Структура
[`ku::time::correlation_interval::CorrelationInterval`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html)
из файла [`ku/src/time/correlation_interval.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/time/correlation_interval.rs)
предназначена для соотнесения частоты процессора и другого источника времени.
Она содержит поля:

- [`CorrelationInterval::base`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#structfield.base) со знакомым нам [`CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html) в некоторый базовый момент времени, когда тикнули отслеживаемые [`CorrelationInterval`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html) часы.
- [`CorrelationInterval::prev`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#structfield.prev) с [`CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html) на момент последнего тика отслеживаемых часов.

[`CorrelationInterval::base`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#structfield.base) и
[`CorrelationInterval::prev`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#structfield.prev)
содержат количество тиков отслеживаемых часов и номер такта процессора тактов в соответствующие моменты времени.
Частота отслеживаемых часов задаётся как константный параметр `TICKS_PER_SECOND` для типа
[`struct CorrelationInterval<const TICKS_PER_SECOND: i64>`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html).

По этой информации можно:

- Вычислить частоту процессора с точки зрения отслеживаемых часов.
- Пересчитать произвольное значение счётчика тактов процессора [`ku::time::tsc::Tsc`](../../doc/ku/time/tsc/struct.Tsc.html) в показания времени отслеживаемых часов. При этом мы фактически повышаем разрешение отслеживаемых часов до частоты процессора. Разумеется, погрешность при этом превышает разрешение.

Для часов реального времени
[`ku::time::rtc::Rtc`](../../doc/ku/time/rtc/struct.Rtc.html),
количество тиков в каждом поле
[`CorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.count)
содержит количество секунд с начала Unix--эпохи.
Методы
[`CorrelationInterval`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html)
будут опираться на это при привязке своих
[`CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html)
к реальному времени.

Структура
[`ku::time::correlation_interval::AtomicCorrelationInterval`](../../doc/ku/time/correlation_interval/struct.AtomicCorrelationInterval.html)
содержит аналогичные два поля типа
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html).
Она находится в таких же отношениях с
[`CorrelationInterval`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html),
как
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
с
[`CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html).
То есть,
[`CorrelationInterval`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html)
является значением, а
[`AtomicCorrelationInterval`](../../doc/ku/time/correlation_interval/struct.AtomicCorrelationInterval.html)
его конкурентным хранилищем в памяти.

> Подумайте, почему при этом
> [`AtomicCorrelationInterval`](../../doc/ku/time/correlation_interval/struct.AtomicCorrelationInterval.html)
> устроен гораздо проще чем
> [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
> с его [sequence lock](https://en.wikipedia.org/wiki/Seqlock).

Основной [метод](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#method.datetime)

```rust
fn CorrelationInterval::datetime<const PARTS_PER_SECOND: i64>(
    atomic_correlation_interval: &AtomicCorrelationInterval<TICKS_PER_SECOND>,
    tsc: Tsc,
) -> DateTime<Utc>
```

должен для часов, к которым привязан `atomic_correlation_interval`, выдать время, соответствующее
такту процессора, записанному в `tsc`.
Время он возвращает в типе
[`chrono::DateTime`](../../doc/chrono/struct.DateTime.html).
Он считает, что заданные ему часы показывают количество секунд, прошедших с начала Unix--эпохи в UTC ---
[`chrono::offset::Utc`](../../doc/chrono/offset/struct.Utc.html).

Функции
[`ku::time::datetime()`](../../doc/ku/time/fn.datetime.html)
[`ku::time::datetime_ms()`](../../doc/ku/time/fn.datetime_ms.html)
используя этот метод повышают разрешение часов реального времени
[`ku::time::rtc::Rtc`](../../doc/ku/time/rtc/struct.Rtc.html):

```rust
pub fn datetime(tsc: Tsc) -> DateTime<Utc> {
    Rtc::datetime::<NSECS_PER_SEC>(tsc)
}

pub fn datetime_ms(tsc: Tsc) -> DateTime<Utc> {
    Rtc::datetime::<MSECS_PER_SEC>(tsc)
}

const MSECS_PER_SEC: i64 = 1_000;
const NSECS_PER_SEC: i64 = 1_000_000_000;
```

Метод
[`CorrelationInterval::datetime()`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#method.datetime)
читает переданный ему на вход `atomic_correlation_interval`, проверяет что в результирующем
[`CorrelationInterval`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html)
оба поля ---
[`CorrelationInterval::base`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#structfield.base) и
[`CorrelationInterval::prev`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#structfield.prev) ---
валидны и задают разные тики базовых часов.
Если это так, он перекладывает основную работу на вспомогательный
[метод](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#method.datetime_with_resolution)

```rust
fn CorrelationInterval::datetime_with_resolution<const PARTS_PER_SECOND: i64>(
    &self,
    tsc: Tsc,
) -> NaiveDateTime
```

В тех редких случаях, когда в `atomic_correlation_interval` ещё не прошло два тика часов, метод
[`CorrelationInterval::datetime()`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#method.datetime)
возвращает момент времени
[`CorrelationInterval::prev`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#structfield.prev)
в виде
[`DateTime`](../../doc/chrono/struct.DateTime.html).
Мы заметим это на старте системы по низкому --- секундному --- разрешению в записях лога.


### Задача 3 --- реализация основного метода повышения разрешения часов

Для этой задачи понадобится готовое решение [задачи 1](../../lab/book/1-time-1-rtc.html#%D0%97%D0%B0%D0%B4%D0%B0%D1%87%D0%B0-1--%D1%87%D1%82%D0%B5%D0%BD%D0%B8%D0%B5-%D1%80%D0%B5%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B3%D0%BE-%D0%B2%D1%80%D0%B5%D0%BC%D0%B5%D0%BD%D0%B8-%D0%B8%D0%B7-%D0%BC%D0%B8%D0%BA%D1%80%D0%BE%D1%81%D1%85%D0%B5%D0%BC%D1%8B-rtc).

Реализуйте метод
[`fn CorrelationInterval::datetime_with_resolution()`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#method.datetime_with_resolution).

- Считайте, что `self.base.count()` и `self.prev.count()` задают разные секунды с начала Unix--эпохи.
- Необходимо вернуть реальное время, которое соответствует тику номер `tsc.get()` процессора. Он может быть как больше `self.prev.tsc()`, так и меньше `self.base.tsc()`, а может лежать где-то между ними. Чтобы все эти варианты можно было поддержать, тики процессора хранятся в знаковом типе [`i64`](https://doc.rust-lang.org/nightly/core/primitive.i64.html).
- Результат возвращается в типе [`chrono::naive::NaiveDateTime`](../../doc/chrono/naive/struct.NaiveDateTime.html), который не содержит данных о часовом поясе. Идентификатор часового пояса добавит вызывающая функция.
- Запрошенное разрешение `PARTS_PER_SECOND` задаётся в единицах в секунду, например для миллисекунд `PARTS_PER_SECOND = 1_000`. Оно не будет выше наносекунд --- `PARTS_PER_SECOND = 1_000_000_000`, --- которые поддерживает [`NaiveDateTime`](../../doc/chrono/naive/struct.NaiveDateTime.html).
- [Високосные секунды](https://en.wikipedia.org/wiki/Leap_second) не поддерживаем.


#### Зависание при логировании

Если попробовать добавить логирование в метод
[`CorrelationInterval::datetime_with_resolution()`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#method.datetime_with_resolution),
то код зависнет.
Логирование само использует
[`CorrelationInterval::datetime_with_resolution()`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#method.datetime_with_resolution),
поэтому можно было бы ожидать, что возникнет бесконечная рекурсия:
- `debug!()` или другой макрос логирования вызывает `datetime_with_resolution()`.
- Который вызывает `debug!()` или другой макрос логирования.
- Который вызывает `datetime_with_resolution()`.
- ...
- В конце-концов произошло бы исчерпание стека и падение ядра по Page Fault.

Бесконечной рекурсии не происходит из-за дополнительной блокировки в логировании --- поле
[`kernel::log::LogCollector::log`](../../doc/kernel/log/struct.LogCollector.html#structfield.log)
имеет тип
[`spin::Mutex`](../../doc/spin/type.Mutex.html)`<`[`kernel::log::Log`](../../doc/kernel/log/struct.Log.html)`>`.
Основное предназначение этой блокировки ---
предотвратить перемешивание кусков сообщений от разных процессоров в системе.

А вот бесконечную рекурсию она переводит во [взаимоблокировку](https://en.wikipedia.org/wiki/Deadlock).
Когда происходит вызов логирования, блокировка захватывается.
С захваченной блокировкой происходит вызов
[`CorrelationInterval::datetime_with_resolution()`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#method.datetime_with_resolution).
Если он сам вызывает логирование, то происходит попытка рекурсивного захвата уже захваченной блокировки.
Она не поддерживает рекурсивный захват, поэтому происходит
[взаимоблокировка](https://en.wikipedia.org/wiki/Deadlock),
которая и проявляется как зависание.
Факт [взаимоблокировки](https://en.wikipedia.org/wiki/Deadlock),
какую конкретно блокировку и какая строка кода пытается захватить,
легко узнать из `(gdb) backtrace`, прервав зависший код из `gdb` комбинацией `<Ctrl-C>`:

```
...
0x000000000000fff0 in ?? ()
(gdb) continue
Continuing.
^C
Thread 1 received signal SIGINT, Interrupt.
0x00000000002ecd9c in core::sync::atomic::atomic_load<u8> (dst=0x320b40 <kernel::log::LOG_COLLECTOR+8>, order=core::sync::atomic::Ordering::Relaxed) at src/sync/atomic.rs:2960
2960	        match order {
(gdb) backtrace
#0  0x00000000002ecd9c in core::sync::atomic::atomic_load<u8> (dst=0x320b40 <kernel::log::LOG_COLLECTOR+8>, 
    order=core::sync::atomic::Ordering::Relaxed) at src/sync/atomic.rs:2960
#1  0x000000000022a11f in core::sync::atomic::AtomicBool::load (self=0x320b40 <kernel::log::LOG_COLLECTOR+8>, 
    order=core::sync::atomic::Ordering::Relaxed)
    at /home/sergey/.rustup/toolchains/nightly-2022-08-30-x86_64-unknown-linux-gnu/lib/rustlib/src/rust/library/core/src/sync/atomic.rs:456
#2  0x000000000025d49f in spin::mutex::spin::SpinMutex<kernel::log::Log, spin::relax::Spin>::is_locked<kernel::log::Log, spin::relax::Spin> (self=0x320b40 <kernel::log::LOG_COLLECTOR+8>)
    at /home/sergey/.cargo/registry/src/github.com-1ecc6299db9ec823/spin-0.9.4/src/mutex/spin.rs:192
#3  spin::mutex::spin::SpinMutex<kernel::log::Log, spin::relax::Spin>::lock<kernel::log::Log, spin::relax::Spin> (
    self=0x320b40 <kernel::log::LOG_COLLECTOR+8>)
    at /home/sergey/.cargo/registry/src/github.com-1ecc6299db9ec823/spin-0.9.4/src/mutex/spin.rs:171
#4  spin::mutex::Mutex<kernel::log::Log, spin::relax::Spin>::lock<kernel::log::Log, spin::relax::Spin> (
    self=0x320b40 <kernel::log::LOG_COLLECTOR+8>)
    at /home/sergey/.cargo/registry/src/github.com-1ecc6299db9ec823/spin-0.9.4/src/mutex.rs:170
#5  kernel::log::{impl#4}::event (self=0x320b38 <kernel::log::LOG_COLLECTOR>, event=0x10000200c10)
    at kernel/src/log.rs:241
...
#11 0x00000000002b85a2 in ku::time::correlation_interval::CorrelationInterval<1>::datetime_with_resolution<1, 1000> (
    self=0x10000200fa8, tsc=...) at ku/src/time/correlation_interval.rs:61
#12 0x00000000002b8059 in ku::time::correlation_interval::CorrelationInterval<1>::datetime<1, 1000> (
    atomic_correlation_interval=0x344030 <kernel::SYSTEM_INFO+48>, tsc=...) at ku/src/time/correlation_interval.rs:46
#13 0x00000000002b4d08 in ku::time::rtc::Rtc::datetime<1000> (tsc=...) at ku/src/time/rtc.rs:22
#14 0x00000000002b4656 in ku::time::datetime_ms (tsc=...) at ku/src/time/mod.rs:49
#15 0x000000000025cb47 in kernel::log::Log::log_metadata (self=0x320b41 <kernel::log::LOG_COLLECTOR+9>, 
    level=0x30c030 <kernel::kernel_main::CALLSITE::META+32>, metadata=...) at kernel/src/log.rs:144
#16 0x000000000025cabe in kernel::log::Log::log_event (self=0x320b41 <kernel::log::LOG_COLLECTOR+9>, 
    event=0x100002012b0, tsc=...) at kernel/src/log.rs:133
#17 0x000000000025d512 in kernel::log::{impl#4}::event (self=0x320b38 <kernel::log::LOG_COLLECTOR>, 
    event=0x100002012b0) at kernel/src/log.rs:241
...
```

Фрейм `#2` сообщает нам, что код крутится в `SpinMutex<kernel::log::Log>`, принадлежащей
[`kernel::log::LOG_COLLECTOR`](../../doc/kernel/log/static.LOG_COLLECTOR.html):
```
#2  0x000000000025d49f in spin::mutex::spin::SpinMutex<kernel::log::Log, spin::relax::Spin>::is_locked<kernel::log::Log, spin::relax::Spin> (self=0x320b40 <kernel::log::LOG_COLLECTOR+8>)
```
Фрейм `#5` сообщает где вызывается повторный захват блокировки --- в строке `kernel/src/log.rs:241` метода `event()`:
```
#5  kernel::log::{impl#4}::event (self=0x320b38 <kernel::log::LOG_COLLECTOR>, event=0x10000200c10)
    at kernel/src/log.rs:241
```
А по фрейму `#17` видно, что блокировка уже была захвачена той же строкой кода:
```
#17 0x000000000025d512 in kernel::log::{impl#4}::event (self=0x320b38 <kernel::log::LOG_COLLECTOR>, 
    event=0x100002012b0) at kernel/src/log.rs:241
```

Отладить метод
[`fn CorrelationInterval::datetime_with_resolution()`](../../doc/ku/time/correlation_interval/struct.CorrelationInterval.html#method.datetime_with_resolution).
с помощью логирования можно разорвав бесконечную рекурсию.
Например, не вызывая функции времени из логирования.
Для этого служит формат
[`kernel::log::Format::Timeless`](../../doc/kernel/log/enum.Format.html#variant.Timeless).
Чтобы воспользоваться им, измените строку инициализации
[`kernel::log::LOG_COLLECTOR`](../../doc/kernel/log/static.LOG_COLLECTOR.html)
в конце файла
[`kernel/src/log.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/log.rs):

```rust
static LOG_COLLECTOR: LogCollector = LogCollector::new(Format::Timeless, Level::DEBUG);
```

Также иногда можно убирать
[`Mutex`](../../doc/spin/type.Mutex.html)
из поля
[`kernel::log::LogCollector::log`](../../doc/kernel/log/struct.LogCollector.html#structfield.log).
Если на нём возникает [взаимоблокировка](https://en.wikipedia.org/wiki/Deadlock).
А перемешивание записей логов не мешает отладке или вообще не возникает при использования только одного процессора.


### Запуск тестов

Тесты можно запустить командой `cargo test --test 1-time-3-high-resolution-date` в директории `kernel` репозитория.

После выполнения задачи должен проходить тест `high_resolution_date()`
в файле
[`kernel/tests/time.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/time.rs):

```console
$ (cd kernel; cargo test --test 1-time-3-high-resolution-date)
...
time::high_resolution_date----------------------------------
10:39:50.562 0 D waiting for the RTC to tick twice
10:39:52.001 0 D measuring; timer_ticks = 102
10:39:57.015 0 D measured; samples = 100; min = PT0.049911511S; max = PT0.050046701S; mean = PT0.049999155S; deviation = PT0.000020516S
10:39:57.024 0 D restrictions; min_delta = PT0.040S; max_delta = PT0.060S; min_mean = PT0.049500S; max_mean = PT0.050500S; min_deviation = PT0.000000100S; max_deviation = PT0.005S
time::high_resolution_date------------------------- [passed]
```

### Ориентировочный объём работ этой части лабораторки

```console
 ku/src/time/correlation_interval.rs |   26 ++++++++++++++++++++++++--
 1 file changed, 24 insertions(+), 2 deletions(-)
```
