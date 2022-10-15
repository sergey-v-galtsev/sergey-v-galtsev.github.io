## Логирование и логи

При обычном запуске --- `make run` --- логи записываются в файл `kernel/serial.out`:

```console
$ make run
...
<Ctrl-C>
$ head -n20 kernel/serial.out
...
15:08:28 0 I RTC init; acknowledged_settings = USE_24_HOUR_FORMAT | USE_BINARY_FORMAT | UPDATE_ENDED_INTERRUPT
15:08:28 0 I time init
15:08:28 0 I Nikka booted; now = 2022-08-28 15:08:28 UTC; tsc = Tsc(10571359859)
15:08:28 0 I GDT init
15:08:28 0 I interrupts init
15:08:28 0 I phys2virt = Page(402653184 @ 0v18000000000)
15:08:28 0 I init; frame_allocator = "boot frame allocator"; block = [9.664 MiB, 49.875 MiB), size 40.211 MiB; free_frame_count = 10294
15:08:28 0 I page allocator init; free_page_count = 33822867456; block = [2.000 TiB, 128.000 TiB), size 126.000 TiB
15:08:28 0 I init; address_space = "base" @ 0p1000
15:08:28 0 I drop; address_space = "invalid" @ 0p0
15:08:28 0 I available memory; total = 49.875 MiB; usable = 41.715 MiB; total_frames = 12768; usable_frames = 10679
15:08:28 0 D frame info mapped; duration = 52.040 Mtsc
15:08:28 0 D frame info init; duration = 82.218 Mtsc
15:08:28 0 D move free frames; dst = "main frame allocator"; src = "boot frame allocator"; free_frame_count = 10216
15:08:28 0 I drop; frame_allocator = "boot frame allocator"; block = [9.664 MiB, 9.664 MiB), size 0 B; leaked_frame_count = 0
15:08:28 0 D moved all free frames; duration = 180.033 Mtsc
15:08:28 0 I init; frame_allocator = "main frame allocator"; free_frame_count = 10601; duration = 322.017 Mtsc
15:08:28 0 I memory init; duration = 461.240 Mtsc
15:08:28 0 I acpi_info = AcpiInfo { local_apic_address: Phys(0pFEE00000), bsp_id: 0, ap_ids: [1, 2, 3] }
15:08:28 0 I Local APIC init; cpu = 0; cpu_count = 4; local_apic_address = 0pFEE00000
```

При запуске тестов --- `make test` или `(cd kernel; cargo test ...)`, ---
а также при запуске без эмулируемого монитора --- `make nox` или `(cd kernel; cargo run)`, ---
логи пишутся в консоль.
Для запуска через `cargo` это можно поменять в файле `kernel/Cargo.toml`:

```toml
[package.metadata.bootimage]
    # Отвечает за `cargo run`.
    run-args = [
        ...
        # Для перенаправления лога в файл `kernel/serial.out` поменяйте опцию `-serial`:
        # "-serial", "file:serial.out",
        "-serial", "stdio",
        # Опция `-display none` отключает окно с монитором эмулируемого компьютера.
        "-display", "none",
    ]

    # Отвечает за `cargo test ...`.
    test-args = [
        ...
        "-serial", "stdio",
        "-display", "none",
    ]
```

Здесь же можно поменять другие опции эмулятора `qemu`, если это понадобится.
Для `make ...` это делается в `Makefile`.

Для логирования используйте макросы `error`, `warn`, `info`, `debug` и `trace` из файла [`kernel/src/log.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/log.rs).
Это реэкспорты макросов библиотеки [tracing](https://docs.rs/tracing/).

Например, вызов

```rust
info!(free_page_count = page_allocator.block.count(), block = %page_allocator.block, "page allocator init");
```

приводит к печати
```console
15:08:28 0 I page allocator init; free_page_count = 33822867456; block = [2.000 TiB, 128.000 TiB), size 126.000 TiB
```

Здесь:

- `15:08:28` --- время сообщения.
- `0` --- номер процессора, на котором работал код.
- `I` --- признак уровня логирования `INFO`.
- `page allocator init` --- текст сообщения, за которым идут значения залогированных полей, разделённые знаком `;`.

Запись

```rust
info!(..., free_page_count = page_allocator.block.count(), ...);
```

означает, что `free_page_count` --- имя поля в структурированной части сообщения, а `page_allocator.block.count()` --- значение этого поля.
Если в коде есть переменная `free_page_count` с нужным значением, `= ...` можно опустить:

```rust
info!(..., free_page_count, ...);
```

Если вы забудете указать имя поля при печати сложного выражения, а не просто переменной, возникнет синтаксическая ошибка

```console
error: expected expression, found `%`
  --> src/tests/memory.rs:21:12
   |
21 |     debug!(%frames[0]);
   |            ^ expected expression
```

Просто добавьте имя поля:
```rust
debug!(frame = %frames[0]);
```

Библиотека [tracing](https://docs.rs/tracing/)
поддерживает печать встроенных типов напрямую.
А вот для пользовательских типов нужно указать `%` или `?`, как в

```rust
trace!(page_allocator = %self, ..., ?block, ...);
```

`%` означает печать типа через [типаж](https://doc.rust-lang.ru/book/ch10-02-traits.html) [`core::fmt::Display`](https://doc.rust-lang.org/nightly/core/fmt/trait.Display.html), а `?` --- через типаж [`core::fmt::Debug`](https://doc.rust-lang.org/nightly/core/fmt/trait.Debug.html).
Если забыть указать `%` или `?` --- возникнет ошибка, говорящая, что для типа не реализован типаж [`tracing::Value`](../../doc/tracing/trait.Value.html):

```console
error[E0277]: the trait bound `PageAllocator: Value` is not satisfied
  --> src/memory/page_allocator.rs:82:17
   |
82 |                 trace!(page_allocator = self, size, page_count, ?block, "allocate pages");
   |                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ the trait `Value` is not implemented for `PageAllocator`
   |
   = note: required because of the requirements on the impl of `Value` for `&mut PageAllocator`
   = note: required for the cast to the object type `dyn Value`
   = note: this error originates in the macro `$crate::valueset` (in Nightly builds, run with -Z macro-backtrace for more info)

For more information about this error, try `rustc --explain E0277`.
```

Если же тип не реализует запрошенный через `%` или `?` типаж, возникнет похожая ошибка, но уже про типаж [`Display`](https://doc.rust-lang.org/nightly/core/fmt/trait.Display.html) или [`Debug`](https://doc.rust-lang.org/nightly/core/fmt/trait.Debug.html):

```console
error[E0277]: `PageAllocator` doesn't implement `Display`
  --> src/memory/page_allocator.rs:82:17
   |
82 |                 trace!(page_allocator = %self, size, page_count, ?block, "allocate pages");
   |                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ `PageAllocator` cannot be formatted with the default formatter
   |
   = help: the trait `Display` is not implemented for `PageAllocator`
   = note: in format strings you may be able to use `{:?}` (or {:#?} for pretty-print) instead
   = note: required because of the requirements on the impl of `Display` for `&mut PageAllocator`
   = note: 1 redundant requirements hidden
   = note: required because of the requirements on the impl of `Display` for `&&mut PageAllocator`
   = note: required because of the requirements on the impl of `Value` for `DisplayValue<&&mut PageAllocator>`
   = note: required for the cast to the object type `dyn Value`
   = note: this error originates in the macro `$crate::valueset` (in Nightly builds, run with -Z macro-backtrace for more info)

For more information about this error, try `rustc --explain E0277`.
```

Самый простой способ это починить, --- использовать [`Debug`](https://doc.rust-lang.org/nightly/core/fmt/trait.Debug.html) с автоматической реализацией через макрос `derive` в месте объявления типа, например:

```rust
#[derive(Debug)]
struct PageAllocator {
    ...
}
```

Это потребует реализацию [`Debug`](https://doc.rust-lang.org/nightly/core/fmt/trait.Debug.html) от всех полей структуры, которую при необходимости можно добавить аналогичным способом в местах объявления типов полей.

[`Display`](https://doc.rust-lang.org/nightly/core/fmt/trait.Display.html)
тоже можно реализовать с помощью атрибута `#[derive(Display)]` из внешней библиотеки
[derive_more](https://docs.rs/derive_more/0.99.16/derive_more/),
при этом можно указать
[формат печати](https://jeltef.github.io/derive_more/derive_more/display.html):

```rust
use derive_more::Display;
...
#[derive(Display)]
#[display(fmt = "{:04}-{:02}-{:02} {:02}:{:02}:{:02}", year, month, day, hour, minute, second)]
struct Date {
    year: u16,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
}
```

Также можно реализовать [`Debug`](https://doc.rust-lang.org/nightly/core/fmt/trait.Debug.html) или [`Display`](https://doc.rust-lang.org/nightly/core/fmt/trait.Display.html) вручную, например:

```rust
impl fmt::Display for Size {
    fn fmt(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        match NumberPrefix::binary(self.size() as f64) {
            NumberPrefix::Standalone(_) => {
                write!(formatter, "{} B", self.size())
            }
            NumberPrefix::Prefixed(prefix, value) => {
                write!(formatter, "{:.3} {}B", value, prefix.symbol())
            }
        }
    }
}
```

Эта реализация объясняет почему размеры в записи лога имели суффиксы `TiB`: `... block = [2.000 TiB, 128.000 TiB), size 126.000 TiB`.

Поменять глобальный уровень логирования можно в самом конце файла [`kernel/src/log.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/log.rs):

```rust
static LOG_COLLECTOR: ... = LogCollector::new(..., Level::INFO);
```

Другие примеры использования можно посмотреть в документации tracing, например [для `info!()`](../../doc/tracing/macro.info.html#examples).
Рядом есть и [более подробная документация по синтаксису макросов логирования](../../doc/tracing/index.html#using-the-macros).


> ### Характеристики логирования
>
> Логирование в Nikka:
>
> - унифицированное между [ядром и кодом пользователя](https://en.wikipedia.org/wiki/User_space_and_kernel_space);
> - структурированное;
> - с гарантированной доставкой;
> - асинхронное для кода режима пользователя.
>
>
> #### Унифицированное между ядром и кодом пользователя
>
> И в ядре и в пространстве пользователя доступны одни и те же макросы для логирования из библиотеки
> [tracing](https://docs.rs/tracing/).
> В ядре за их работу отвечает модуль
> [`kernel::log`](../../doc/kernel/log/index.html) в директории `kernel/src/log`.
> А в пространстве пользователя --- модуль
> [`ku::log`](../../doc/ku/log/index.html) в директории `ku/src/log`.
>
>
> #### Структурированное
>
> Логирование структурированное.
> То есть записывается не строчка произвольного формата с интерполированными внутрь неё
> значениями переменных.
> А отдельно строковое сообщение, и отдельно каждая переменная.
> В уже рассматривавшемся примере
>
> ```rust
> info!(..., free_page_count, ...);
> ```
>
> логирование не знает смысл поля `free_page_count`, но оно знает его имя и тип.
> Даже если сообщение пришло от процесса пользователя, а не из ядра.
>
> Этим такое логирование отличается от системных вызовов в Unix--подобных системах.
> Системные вызовы
> [семейства `write`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/pwrite.html)
> при записи в консоль и системный вызов для логирования в общесистемный лог
> [`syslog`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/syslog.html)
> работают с неструктурированной информацией.
> В результате чтобы что-то найти в логе программы или в системном логе,
> нужно искать по неструктурированному тексту сложными регулярками
> и иногда даже парсить его отдельной утилитой.
> Например, представьте себе регулярку, задающую диапазон времени,
> начинающийся за несколько секунд до полуночи и заканчивающийся через несколько секунд после неё.
>
>
> #### С гарантированной доставкой
>
> Программы обычно не пишут в консоль напрямую системными вызовами,
> а используют библиотечные функции.
> Эти функции буферизируют запись в
> [`stdout`](https://en.wikipedia.org/wiki/Standard_streams#Standard_output_(stdout))
> и не буферизируют запись в
> [`stderr`](https://en.wikipedia.org/wiki/Standard_streams#Standard_error_(stderr)).
>
> Соображения здесь такие:
>
> - Программа потенциально много пишет в `stdout`, поэтому на каждый вызов записывающей функции делать системный вызов слишком накладно. Так как системные вызовы работают гораздо медленнее вызовов обычных функций --- они требуют дополнительной работы по сохранению и переключению контекста исполнения. Эффективнее накопить большой объём данных в памяти и записать его за один системный вызов. Для принудительного сброса буфера такие библиотеки обычно предоставляют [отдельную функцию](https://doc.rust-lang.org/std/io/struct.Stdout.html#method.flush). При корректном завершении программы, буфер сбрасывается автоматически из деструктора. А вот при аварийном завершении его содержимое может быть потеряно.
> - Хорошая программа пишет в `stderr` только сообщения об ошибках. А их должно быть мало по сравнению с обрабатываемыми программой данными. Поэтому в `stderr` можно позволить себе писать неэффективно. Зато, если вдруг программа упадёт, сообщения об ошибках будут надёжно записаны в консоль. И есть надежда, что они объяснят падение программы. Если бы запись в `stderr` была буферизованная, то последние сообщения об ошибках остались бы только в памяти падающей программы, и ни ядро, ни человек их бы уже не увидели.
>
> В Nikka при логировании выбран подход, который совмещает эффективность и гарантированную доставку сообщений.
> Для этого буфер под логирования не скрыт в недрах прикладной библиотеки, а известен ядру.
> И при падении программы ядро берёт на себя обязанность доставить все сохранившиеся в этом буфере лог--записи.
>
>
> #### Асинхронное для кода режима пользователя
>
> Более того, за счёт того что ядро знает буфер логирования приложения,
> оно доставляет сообщения из него при каждом переключении в режим ядра.
> Это позволяет приложению писать в лог вообще без системных вызовов.
> Доставка сообщений при этом выполняется асинхронно с исполнением кода самого приложения.
> В Unix--подобных системах собственно запись накопленного буфера
> [системными вызовами семейства `write`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/pwrite.html)
> и запись в общесистемный лог
> [`syslog`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/syslog.html)
> требует синхронного ожидания, пока ядро не обработает эту запись.
>
> Асинхронность доставки сообщения нарушается только в момент исчерпания буфера.
> Если модуль
> [`ku::log`](../../doc/ku/log/index.html)
> не сможет сохранить в буфер очередную запись из-за того что буфер переполнился,
> он отдаст управление ядру системным вызовом
> [`lib::syscall::sched_yield()`](../../doc/lib/syscall/fn.sched_yield.html).
> И попробует сохранить запись в буфер ещё раз по возвращению управления процессу из ядра,
> считая что ядро полностью обработало и очистило буфер.
> Если же запись просто слишком большая и не помещается даже в пустой буфер,
> [`ku::log`](../../doc/ku/log/index.html)
> запишет часть такой записи и залогирует своё, служебное, сообщение.
> В нём будет предупреждение, что пользовательская запись была частично утрачена.
>
>
>> #### Оборотная сторона
>>
>> Подумайте, к каким проблемам приводит такая организация логирования.
