## Физические и виртуальные адреса

Ядру приходится работать с двумя разными множествами адресов --- физическими и виртуальными.
Прикладные программы обычно работают только с виртуальными адресами, поэтому необходимость разделять множества физических и виртуальных адресов может быть непривычна.
Но это один из важных моментов, который придётся держать в голове, выполняя лабораторную работу.
И желание произвольно преобразовывать между собой указатели и целые числа, содержащие адреса, может привести к большим проблемам.
Если где-то перепутать физический адрес с виртуальным, или просто тождественно преобразовать битовое представление одного типа адреса в другой, то результатом будет неопределённое поведение.
Усугубляющееся тем, что оно возникло не в пользовательском коде, а в ядре.
Оно, например, может привести к перезагрузке компьютера с потерей данных, необходимых для отладки.

В частности поэтому, запускать ОС мы будем не на физическом железе, а в эмуляторе qemu.
Так отлаживать будет проще.
К qemu можно подключить gdb и отлаживать ядро практически как обычный пользовательский код.
Кроме того, мы выведем логирование в COM-порт, а всё что будем в него писать, средствами qemu перенаправим в файл.
Так логи не потеряются даже если эмулируемая машина перезагрузится.

## Типы для работы с памятью и базовые преобразования

Для того чтобы было проще не перепутать физические и виртуальные адреса, мы не будем для них использовать базовые типы [`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html)/[`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html).
Вместо этого вводятся два разных высокоуровневых типа, которые сделаны несовместимы:

- [`Phys`](../../doc/ku/memory/addr/type.Phys.html) для физических адресов;
- [`Virt`](../../doc/ku/memory/addr/type.Virt.html) для виртуальных.

Так что если присвоить переменной виртуального адреса значение физического, или наоборот,
```rust
let phys = Phys::new(0x123ABC);
let virt: Virt;
virt = phys;
```
компилятор выдаст ошибку и предотвратит неопределённое поведение:
```console
error[E0308]: mismatched types
   --> src/memory/addr.rs:353:12
    |
353 |     virt = phys;
    |            ^^^^ expected struct `Addr`, found enum `core::result::Result`
    |
    = note: expected struct `Addr<VirtTag>`
                 found enum `core::result::Result<Addr<PhysTag>, error::Error>`
```

Типы не совместимы, но родственны, так как оба являются мономорфизациями
[обобщённого типа](https://doc.rust-lang.ru/book/ch10-01-syntax.html)
[`Addr`](../../doc/ku/memory/addr/struct.Addr.html)`<T: `[`Tag`](../../doc/ku/memory/addr/trait.Tag.html)`>`.
Это сделано чтобы не дублировать одинаковый код.
При поиске по документации полезно помнить, что
[`Phys`](../../doc/ku/memory/addr/type.Phys.html) и
[`Virt`](../../doc/ku/memory/addr/type.Virt.html) ---
это мономорфизации [`Addr`](../../doc/ku/memory/addr/struct.Addr.html).
Потому что общие методы реализованы в обобщённом типе
[`Addr`](../../doc/ku/memory/addr/struct.Addr.html),
и в документации показываются только там.
В документации на
[`Phys`](../../doc/ku/memory/addr/type.Phys.html) и
[`Virt`](../../doc/ku/memory/addr/type.Virt.html)
будут только методы специфичные для них, общих методов из
[`Addr`](../../doc/ku/memory/addr/struct.Addr.html)
не будет показываться.

Таким образом места, где нужно повышенное внимание к типу адреса, а компилятор не в силах помочь, --- это места преобразований между базовыми типами
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html)/[`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html)
и высокоуровневыми типами адресов.
К счастью, таких мест очень мало.
Записываются эти преобразования как показано в примерах
[для `Phys`](../../doc/ku/memory/addr/type.Phys.html#%D0%9F%D1%80%D0%B5%D0%BE%D0%B1%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F-%D0%BC%D0%B5%D0%B6%D0%B4%D1%83-phys-%D0%B8-%D0%B1%D0%B0%D0%B7%D0%BE%D0%B2%D1%8B%D0%BC%D0%B8-%D1%82%D0%B8%D0%BF%D0%B0%D0%BC%D0%B8) и
[для `Virt`](../../doc/ku/memory/addr/type.Virt.html#%D0%9F%D1%80%D0%B5%D0%BE%D0%B1%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F-%D0%BC%D0%B5%D0%B6%D0%B4%D1%83-virt-%D0%B8-%D0%B1%D0%B0%D0%B7%D0%BE%D0%B2%D1%8B%D0%BC%D0%B8-%D1%82%D0%B8%D0%BF%D0%B0%D0%BC%D0%B8).
Иногда нам также встретится тип для виртуальных адресов библиотеки
[x86_64](../../doc/x86_64/index.html) ---
[`x86_64::VirtAddr`](../../doc/x86_64/addr/struct.VirtAddr.html).
[`Virt`](../../doc/ku/memory/addr/type.Virt.html) может быть преобразован в [`x86_64::VirtAddr`](../../doc/x86_64/addr/struct.VirtAddr.html) как [показано в примерах в документации](../../doc/ku/memory/addr/type.Virt.html#%D0%9F%D1%80%D0%B5%D0%BE%D0%B1%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F-%D0%BC%D0%B5%D0%B6%D0%B4%D1%83-virt-%D0%B8-virtaddr):

```rust
fn f(virt_addr: VirtAddr) -> Virt {
    virt_addr.into()
}

let virt = Virt::new(0x123ABC)?;
let virt_addr: VirtAddr = virt.into();
let virt2: Virt = virt_addr.into();
assert!(virt == virt2);
assert!(virt == f(virt.into()));
```

Rust поддерживает полиморфизм по возвращаемому значению, поэтому можно преобразовывать через
[`Virt::into()`](../../doc/ku/memory/addr/type.Virt.html#method.into)
в контексте, который требует
[`x86_64::VirtAddr`](../../doc/x86_64/addr/struct.VirtAddr.html), ---
`f(virt.into())` и наоборот --- `virt_addr.into()`.
Это преобразование делается через стандартный типаж
[`core::convert::From`](https://doc.rust-lang.org/nightly/core/convert/trait.From.html)
в [`Virt::from()`](../../doc/ku/memory/addr/type.Virt.html#method.from),
именно её зовёт [`x86_64::VirtAddr::into()`](../../doc/x86_64/addr/struct.VirtAddr.html#method.into).

## Некорректные физические и виртуальные адреса

`?` в `Virt::new(0x123ABC)?` означает проброс ошибки на уровень выше в стеке вызовов функций.
Дело в том, что не любое 64-битное число является валидным физическим или виртуальным адресом с точки зрения
[архитектуры x86-64](https://wiki.osdev.org/X86-64).
Поэтому [`Addr::new()`](../../doc/ku/memory/addr/struct.Addr.html#method.new) возвращает
[`Result<Addr>`](../../doc/ku/error/type.Result.html), в котором либо лежит адрес, либо ошибка
[`Error::InvalidArgument`](../../doc/ku/error/enum.Error.html#variant.InvalidArgument).
Оператор `?` соответственно либо возвращает адрес, либо пробрасывает ошибку выше.
Примеры получения ошибки есть в документации
[для `Phys`](../../doc/ku/memory/addr/type.Phys.html#%D0%9D%D0%B5%D0%BA%D0%BA%D0%BE%D1%80%D1%80%D0%B5%D0%BA%D1%82%D0%BD%D1%8B%D0%B5-%D0%B0%D0%B4%D1%80%D0%B5%D1%81%D0%B0) и
[для `Virt`](../../doc/ku/memory/addr/type.Virt.html#%D0%9D%D0%B5%D0%BA%D0%BA%D0%BE%D1%80%D1%80%D0%B5%D0%BA%D1%82%D0%BD%D1%8B%D0%B5-%D0%B0%D0%B4%D1%80%D0%B5%D1%81%D0%B0).

Поведение [`x86_64::VirtAddr::new()`](../../doc/x86_64/addr/struct.VirtAddr.html#method.new)
в случае ошибки отличается, ---
[эта функция паникует](../../doc/x86_64/addr/struct.VirtAddr.html#panics).
Это одна из причин, по которой мы не можем использовать всюду
[`x86_64::VirtAddr`](../../doc/x86_64/addr/struct.VirtAddr.html),
и вынуждены определять собственный тип
[`Virt`](../../doc/ku/memory/addr/type.Virt.html).

Когда мы дойдём до реализации системных вызовов, нам понадобится в ядре создавать виртуальные адреса из 64-х битных чисел, переданных из пользовательского процесса.
При этом мы не можем наложить аппаратных ограничений на эти числа, вроде того, чтобы потребовать от них быть валидными адресами.
То есть, ядро должно программно валидировать все приходящие ему из пользовательских процессов данные.
Если мы в ядре во время обработки системного вызова без дополнительной валидации вызовем
`x86_64::VirtAddr::new(user_address)`, то ядро запаникует,
как только сбойный или зловредный пользовательский процесс передаст невалидный `user_address` в этот системный вызов.
Тогда работа компьютера остановится и пострадают все процессы, а не только виноватый.
Вместо паники ядро должно вернуть ошибку пользовательскому процессу.
А для этого нужно эту ошибку прокинуть по всему стеку вызовов от места возникновения до точки входа в системные вызовы в ядре.

По той же причине ядро имеет право паниковать только при обнаружении некорректной работы самого себя или оборудования.
А значит, паникующими функциями в ядре пользоваться нужно очень внимательно.

С другой стороны, функции преобразования указателей и ссылок в
[`Virt`](../../doc/ku/memory/addr/type.Virt.html)

- [`fn Virt::from_ptr<T>(ptr: *const T) -> Virt`](../../doc/ku/memory/addr/type.Virt.html#method.from_ptr) и
- [`fn from_ref<T>(x: &T) -> Virt`](../../doc/ku/memory/addr/type.Virt.html#method.from_ref)

паникуют на некорректных виртуальных адресах.
Потому что указатели и ссылки должны быть корректными виртуальными адресами.
Иначе, есть ошибка в том месте кода ядра, которое сформировало такую невалидную ссылку или указатель.

А вот функции преобразования
[`Virt`](../../doc/ku/memory/addr/type.Virt.html)
в константные и изменяемые указатели, ссылки и срезы

- [`fn try_into_ptr<T>(self) -> Result<*const T>`](../../doc/ku/memory/addr/type.Virt.html#method.try_into_ptr),
- [`fn try_into_mut_ptr<T>(self) -> Result<*mut T>`](../../doc/ku/memory/addr/type.Virt.html#method.try_into_mut_ptr),
- [`unsafe fn try_into_ref<T>(self) -> Result<&T>`](../../doc/ku/memory/addr/type.Virt.html#method.try_into_ref) и
- [`unsafe fn try_into_mut<T>(self) -> Result<&mut T>`](../../doc/ku/memory/addr/type.Virt.html#method.try_into_mut) и
- [`unsafe fn try_into_slice<T>(self, len: usize) -> Result<&[T]>`](../../doc/ku/memory/addr/type.Virt.html#method.try_into_slice)
- [`unsafe fn try_into_mut_slice<T>(self, len: usize) -> Result<&mut [T]>`](../../doc/ku/memory/addr/type.Virt.html#method.try_into_mut_slice)

возвращают
[`Error::InvalidArgument`](../../doc/ku/error/enum.Error.html#variant.InvalidArgument),
если исходный
[`Virt`](../../doc/ku/memory/addr/type.Virt.html)
не удовлетворяет выравниванию запрошенного типа `T`.
Методы, возвращающие ссылку, дополнительно возвращают
[`Error::InvalidArgument`](../../doc/ku/error/enum.Error.html#variant.InvalidArgument),
если исходный
[`Virt`](../../doc/ku/memory/addr/type.Virt.html)
равен нулю.
Кроме того, они помечены
[`unsafe`](https://doc.rust-lang.ru/book/ch19-01-unsafe-rust.html),
так как вызывающая сторона должна гарантировать, что по адресу из исходного
[`Virt`](../../doc/ku/memory/addr/type.Virt.html)
находится корректное значение запрошенного типа.
Или
[срез](https://doc.rust-lang.ru/book/ch04-03-slices.html)
корректных значений запрошенного типа, не менее заданного размера, для методов
[`Virt::try_into_slice()`](../../doc/ku/memory/addr/type.Virt.html#method.try_into_slice) и
[`Virt::try_into_mut_slice()`](../../doc/ku/memory/addr/type.Virt.html#method.try_into_mut_slice).
Этим список гарантий, которые должна предоставить вызывающая сторона, не исчерпывается.
Но это всё [требования самого Rust](https://doc.rust-lang.org/reference/behavior-considered-undefined.html) на ссылки, например:

- в программе не возникнет нарушения уникальности `&mut T` ссылок,
- по полученной [изменяемой](https://doc.rust-lang.ru/book/ch03-01-variables-and-mutability.html) ссылке не находится неизменяемый объект, и т.д.

Собственных требований эти функции не накладывают.


## Печать адресов

Нам часто захочется печатать адреса.
Чтобы и тут легко отличать виртуальные адреса от физических, они печатаются по-разному.
В качестве базового формата взят 16-ричный формат с префиксом `0x` и заглавными буквами `A`-`F`.
Но для физических адресов префикс `0x`
[заменён](../../doc/ku/memory/addr/trait.Tag.html#associatedconstant.HEX_PREFIX)
на `0p` (**p**hysical), а для виртуальных --- на `0v` (**v**irtual).
Например, `0p123ABC` --- физический адрес, а `0v123ABC` --- виртуальный.
К сожалению, легко глобально переопределить формат печати обычных указателей не получается.
Поэтому, в тех редких случаях, когда печатается стандартный
[указатель](https://doc.rust-lang.org/std/primitive.pointer.html),
его формат будет `0x123abc`.
Но при включённом пейджинге указатели могут быть только виртуальными, поэтому неоднозначности не возникает.

> Заглавные буквы используются чтобы все шестнадцатеричные цифры имели одинаковую высоту.
> Благодаря этому шестнадцатеричные числа лучше выделяются в тексте, особенно англоязычном, и их легче читать.
> `Compare 0xdeadbeaf and 0xDEADBEEF for example`.
> Отдельный шрифт не всегда применим, например для лога.
> Заметьте, что в современной технической литературе используются шрифты с одинаковой высотой десятичных цифр.
> А вот в художественной литературе попадаются [шрифты](https://art-nto.ru/800/600/http/legionfonts.com/img-fonts/zanerian-two/og-zanerian-two-font-abc.jpg), которые не обладают таким свойством.


## Страницы памяти

Физические страницы обычно называют фреймами.
Когда говорят про просто страницы, возникает неоднозначность --- могут иметься в виду фреймы или страницы виртуальной памяти.
Постараемся придерживаться слова страница только в отношении виртуальной памяти.
Физические фреймы памяти также не стоит путать с виртуальными страницами, поэтому для них тоже заведены отдельные несовместимые типы:
- [`Frame`](../../doc/ku/memory/frage/type.Frame.html) для физических фреймов;
- [`Page`](../../doc/ku/memory/frage/type.Page.html) для виртуальных страниц.

Они также являются мономорфизациями одного и того же обобщённого типа
[`Frage<T: Tag>`](../../doc/ku/memory/frage/struct.Frage.html) (**Fra**me or P**age**)[^1].
[`Frage`](../../doc/ku/memory/frage/struct.Frage.html) естественным образом связан с
[`Addr`](../../doc/ku/memory/addr/struct.Addr.html) --- собственным адресом.
Для преобразований используются
[`Frage::new(address: Addr) -> Result<Frage>`](../../doc/ku/memory/frage/struct.Frage.html#method.new) и
[`Frage::address(&self) -> Addr`](../../doc/ku/memory/frage/struct.Frage.html#method.address).

Кроме того, ещё удобно нумеровать фреймы и страницы, поэтому
[`Frage`](../../doc/ku/memory/frage/struct.Frage.html) поддерживает преобразования из/в свой номер ---
[`Frage::from_index(index: usize) -> Frage`](../../doc/ku/memory/frage/struct.Frage.html#method.from_index),
[`Frage::index(self) -> usize`](../../doc/ku/memory/frage/struct.Frage.html#method.index).

Поддерживать будем только 4KiB-ные страницы, вы встретите в коде константу
[`Page::SIZE`](../../doc/ku/memory/frage/struct.Frage.html#associatedconstant.SIZE).
Конечно, в таком случае преобразования адреса страницы из/в индекс тривиально, --- это просто умножение/деление на
`4096 = 4 *`[`KiB`](../../doc/ku/memory/size/constant.KiB.html).
Но стоит пользоваться именно именованными функциями, а не просто арифметической операцией, так как это более явно говорит о намерениях и более понятно читателю кода.

При поиске по документации полезно помнить, что
[`Frame`](../../doc/ku/memory/frage/type.Frame.html) и
[`Page`](../../doc/ku/memory/frage/type.Page.html) ---
это мономорфизации
[`Frage`](../../doc/ku/memory/frage/struct.Frage.html).
Потому что общие методы реализованы в обобщённом типе
[`Frage`](../../doc/ku/memory/frage/struct.Frage.html),
и в документации показываются только там.
В документации на
[`Frame`](../../doc/ku/memory/frage/type.Frame.html) и
[`Page`](../../doc/ku/memory/frage/type.Page.html)
будут только методы специфичные для них, общих методов из
[`Frage`](../../doc/ku/memory/frage/struct.Frage.html)
не будет.

---

[^1] Объявляется конкурс на более элегантное название.


## Печать переменных для страниц

Печать переменных для страниц базируется на индексе и адресе, в формате `индекс @ адрес` для [`Display (если нажать на [src] справа, вы увидите реализацию этого в коде)`](../../doc/ku/memory/frage/struct.Frage.html#impl-Display).
При этом адрес выдаётся в ранее упомянутом формате, поэтому из него легко понять распечатана переменная физического фрейма или виртуальной страницы.
Кроме того, [в формате `Debug`](../../doc/ku/memory/frage/struct.Frage.html#impl-Debug)
всё это снабжается явным указанием типа и получается формат
[`тип`](../../doc/ku/memory/addr/trait.Tag.html#associatedconstant.FRAGE_NAME)`(индекс @ адрес)`.
Например: `Frame(12492 @ 0p30CC000)` для `Debug` и `12492 @ 0p30CC000` для `Display`,
`Page(4503599627370148 @ 0vFFFFFFFFFFEA4000)` для `Debug` и `4503599627370148 @ 0vFFFFFFFFFFEA4000` для `Display`.


## Блоки памяти

[`Block<T>`](../../doc/ku/memory/block/struct.Block.html) --- это абстракция куска физической или виртуальной памяти, постраничного или произвольного:

- `Block<Phys>` --- произвольный кусок физической памяти;
- `Block<Virt>` --- произвольный кусок виртуальной памяти;
- `Block<Frame>` --- набор последовательных физических фреймов;
- `Block<Page>` --- набор последовательных виртуальных страниц.

`Block` не владеет описываемой им памятью.

Реализация [`Block`](../../doc/ku/memory/block/struct.Block.html) --- это просто пара индексов.
[`Block::start`](../../doc/ku/memory/block/struct.Block.html#structfield.start) --- индекс первого элемента в блоке.
[`Block::end`](../../doc/ku/memory/block/struct.Block.html#structfield.end) --- индекс следующего за последним элементом блока.
То есть, как обычно, это полуоткрытый интервал элементов.
Основные его методы:

- [`fn Block::new(start: T, end: T) -> Result<Self>`](../../doc/ku/memory/block/struct.Block.html#method.new) --- создаёт блок для полуоткрытого интервала `[start, end)` базового типа `T`, который может быть `Phys`, `Virt`, `Frame` или `Page`.
- [`fn Block::from_index(start: usize, end: usize) -> Result<Self>`](../../doc/ku/memory/block/struct.Block.html#method.from_index) --- создаёт блок для полуоткрытого интервала `[start, end)` базового типа `T`, который задаётся своими индексами --- номерами байт для `Phys` и `Virt`, номерами фреймов для `Frame` и номерами страниц для `Page`.
- [`fn Block::from_index_u64(start: u64, end: u64) -> Result<Self>`](../../doc/ku/memory/block/struct.Block.html#method.from_index_u64) --- аналогичен [`Block::from_index()`](../../doc/ku/memory/block/struct.Block.html#method.from_index), но индексы имеют тип [`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html) вместо [`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html).
- [`fn Block::count() -> usize`](../../doc/ku/memory/block/struct.Block.html#method.count) --- количество элементов в блоке, равно `Block::end() - Block::start()`.
- [`fn Block::size() -> usize`](../../doc/ku/memory/block/struct.Block.html#method.size) --- размер блока в байтах, равно количеству элементов в блоке, умноженному на размер элемента.
- [`fn Block::start_address() -> Addr`](../../doc/ku/memory/block/struct.Block.html#method.start_address) --- адрес первого элемента блока.
- [`fn Block::end_address() -> Result<Addr>`](../../doc/ku/memory/block/struct.Block.html#method.end_address) --- адрес следующего за последним элементом блока. Может не существовать из-за переполнения, поэтому с ним нужно обращаться осторожно.
- [`fn Block::contains(element: T) -> bool`](../../doc/ku/memory/block/struct.Block.html#method.contains) --- возвращает `true`, если блок содержит заданный элемент.
- [`fn Block::contains_address(addr: Addr) -> bool`](../../doc/ku/memory/block/struct.Block.html#method.contains) --- возвращает `true`, если блок содержит заданный адрес.
- [`fn Block::tail(count: usize) -> Option<Self>`](../../doc/ku/memory/block/struct.Block.html#method.contains) --- откусывает от блока хвост с заданным количеством элементов, и возвращает его в виде нового блока. Старое значение исходного блока таким образом разбивается на дизъюнктное объединение нового значение исходного блока и возвращаемого значения. Если исходный блок содержит менее `count` единиц базового типа `T`, метод не меняет исходный блок и возвращает `None`.

По `Block::<Frame>` или `Block::<Page>` [можно проитерироваться](../../doc/ku/memory/block/struct.Block.html#impl-IntoIterator), вызвав [`Block::<Frage>::into_iter()`](../../doc/ku/memory/block/struct.Block.html#method.into_iter).
Полученный итератор будет последовательно выдавать очередной `Frame` или `Page`.

`Block::<Virt>` может быть создан из
указателя, ссылки или
[среза](https://doc.rust-lang.ru/book/ch04-03-slices.html):

- [`fn Block::<Virt>::from_ptr<T>(x: *const T) -> Block<Virt>`](../../doc/ku/memory/block/struct.Block.html#method.from_ptr),
- [`fn Block::<Virt>::from_ref<T>(x: &T) -> Block<Virt>`](../../doc/ku/memory/block/struct.Block.html#method.from_ptr),
- [`fn Block::<Virt>::from_slice<T>(x: &[T]) -> Block<Virt>`](../../doc/ku/memory/block/struct.Block.html#method.from_slice)

`Block::<Virt>` и `Block::<Page>` могут быть превращены в константные и изменяемые указатели, ссылки и слайсы:

- [`fn Block::try_into_ptr<Q>() -> Result<*const Q>`](../../doc/ku/memory/block/struct.Block.html#method.try_into_ptr)
- [`fn Block::try_into_mut_ptr<Q>() -> Result<*mut Q>`](../../doc/ku/memory/block/struct.Block.html#method.try_into_mut_ptr)
- [`unsafe fn Block::try_into_ref<Q>() -> Result<&Q>`](../../doc/ku/memory/block/struct.Block.html#method.try_into_ref)
- [`unsafe fn Block::try_into_mut<Q>() -> Result<&Q>`](../../doc/ku/memory/block/struct.Block.html#method.try_into_mut)
- [`unsafe fn Block::try_into_slice<Q>() -> Result<&[Q]>`](../../doc/ku/memory/block/struct.Block.html#method.try_into_slice)
- [`unsafe fn Block::try_into_mut_slice<Q>() -> Result<&mut [Q]>`](../../doc/ku/memory/block/struct.Block.html#method.try_into_mut_slice)

Эти методы аналогичны соответствующим методам `Virt`.
Использовать `Block` для подобных целей предпочтительнее, чем `Virt`,
так как `Block` знает свой размер в памяти и делает дополнительные проверки на него.
И, по той же причине, не требует указания количества элементов при преобразованиях в срезы.

У `Block::<Addr>` есть ещё метод

- [`fn Block::<Addr>::enclosing() -> Block<Frage>`](../../doc/ku/memory/block/struct.Block.html#method.enclosing), который для заданного блока виртуальных или физических адресов возвращает минимальный содержащий его блок виртуальных страниц или физических фреймов соответственно.


## Две половины виртуального адресного пространства

У виртуальных адресов в [архитектуре x86-64](https://en.wikipedia.org/wiki/X86-64)
есть особенность.
Множество их допустимых значений разбивается на
[две половины](https://en.wikipedia.org/wiki/X86-64#Virtual_address_space_details).
В данный момент реально используются 48--битные виртуальные адреса и получаются такие диапазоны:

- "нижняя половина" от `0v0000_0000_0000_0000` до `0v0000_7FFF_FFFF_FFFF` включительно и
- "верхняя половина" от `0vFFFF_8000_0000_0000` до `0vFFFF_FFFF_FFFF_FFFF` включительно.

То есть, виртуальные адреса скорее ведут себя как 48--битные **знаковые** числа.
Но, в обычных языках таких типов нет, и в целом удобнее пользоваться для адресов беззнаковыми числами.
К тому же для физических адресов ничего подобного нет, у них единый диапазон.

Поэтому при работе с виртуальными адресами нужно проявлять осторожность.
Следующий за виртуальным адресом `0v0000_7FFF_FFFF_FFFF` --- это
не `0v0000_8000_0000_0000`, а `0vFFFF_8000_0000_0000`.
А адрес `0v0000_8000_0000_0000` не валиден и приведёт к исключению процессора.
А расстояние между этими последовательными адресами не 1, как между другими последовательными адресами.
Или по-другому, размер объекта, который начался в "нижней половине", а закончился в "верхней половине"
не соответствует разности между битовыми представлениями его
конца --- следующего адреса за последним, принадлежащим объекту, --- и его начала.

Кроме того, чтобы не рисковать получить какую-нибудь ошибку из-за переполнения,
пересекать границу между `0vFFFF_FFFF_FFFF_FFFF` и `0v0000_0000_0000_0000` тоже не стоит.

То есть, чтобы работать без риска ошибок, стоит ввести ограничение:

- Любой объект в виртуальном адресном пространстве должен целиком содержаться либо в "нижней половине", либо в "верхней половине". И не должен пересекать границы между ними --- ни границу `0v0000_7FFF_FFFF_FFFF/0vFFFF_8000_0000_0000`, ни границу `0vFFFF_FFFF_FFFF_FFFF/0v0000_0000_0000_0000`.

`Block<Virt>` и `Block<Page>` учитывают это ограничение и возвращают ошибку
[`Error::InvalidArgument`](../../doc/ku/error/enum.Error.html#variant.InvalidArgument),
если попытаться создать блок с началом и концом в разных половинах виртуального адресного пространства.


## usize versus u64

Для низкоуровневого хранения величин, вроде адресов, номеров и т.д. можно было бы использовать любой из этих римитивных типов:

- [`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html) --- целочисленный тип с фиксированным количеством бит, подходящий для регистров [x86-64](https://wiki.osdev.org/X86-64) и часто использующийся при взаимодействии с железом в этой архитектуре.
- [`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html) --- языковая абстракция регистра в текущей архитектуре, размера объекта в памяти и, фактически, указателя. (Если закрыть глаза на [far pointer](https://en.wikipedia.org/wiki/Far_pointer), с которыми мы почти не столкнёмся. И который в любом случае не 64--битный.)

Тип [`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html) хорош своей фиксированностью.
Если нужно, чтобы код работал со структурами данных фиксированного размера конкретной фиксированной платформы,
такими как таблицы страниц, GDT, и т.п., этот тип хорошо подходит.
Особенно, если хочется компилироваться, в том числе, не под целевую платформу, но при этом работать с её структурами.
Подобная задача, например, возникает при эмуляции целевой платформы под платформой с другой архитектурой.
Поэтому [`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html) --- выбор библиотек
[x86](../../doc/x86/index.html) и [x86_64](../../doc/x86_64/index.html),
которые реализуют работу с конкретной аппаратной платформой.

Однако аналогично другим языкам высокого уровня, в Rust в случаях,
когда нужно указать размер объекта в памяти, индекс в срезе и тому подобного,
для переносимости кода между архитектурами используется тип
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html).
Так как он привязан не к какой-то конкретной платформе, а к текущей.
Поэтому, если в коде нужно работать с
[`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html),
то в нём часто будут выполняться преобразования между
[`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html) и
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html).
В языках вроде C или C++, которые спокойно относятся к преобразованиям между целыми даже разного размера и
даже к преобразованиям, теряющим часть бит информации,
это не отобразилось бы на исходном коде.
Только привело бы к трудноуловимым ошибкам, когда потеря информации при преобразовании не является умышленной.
Rust строже относится к работе с типами, и в нём преобразования между разными целыми типами нужно делать явно.

Nikka не является эмулятором и запускается на той же платформе, для которой строит предопределённые железом структуры данных.
Поэтому она может выбрать как
[`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html), так и
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html).
Для удобства работы, чтобы явных преобразований между
[`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html) и
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html)
делать как можно меньше,
в Nikka выбор сделан в пользу использования
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html).
В том числе в случаях, в которых в [архитектуре x86-64](https://wiki.osdev.org/X86-64)
требуется 64-битная величина.

К сожалению, полностью от преобразований между
[`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html) и
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html)
уйти не получается.
Например, они иногда возникают в тех местах, где используются библиотеки
[x86](../../doc/x86/index.html) и [x86_64](../../doc/x86_64/index.html).
Писать `value as type` в таких случаях некомфортно, так как в общем случае `as` может терять информацию.
Например, `12345u16 as u8` молча теряет информацию, поэтому лучше

- либо написать `u8::try_from(x)` и обработать ошибку,
- либо явно срезать лишние биты --- `u8::try_from(x & 0xFF).expect("...")`.

А `as` оставить для преобразований, где без него не обойтись, например между ссылками и указателями, указателями и
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html) и т.п.
В коде, пестрящем `as`, глаз замыливается и становится ещё труднее увидеть ошибку,
вызванную потерей информации в одном из `as`.

Для самых частых преобразований, собственно, между
[`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html) и
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html),
есть вспомогательные функции:

- [`ku::memory::size::into_usize(x: u64)`](../../doc/ku/memory/size/fn.into_usize.html)
- [`ku::memory::size::into_u64(x: usize)`](../../doc/ku/memory/size/fn.into_u64.html)

Во время компиляции они на всякий случай проверяют, что входной и целевой тип имеют одинаковый размер.
Поэтому гарантируют, что потери информации при преобразованиях не будет.

Для удобства, высокоуровневые типы, для которых это может пригодиться, предоставляют конструкторы из
[`u64`](https://doc.rust-lang.org/nightly/core/primitive.u64.html),
в дополнение к основным конструкторам из
[`usize`](https://doc.rust-lang.org/nightly/core/primitive.usize.html).
Например:

- [`Virt::new_u64(addr: u64)`](../../doc/ku/memory/addr/struct.Addr.html#method.new_u64) и
- [`Block::from_index_u64(start: u64, end: 64)`](../../doc/ku/memory/block/struct.Block.html#method.from_index_u64).
