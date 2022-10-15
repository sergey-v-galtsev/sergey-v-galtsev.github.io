## Почему Rust

Исторически для разработки ОС использовался язык C.
Он характеризуется

- поддержкой большого количества платформ;
- минималистичным рантаймом;
- возможностью работы с оборудованием напрямую;
- относительной высокоуровневостью, по сравнению с ассемблером.

Rust имеет те же свойства, но в дополнении предоставляет:

- По-настоящему строгую типизацию, без неявных приведений типов.
- Значительно большее количество проверок работы с памятью и работы в многопоточной среде.
- Более предсказуемое поведение при наличии ошибок в программах, --- Rust стремится уйти от Undefined Behaviour и облегчить задачу обнаружения причины ошибок.
- Развитую систему типов. Например, элегантно реализуются функции, которые могут вернуть либо обычный результат, либо признак возникновения исключительной ситуации.
- Высокоуровневые абстракции, которые помогают избегать ошибок в коде.
- [Типажи](https://doc.rust-lang.ru/book/ch10-02-traits.html), а также [обобщённые типы и функции](https://doc.rust-lang.ru/book/ch10-01-syntax.html).
- Удобную систему [модулей](https://doc.rust-lang.ru/book/ch07-02-defining-modules-to-control-scope-and-privacy.html) вместо инклюдов.
- Встроенную систему сборки, подключения внешних библиотек ([пакетов](https://doc.rust-lang.ru/book/ch07-01-packages-and-crates.html)) и тестирования.

Благодаря этому стали [появляться](https://en.wikipedia.org/wiki/Redox_(operating_system)) ОС на Rust, в том числе [учебные](https://github.com/sslab-gatech/cs3210-rustos-public).

Для ознакомления с Rust рекомендуется посмотреть записи первых четырёх занятий по нему из курса
[Современное системное программирование на Rust](https://lk.yandexdataschool.ru/courses/2021-autumn/7.939-rust/classes/)
прошлого года:

- [Семинар 1. Rust crash course](https://lk.yandexdataschool.ru/courses/2021-autumn/7.939-rust/classes/7746/).
- [Лекция 2. Lifetimes, ownership & borrow checking](https://lk.yandexdataschool.ru/courses/2021-autumn/7.939-rust/classes/7891/).
- [Лекция 3. Enums & pattern matching. Traits](https://lk.yandexdataschool.ru/courses/2021-autumn/7.939-rust/classes/7932/).
- [Лекция 4. Обработка ошибок](https://lk.yandexdataschool.ru/courses/2021-autumn/7.939-rust/classes/8070/).

Также рекомендуется пройти [упражнения](https://github.com/rust-lang/rustlings/).
Глубоких знаний языка потребоваться не должно, особенно если вы знакомы с C++.

Мы будем пользоваться [nightly](https://doc.rust-lang.ru/book/appendix-07-nightly-rust.html) Rust [редакции 2021](https://doc.rust-lang.org/edition-guide/rust-2021/index.html).

Так как ядро --- это [`no_std`](https://docs.rust-embedded.org/book/intro/no-std.html) код,
не вся [стандартная библиотека `std`](https://doc.rust-lang.org/nightly/std/index.html) будет нам доступна.
Но будет доступна её
[`core`](https://doc.rust-lang.org/nightly/core/index.html)
часть.
После реализации аллокатора нам также будет доступна
[`alloc`](https://doc.rust-lang.org/nightly/alloc/index.html)
часть стандартной библиотеки.
Так что, например [`alloc::vec::Vec`](https://doc.rust-lang.org/nightly/alloc/vec/struct.Vec.html) будет нам доступен.

Учтите, что многие объекты из
[`alloc`](https://doc.rust-lang.org/nightly/alloc/index.html) и
[`core`](https://doc.rust-lang.org/nightly/core/index.html) реэкспортируются в
[`std`](https://doc.rust-lang.org/nightly/std/index.html)
и широко известны под своими `std::...` именами.
Поэтому если вы в поиске нашли какую-нибудь ссылку на `std::abc::def`, это ещё не значит, что он не доступен.
Просто проверьте его наличие в
[`core`](https://doc.rust-lang.org/nightly/core/index.html)
под именем `core::abc::def` и в
[`alloc`](https://doc.rust-lang.org/nightly/alloc/index.html)
под именем `alloc::abc::def`.

Полезные ресурсы по Rust:
- [The Rust Programming Language](https://doc.rust-lang.org/book/) --- основная книга по языку, [перевод](https://doc.rust-lang.ru/book/).
- [The Rust Reference](https://doc.rust-lang.org/reference/) --- подробная документация по языку.
- [The Rustonomicon](https://doc.rust-lang.org/nomicon/index.html) --- руководство по написанию `unsafe` кода, [перевод](https://github.com/rust-lang-ru/rustonomicon/blob/master/src/SUMMARY.md).
- [The Embedded Rust Book](https://doc.rust-lang.org/stable/embedded-book/) --- руководство по написанию `no_std` кода.
