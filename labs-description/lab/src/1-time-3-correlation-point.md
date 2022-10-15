## Счётчики тиков различных источников времени

Структура
[`ku::time::correlation_point::CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html)
из файла [`ku/src/time/correlation_point.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/time/correlation_point.rs)
предназначена для привязки тактов процессора к другим часам в один момент времени.
Она содержит поля:

- [`CorrelationPoint::tsc`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.tsc) со значением счётчика тактов процессора.
- [`CorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.count) со значением счётчика тиков другого источника времени в тот же момент.

Если значение
[`CorrelationPoint::tsc`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.tsc)
равно нулю, то структура в целом считается невалидной ---
[`CorrelationPoint::invalid()`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#method.invalid).
Это означает, что
[`CorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.count)
не привязан ни к какому значению
[`CorrelationPoint::tsc`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.tsc).
И значение структуры относится не к самому тику, а к промежутку после тика
[`CorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.count)
и до следующего.
При этом значение
[`CorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.count)
может быть использовано как текущее время с низким разрешением --- частотой соответствующих часов.

Посмотрите код реализации структуры
[`ku::time::correlation_point::CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html),
он достаточно прост.

Более интересная структура
[`ku::time::correlation_point::AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
из файла [`ku/src/time/correlation_point.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/time/correlation_point.rs) предназначена для конкурентного доступа к значениям
[`CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html).
То есть [`CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html) и
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
соотносятся также как примитивный тип
[`i64`](https://doc.rust-lang.org/nightly/core/primitive.i64.html)
и атомарный
[`core::sync::atomic::AtomicI64`](https://doc.rust-lang.org/nightly/core/sync/atomic/struct.AtomicI64.html).

Атомарность нужна для того, чтобы конкурентно

- в обработчике прерывания обновлять счётчики [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html);
- а в обычном коде читать эти счётчики, чтобы "посмотреть на часы".

В [`CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html) два числа типа
[`i64`](https://doc.rust-lang.org/nightly/core/primitive.i64.html),
а в
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html) два соответствующих им
[`AtomicI64`](https://doc.rust-lang.org/nightly/core/sync/atomic/struct.AtomicI64.html).
Нам нужно читать и записывать эти два значения согласованно, поэтому и возникают небольшие сложности.

Можно было бы завести блокировку на доступ к полям
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html),
но это потребовало бы захватывать её из прерывания.
Это практически гарантированно приведёт к проблемам:

- Захват этой блокировки должен ещё и запрещать прерывания. Иначе возможна [взаимоблокировка](https://en.wikipedia.org/wiki/Deadlock), подумайте почему. А Nikka предпочитает не отключать прерывания на потенциально длительное время удержания какой-нибудь блокировки.
- Иногда прерывание будет ждать другой код, пока он не отпустит эту блокировку. Обычно прерывания являются более приоритетной деятельностью, поэтому возникнет нежелательная [инверсия приоритетов](https://en.wikipedia.org/wiki/Priority_inversion).
- Писать мы хотим из прерывания в режиме ядра, а читать --- из режима пользователя. При этом с одной стороны, ядро должно обеспечить консистентность чтения коду пользователя. А с другой --- оно не должно допустить чтобы злонамеренный код из пользовательского режима мог заблокировать ядро, в том числе навечно.

Вообще, захват блокировок из прерываний --- очень плохая идея.

Поэтому реализуем
[неблокирующую синхронизацию](https://en.wikipedia.org/wiki/Non-blocking_algorithm)
для согласованного доступа к полям
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html).
Которая будет отдавать предпочтение писателю, так как это обработчик прерывания в ядре, ---
он всегда сможет завершить работу по обновлению структуры за фиксированное и достаточно небольшое количество тактов.
И никогда не будет ждать читателей, которые могут быть запущены как в режиме ядра, так и в режиме пользователя.
А вот читатели будут максимально пессимизированы ---
они будут вынуждены ждать пока писатель завершит свою работу, если им не повезло запуститься конкурентно с писателем.
Впрочем, для них это не будет страшно, так как:

- Писатель запускается редко, один раз в секунду для микросхемы RTC. Или двадцать раз в секунду для микросхемы PIT [Intel 8253/8254](https://en.wikipedia.org/wiki/Intel_8253) --- это сконфигурированная в Nikka частота, её можно поменять. Эти два писателя пишут в разные экземпляры структуры, поэтому они никогда не конфликтуют между собой.
- Писатель отрабатывает очень быстро, всего за несколько инструкций процессора.

В качестве инструмента такой неблокирующей синхронизации предлагается использовать упрощённый
[sequence lock](https://en.wikipedia.org/wiki/Seqlock).
В нашем случае его идея в следующем.
Мы храним в поле
[`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number)
удвоенный номер операции обновления.
А в его младшем бите хранится признак, что сейчас структура
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
находится в неконсистентном состоянии из-за текущей активности писателя.
То есть:

- Нечётное значение в [`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number) означает, что писатель начал обновлять структуру [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html), но ещё не закончил. Если читатель обнаруживает структуру в таком состоянии, он должен подождать пока писатель закончит обновление.
- Чётное значение в [`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number) означает, что значение структуры [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html) консистентно и читатель может его использовать.

В нашем случае писатель один, что дополнительно упрощает дело.
Алгоритм его действий:
- Раз он один, значит до начала им обновления структуры [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html), её значение заведомо консистентно. А [`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number) содержит чётное число.
- Писатель атомарно инкрементирует поле [`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number). Оно становится нечётным, символизируя что идёт обновление.
- После этого писатель заполняет поля [`AtomicCorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.count) и [`AtomicCorrelationPoint::tsc`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.tsc).
- Последним действием писатель атомарно инкрементирует поле [`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number). Это действие сигнализирует всем читателям, что обновление завершено и структура находится в консистентном состоянии.

Алгоритм действий читателя чуть сложнее:

- Читатель атомарно загружает значения поля [`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number).
- Далее он читает значение полей [`AtomicCorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.count) и [`AtomicCorrelationPoint::tsc`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.tsc).
- После чего он повторно атомарно загружает значение поля [`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number).
- Если при обеих загрузках значения поля [`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number) совпадают и являются чётными, то структура [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html) была прочитана в консистентном состоянии. Читатель возвращает значение получившейся структуры [`CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html) в вызывающую функцию.
- Если же это не так, читатель повторяет все действия с самого начала.

Перекос сложности в сторону читателя и наличие в нём цикла ожидания, чего нет в писателе, ---
проявление большего приоритета писателя.

> Обобщённая реализация [sequence lock](https://en.wikipedia.org/wiki/Seqlock)
> с несколькими писателями и произвольной защищаемой структурой данных была бы сложнее.
> Например, можете посмотреть на:
>
> - [Writing a seqlock in Rust.](https://pitdicker.github.io/Writing-a-seqlock-in-Rust/)
> - [Can Seqlocks Get Along With Programming Language Memory Models?](https://www.hpl.hp.com/techreports/2012/HPL-2012-68.pdf)
> - [Crate seqlock.](https://docs.rs/seqlock/0.1.2/seqlock/)


### Задача 2 --- реализация [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)

Реализуйте описанные алгоритмы чтения и записи.
Читает из структуры
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
её [метод](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.load)

```rust
fn AtomicCorrelationPoint::load(&self) -> CorrelationPoint
```

Точнее вам достаточно реализовать вспомогательный [метод](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.try_load)

```rust
fn AtomicCorrelationPoint::try_load(&self) -> Option<CorrelationPoint>
```

Он пытается прочитать значение только один раз.
И возвращает его, завернув в
[`core::option::Option::Some`](https://doc.rust-lang.org/nightly/core/option/enum.Option.html#variant.Some),
если оно было прочитано консистентно.

Пишут в
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
два других метода.
[Метод](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.store)

```rust
fn AtomicCorrelationPoint::store(&self, counter: CorrelationPoint)
```

записывает заданное `counter` значение. А
[метод](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.inc)

```rust
fn AtomicCorrelationPoint::inc(&self, tsc: i64)
```

инкрементирует поле
[`AtomicCorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.count)
и записывает в поле
[`AtomicCorrelationPoint::tsc`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.tsc)
значение аргумента `tsc`.

Методом
[`AtomicCorrelationPoint::store()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.store)
пользуется обработчик прерываний RTC.
С его помощью он сохраняет текущее значение секунд, прошедших с начала Unix--эпохи.
А методом
[`AtomicCorrelationPoint::inc()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.inc) ---
обработчик прерываний PIT.
Он сохраняет просто счётчик своих тиков, который никак не привязан к реальному времени.
Поэтому ему достаточно инкрементировать логическое значение своего счётчика при каждом прерывании.

Используйте поле
[`AtomicCorrelationPoint::sequence_number`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#structfield.sequence_number)
как атомарную переменную, синхронизующую между собой
[`load()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.load) и
[`store()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.store)/[`inc()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.inc).
То есть, правильно расставьте сами атомарные операции доступа к обоим полям и
[`core::sync::atomic::Ordering`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html)
в них.
К сожалению, тест не может проверить корректность расстановки
[`Ordering`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html).
Поэтому ей стоит уделить повышенное внимание.

Обратите внимание, что
[`Ordering::SeqCst`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.SeqCst)
использовать не рекомендуется.
Так как мнение "использовать
[`Ordering::SeqCst`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.SeqCst)
гарантированно безопасно" неверно.
Режим
[`Ordering::SeqCst`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.SeqCst)
позволяет делать довольно специфические вещи, которые реально нужны довольно редко.
[А вот гарантий корректности не даёт, это заблуждение](https://github.com/rust-lang/nomicon/issues/166).

Если в алгоритме синхронизации вам понадобилось написать что-нибудь вроде

```rust
let end_sequence_number = sequence_number.load(Ordering::Release);
```

Компилятор выдаст ошибку:

```console
error: atomic loads cannot have `Release` or `AcqRel` ordering
  --> kernel/tests/1-time-2-correlation-point.rs:38:52
   |
38 |     let end_sequence_number = sequence_number.load(Ordering::Release);
   |                                                    ^^^^^^^^^^^^^^^^^
   |
   = note: `#[deny(invalid_atomic_ordering)]` on by default
   = help: consider using ordering modes `Acquire`, `SeqCst` or `Relaxed`
```

А если её подавить с помощью `#[allow(invalid_atomic_ordering)]`, то уже при запуске будет
[паника](https://doc.rust-lang.org/nightly/core/sync/atomic/struct.AtomicI64.html#panics):

```
1_time_2_correlation_point::wrong_ordering------------------
panicked at 'there is no such thing as a release load', .../src/rust/library/core/src/sync/atomic.rs:2964:24
--------------------------------------------------- [failed]
```

Если в этом месте поменять
[`Ordering::Release`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.Release)
на
[`Ordering::SeqCst`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.SeqCst),
не меняя остальную часть алгоритма синхронизации,
то компиляция пройдёт и паники не будет.
Но код скорее всего будет **некорректен**, --- простая замена на
[`Ordering::SeqCst`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.SeqCst)
не исправит сам алгоритм синхронизации.
То есть, использование
[`Ordering::SeqCst`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.SeqCst)
скроет ошибку в алгоритме синхронизации, о наличии которой заботливо предупреждали компилятор и паника.
К такому же эффекту приведёт смена
[`Ordering::Release`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.Release)
на
[`Ordering::Relaxed`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.Relaxed).
Но [`Ordering::Relaxed`](https://doc.rust-lang.org/nightly/core/sync/atomic/enum.Ordering.html#variant.Relaxed)
хотя бы бросается в глаза в коде.

Также учтите, что нам точно не нужен
[приём "read-dont-modify-write"](https://www.hpl.hp.com/techreports/2012/HPL-2012-68.pdf).
Его может хотеться использовать в читателе.
Но читатель потенциально будет выполняться в режиме пользователя.
А значит, не сможет выполнять запись в общесистемную структуру
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html),
хранящую показания RTC.
Так как она доступна в режиме пользователя только на чтение.
Другими словами, если вы используете "read-dont-modify-write", то в будущих лабораторках вылезет ошибка.
Не говоря уж о совершенно лишнем захвате кеш--линии в эксклюзивное использование при чтении
[`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html).

Вы можете опираться на тот факт, что писатель один и методы записи ---
[`AtomicCorrelationPoint::store()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.store) и
[`AtomicCorrelationPoint::inc()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.inc) ---
гарантированно не вызываются конкурентно ни каждый сам с собой, ни друг с другом.


### Запуск тестов

Тесты можно запустить командой `cargo test --test 1-time-2-correlation-point` в директории `kernel` репозитория.

После выполнения задачи должны проходить тесты `correlation_point_reader()` и `correlation_point_writer()`
в файле
[`kernel/tests/time.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/tests/time.rs):

```console
$ (cd kernel; cargo test --test 1-time-2-correlation-point)
...
time::correlation_point_reader------------------------------
10:35:25 0 D same = 0; different = 1; point = CorrelationPoint { count: 1000, tsc: 1000 }
10:35:26 0 D same = 1082; different = 542; point = CorrelationPoint { count: 1082000, tsc: 1082000 }
10:35:27 0 D same = 2166; different = 1084; point = CorrelationPoint { count: 2166000, tsc: 2166000 }
10:35:28 0 D same = 3253; different = 1627; point = CorrelationPoint { count: 3253000, tsc: 3253000 }
10:35:29 0 D same = 4340; different = 2170; point = CorrelationPoint { count: 4338000, tsc: 4338000 }
10:35:30 0 D same = 5422; different = 2712; point = CorrelationPoint { count: 5422000, tsc: 5422000 }
10:35:31 0 D same = 6506; different = 3254; point = CorrelationPoint { count: 6506000, tsc: 6506000 }
10:35:32 0 D same = 7594; different = 3798; point = CorrelationPoint { count: 7594000, tsc: 7594000 }
10:35:33 0 D same = 8678; different = 4340; point = CorrelationPoint { count: 8678000, tsc: 8678000 }
10:35:34 0 D same = 9762; different = 4882; point = CorrelationPoint { count: 9762000, tsc: 9762000 }
10:35:35 0 D same = 10848; different = 5425; point = CorrelationPoint { count: 10849000, tsc: 10849000 }
10:35:36 0 D same = 11936; different = 5968; point = CorrelationPoint { count: 11934000, tsc: 11934000 }
10:35:37 0 D same = 13022; different = 6512; point = CorrelationPoint { count: 13022000, tsc: 13022000 }
10:35:38 0 D same = 14108; different = 7055; point = CorrelationPoint { count: 14109000, tsc: 14109000 }
10:35:39 0 D same = 15184; different = 7593; point = CorrelationPoint { count: 15185000, tsc: 15185000 }
10:35:40 0 D same = 16270; different = 8135; point = CorrelationPoint { count: 16269000, tsc: 16269000 }
10:35:41 0 D same = 17356; different = 8679; point = CorrelationPoint { count: 17357000, tsc: 17357000 }
10:35:42 0 D same = 18438; different = 9220; point = CorrelationPoint { count: 18438000, tsc: 18438000 }
10:35:43 0 D same = 19520; different = 9761; point = CorrelationPoint { count: 19521000, tsc: 19521000 }
time::correlation_point_reader--------------------- [passed]

time::correlation_point_writer------------------------------
10:35:43 0 D iteration = 0; failure_count = 0; success_count = 0; point = CorrelationPoint { count: 0, tsc: 0 }
10:35:44 0 D iteration = 840; failure_count = 90828; success_count = 220580; point = CorrelationPoint { count: 840, tsc: 840 }
10:35:45 0 D iteration = 2396; failure_count = 258876; success_count = 628295; point = CorrelationPoint { count: 2396, tsc: 2396 }
10:35:46 0 D iteration = 3958; failure_count = 427572; success_count = 1037519; point = CorrelationPoint { count: 3958, tsc: 3958 }
10:35:47 0 D iteration = 5345; failure_count = 570102; success_count = 1472279; point = CorrelationPoint { count: 5345, tsc: 5345 }
10:35:48 0 D iteration = 6383; failure_count = 660408; success_count = 1958120; point = CorrelationPoint { count: 6383, tsc: 6383 }
10:35:49 0 D iteration = 7433; failure_count = 751845; success_count = 2449799; point = CorrelationPoint { count: 7434, tsc: 7434 }
10:35:50 0 D iteration = 8485; failure_count = 843282; success_count = 2941927; point = CorrelationPoint { count: 8485, tsc: 8485 }
10:35:51 0 D iteration = 9529; failure_count = 934110; success_count = 3430565; point = CorrelationPoint { count: 9529, tsc: 9529 }
10:35:51 0 D iteration = 10000; failure_count = 975087; success_count = 3650638
time::correlation_point_writer--------------------- [passed]
```

> ### Как устроен тест
>
> Для того чтобы проверить корректность реализации
> [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
> было бы здорово запустить стресс--тест с писателем и читателем на разных процессорах.
> И желательно на процессорах со
> [слабой моделью памяти](https://en.wikipedia.org/wiki/Memory_ordering#In_symmetric_multiprocessing_(SMP)_microprocessor_systems),
> в которых возможно больше интересных эффектов, чем в архитектуре
> [x86-64](https://en.wikipedia.org/wiki/X86-64).
> А в случае архитектуры
> [NUMA](https://en.wikipedia.org/wiki/Non-uniform_memory_access),
> в которой процессоры организованы в сложную иерархию,
> стоило бы запустить этот тест несколько раз на наборе неэквивалентных с точки зрения архитектуры пар процессоров ---
> читатель и писатель в одном NUMA--домене, в разных NUMA--доменах и т.д.
>
> Но в Nikka поддержана только
> архитектура [x86-64](https://en.wikipedia.org/wiki/X86-64).
> А поддержку нескольких процессоров мы сделаем только в
> [будущей лабе](../../lab/book/4-concurrency-1-smp-0-intro.html).
> И пока нам не доступна возможность запустить стресс--тест даже на двух процессорах в симметричной системе.
>
> Но можно вспомнить про то, что
> [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
> реализуется конкурентной ради прерываний,
> которые являются одной из конкурентных активностей в компьютере.
> Тогда в голову приходит вариант запустить стресс--тест,
> в котором писатель будет работать в прерывании, а читатель --- в обычном коде, прерываемом периодически этим прерыванием.
> Собственно
> [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
> предназначен именно для такого сценария использования, в котором прерывание поступает от источника времени --- RTC или PIT.
> Тики RTC, происходящие раз в секунду, точно не подходят для стресс--теста.
> Можно было бы сконфигурировать PIT на его максимальную частоту --- 1.193(18) MHz, но это всё ещё не очень много.
>
> Зато есть интересный режим работы процессора ---
> [режим трассировки](https://en.wikipedia.org/wiki/Stepping_(debugging)).
> От предназначен для пошаговой отладки программ.
> В этом режиме процессор генерирует прерывание с номером
> [`kernel::interrupts::DEBUG`](../../doc/kernel/interrupts/constant.DEBUG.html)
> на каждой исполняемой им инструкции программы.
> Задаётся такой режим работы включением
> [флага трассировки](https://en.wikipedia.org/wiki/Trap_flag) в
> [регистре флагов](https://en.wikipedia.org/wiki/FLAGS_register) процессора.
>
> То есть, идея состоит в том, чтобы запустить читателя "под пошаговой отладкой".
> А писателя использовать вместо отладчика.
> Тогда между каждыми двумя инструкциями кода читателя будет запускаться код писателя.
> Правда, так как читатель работает в цикле ожидания корректности структуры
> [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html),
> если писатель будет обновлять её на каждом прерывании --- между каждыми двумя инструкциями читателя,
> то читатель никогда не дождётся своего условия выхода из цикла и зависнет.
> Поэтому писатель должен будет на значительное количество итераций такой
> пошаговой отладки прекращать обновление
> [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html).
>
> В коде теста это выглядит так:
> ```rust
> #[test_case]
> fn correlation_point_reader() {
>     interrupts::test_scaffolding::set_debug_handler(writer);
>
>     reader();
>
>     static POINT: AtomicCorrelationPoint = AtomicCorrelationPoint::new();
>
>     ...
> }
> ```
> Функция `interrupts::test_scaffolding::set_debug_handler()` устанавливает заданный обработчик
> прерывания
> [`kernel::interrupts::DEBUG`](../../doc/kernel/interrupts/constant.DEBUG.html),
> который содержит процедуру писателя `writer()`.
> Дальше запускается читатель `reader()`.
> Конкурировать они будут за переменную `POINT`. Она сделана статической для удобства доступа из
> обработчика прерываний, которому мы не можем передать произвольный набор аргументов.
> По той же причине его внутренне состояние, которое нужно сохранять между вызовами обработчика,
> тоже записывается в статические переменные.
> Переменные, которые использует, в том числе, обработчик прерывания, дополнительно сделаны атомарными,
> так как формально к ним есть конкурентный доступ.
> Плюс Rust не даст работать с изменяемой статической переменной без `unsafe`,
> как раз, чтобы защищать от непредумышленных гонок.
> А вот атомарные типы
> [помечены](https://doc.rust-lang.org/nightly/core/sync/atomic/struct.AtomicUsize.html#impl-Sync-for-AtomicUsize)
> типажём
> [`core::marker::Sync`](https://doc.rust-lang.org/nightly/core/marker/trait.Sync.html),
> [что означает](https://doc.rust-lang.org/nomicon/send-and-sync.html)
> корректность их конкурентного использования.
> К сожалению, это приводит к страшно выглядящему коду.
>
> Писатель имеет внутренний счётчик запусков `VALUE`, который и определяет, что делать:
>
> ```rust
> extern "x86-interrupt" fn writer(_: InterruptContext) {
>     static VALUE: AtomicUsize = AtomicUsize::new(0);
>
>     let value = VALUE.fetch_add(1, Ordering::Relaxed);
>
>     match (value / 1_000) % 4 {
>         0 => POINT.store(time::test_scaffolding::equal_point(value as i64 + 1)),
>         2 => POINT.inc(POINT.load().count() + 1),
>         _ => {},
>     }
> }
> ```
>
> Сигнатуру `extern "x86-interrupt" fn writer(_: InterruptContext)`
> [обсудим чуть позже](../../lab/book/1-time-5-interrupts.html).
>
> Каждую тысячу своих запусков писатель переключается между режимами:
>
> - Записи в `POINT` через вызов [`AtomicCorrelationPoint::store()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.store).
> - Бездействия, чтобы дать шанс читателю увидеть [`AtomicCorrelationPoint::store()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.store) в одном и том же состоянии на протяжении всего цикла своей работы.
> - Записи в `POINT` через вызов [`AtomicCorrelationPoint::inc()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.inc).
> - Очередного бездействия.
>
> При этом писатель и читатель придерживаются соглашения, что консистентными состояниями
> [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
> являются только состояния с одинаковыми значениями полей
> [`CorrelationPoint::tsc`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.tsc) и
> [`CorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.count).
> Поэтому в циклах обновления писатель меняет оба поля на одинаковые значения, отличающиеся от значений при предыдущей записи.
> В частности функция
> `time::test_scaffolding::equal_point()`
> создаёт
> [`AtomicCorrelationPoint`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html)
> с одинаковыми
> [`CorrelationPoint::tsc`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.tsc) и
> [`CorrelationPoint::count`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html#structfield.count),
> равными заданному значению.
> Это имеет смысл только для тестов, поэтому она убрана в модуль `test_scaffolding`.
>
> Читатель устроен так:
>
> ```rust
> fn reader() {
>     ...
>     while ... {
>         switch_trap_flag();
>         let point = POINT.load();
>         switch_trap_flag();
>         ...
>         assert!(point.count() == point.tsc(), "{:?} is inconsistent", point);
>         ...
>     }
> }
> ```
>
> Он включает режим трассировки функцией `switch_trap_flag()`, которая просто переключает состояние
> [флага трассировки](https://en.wikipedia.org/wiki/Trap_flag)
> процессора.
> После этого запускает тестируемый алгоритм чтения
> [`AtomicCorrelationPoint::load()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.load).
> Который должен вернуть управление, только когда писатель прекратит обновлять `POINT` и перейдёт в режим бездействия.
> После чего читатель отключает трассировку повторным переключением флаг `switch_trap_flag()` ---
> когда она включена он работает очень медленно.
> И проверяет консистентность полученного от
> [`AtomicCorrelationPoint::load()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.load)
> значения
> [`CorrelationPoint`](../../doc/ku/time/correlation_point/struct.CorrelationPoint.html).
>
> Нетрудно догадаться, что в этом тесте мы никогда не прерываем писателя и каждый вызов
> [`AtomicCorrelationPoint::store()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.store) или
> [`AtomicCorrelationPoint::inc()`](../../doc/ku/time/correlation_point/struct.AtomicCorrelationPoint.html#method.inc)
> выполняется атомарно с точки зрения читателя.
> А значит, их корректность мы не проверили.
> Это делает другой тест:
>
> ```rust
> #[test_case]
> fn correlation_point_writer() {
>     interrupts::test_scaffolding::set_debug_handler(reader);
>
>     writer();
>     ...
> }
> ```
>
> Он аналогичен рассмотренному `correlation_point_reader()`, только меняет ролями читателя и писателя.
> Теперь писатель запускается "под пошаговой отладкой", а в обработчике прерывания работает читатель.
>
> Видно, что никак не проверяется случай, когда в едином конкурентном исполнении и читатель прерывается писателем, и наоборот, писатель прерывается читателем.
> Также видно, что такой тест не сможет проверить правильность расстановки `Ordering` в них,
> так как с точки зрения пошаговой отладки все инструкции процессора атомарны с наиболее строгой гарантией консистентности.
>
>> Теперь вы можете исследовать код, запуская его в пошаговом режиме.
>> Например:
>>
>> ```rust
>> #[test_case]
>> fn down_the_rabbit_hole() {
>>     use ku::memory::{Block, Virt};
>>
>>     interrupts::test_scaffolding::set_debug_handler(collect_statistics);
>>
>>     switch_trap_flag();
>>     debug!("how many instructions does it take to log something?");
>>     switch_trap_flag();
>>
>>     let max_rsp = MAX_RSP.load(Ordering::Relaxed);
>>     let min_rsp = cmp::min(max_rsp, MIN_RSP.load(Ordering::Relaxed));
>>     let rip = RIP.load(Ordering::Relaxed);
>>
>>     debug!(
>>         instruction_count = INSTRUCTION_COUNT.load(Ordering::Relaxed),
>>         used_stack_space = ?Block::<Virt>::from_index(min_rsp, max_rsp),
>>         last_traced_insruction_address = ?Virt::new(rip),
>>     );
>>
>>     static INSTRUCTION_COUNT: AtomicUsize = AtomicUsize::new(0);
>>     static MAX_RSP: AtomicUsize = AtomicUsize::new(usize::MIN);
>>     static MIN_RSP: AtomicUsize = AtomicUsize::new(usize::MAX);
>>     static RIP: AtomicUsize = AtomicUsize::new(0);
>>
>>     extern "x86-interrupt" fn collect_statistics(context: InterruptContext) {
>>         let context = context.get().mini_context();
>>         let rip = context.rip().into_usize();
>>         let rsp = context.rsp().into_usize();
>>
>>         let max_rsp = cmp::max(rsp, MAX_RSP.load(Ordering::Relaxed));
>>         let min_rsp = cmp::min(rsp, MIN_RSP.load(Ordering::Relaxed));
>>
>>         INSTRUCTION_COUNT.fetch_add(1, Ordering::Relaxed);
>>         MAX_RSP.store(max_rsp, Ordering::Relaxed);
>>         MIN_RSP.store(min_rsp, Ordering::Relaxed);
>>         RIP.store(rip, Ordering::Relaxed);
>>     }
>> }
>> ```
>>
>> В отладочной сборке на логирование одной строки ушло 112209 инструкций процессора,
>> последняя из них располагалась по адресу `0v216D07`.
>> А также было потрачено 5.742 KiB стека по адресам `[0x100002001c8, 0x100002018c0)`
>> ```console
>> $ (cd kernel; cargo test --test 1-time-2-correlation-point)
>> ...
>> time::down_the_rabbit_hole----------------------------------
>> 21:10:12 0 D waiting for the RTC to tick twice
>> 21:10:14.001 0 D how many instructions does it take to log something?
>> 21:10:14.022 0 D how many instructions does it take to log something?
>> 21:10:14.436 0 D instruction_count = 121954; used_stack_space = Ok([0x100001ffbd8, 0x100002012d0), size 5.742 KiB); last_traced_insruction_address = Ok(Virt(0v2180F7))
>> 21:10:14.460 0 D time_to_log_a_message = 2.198 ms; time_to_log_a_message_in_the_stepping_mode = 432.808 ms; stepping_slowdown_ratio = 196.9484863163476
>> time::down_the_rabbit_hole------------------------- [passed]
>> ```
>> Возможно вы заметили, что второе сообщение `how many ...`, которое печаталось под трассировкой, появлялось на экране медленнее.
>>
>> В релизной сборке на логирование одной строки ушло 6874 инструкций и 1.141 KiB стека:
>>
>> ```console
>> $ (cd kernel; cargo test --test 1-time-2-correlation-point --release)
>> ...
>> time::down_the_rabbit_hole----------------------------------
>> 21:09:33 0 D waiting for the RTC to tick twice
>> 21:09:35.001 0 D how many instructions does it take to log something?
>> 21:09:35.001 0 D how many instructions does it take to log something?
>> 21:09:35.011 0 D instruction_count = 7624; used_stack_space = Ok([0x10000201890, 0x10000201d20), size 1.141 KiB); last_traced_insruction_address = Ok(Virt(0v20AA12))
>> 21:09:35.014 0 D time_to_log_a_message = 549.737 us; time_to_log_a_message_in_the_stepping_mode = 10.388 ms; stepping_slowdown_ratio = 18.89630272070954
>> time::down_the_rabbit_hole------------------------- [passed]
>> ```
>>
>>> Теперь вы можете, например, построить гистограмму количества раз, сколько исполнялись инструкции по разным адресам.
>>> И найти самые горячие циклы кода.


### Theory and Practice of Concurrency

Более подробно познакомиться с конкурентностью, атомарными переменными, синхронизациями, моделями памяти и т.п.,
вы можете на курсе Ромы Липовского "Theory and Practice of Concurrency":

- Публичный доступ:
  - [Плейлист с лекциями](https://youtube.com/playlist?list=PL4_hYwCyhAva37lNnoMuBcKRELso5nvBm).
  - [Репозиторий курса](https://gitlab.com/Lipovsky/concurrency-course).
- [Личный кабинет ШАД, весна 2022](https://lk.yandexdataschool.ru/courses/2022-spring/7.1013-theory-and-practice-of-concurrency/about/).
- [Wiki yandex-team, запись 2020 года](https://wiki.yandex-team.ru/hr/volnoslushateli/lekcii-shad/chetvertyjj-semestr/#zapis2020goda9).


### Ориентировочный объём работ этой части лабораторки

```console
 ku/src/time/correlation_point.rs |   40 +++++++++++++++++++++++++++++++--------
 1 file changed, 32 insertions(+), 8 deletions(-)
```
