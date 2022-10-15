## Разделяемая память

Для общения между разными процессами и между кодом ядра и кодом режима пользователя внутри одного процесса необходим тот или иной метод
[межпроцессного взаимодействия](https://en.wikipedia.org/wiki/Inter-process_communication).
В Nikka используется [разделяемая память](https://en.wikipedia.org/wiki/Shared_memory),
организованная в виде [циклического буфера](https://en.wikipedia.org/wiki/Circular_buffer).
Для удобства в нём сделаны две доработки.

### Непрерывный циклический буфер

Обычный циклический буфер оборачивается вокруг своего конца, но адресовать память нужно линейно.
Поэтому если блок данных пересекает границу буфера, его нужно адресовать двумя частями --- от начала блока данных до конца буфера и от начала буфера до конца блока данных.
Это неудобно, и некоторые циклические буферы предоставляют метод для сдвига данных внутри буфера, чтобы выровнять содержащиеся данные на границу буфера, например это делает метод
[`alloc::collections::vec_deque::VecDeque::make_contiguous()`](https://doc.rust-lang.org/nightly/alloc/collections/vec_deque/struct.VecDeque.html#method.make_contiguous).

Мы поступим [другим способом](https://fgiesen.wordpress.com/2012/07/21/the-magic-ring-buffer/).
Отобразим в виртуальную память буфер дважды подряд. Тогда, при пересечении границы буфера, циклическое оборачивание адресов делать не будет нужно.
Точнее, за нас его сделает механизм виртуальной памяти.
В результате любой отрезок буфера, размера не превышающего ёмкость буфера, и начинающийся по виртуальному адресу внутри первой копии буфера, может быть использован как непрерывный.
Заплатим мы за это тем, что размер буфера должен быть кратен размеру страницы памяти, а также двойным расходом виртуального адресного пространства.


### Транзакции

Добавим транзакции к интерфейсу буфера.
Каждая транзакция будет либо пишущей, либо читающей.

Пишущие транзакции будут удобны в следующей ситуации.
Мы будем писать логически атомарный блок данных по кусочкам.
И, возможно, он не влезет целиком.
А знать заранее полный размер мы не будем.
Тогда будет удобно сбросить транзакцию записи.
Кроме того, если исполнение кода переключится между записывающей и читающей сторонами, читающая сторона не увидит в буфере только часть атомарного блока данных.

Для читающей стороны транзакции полезны другим.
Читающая сторона в некоторых случаях может не копировать данные из буфера к себе, а обрабатывать данные прямо в буфере.
И отметить факт обработанности коммитом читающей транзакции только когда ей больше эти данные не будут нужны.
Однако тут нужно быть осторожным.
Если читающая сторона не должна доверять пишущей, как в случае если читает код ядра, а пишет код пользователя, она не должна, например сначала провалидировать структуру данных в буфере, а после спокойно ей пользоваться.
Потому что пишущая сторона может подменить данные после валидации, но до их использования читающей стороной.
Ядро может препятствовать такой атаке за счёт того, что не даст процессор коду пользователя во время работы читающей транзакции.
Другой вариант --- скопировать данные из буфера в собственную, не разделяемую, память.
А валидировать и использовать их уже там.


### Структура циклического буфера

В файле [`ku/src/ring_buffer.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/ring_buffer.rs) определён [циклический буфер](https://en.wikipedia.org/wiki/Circular_buffer)

```rust
pub struct RingBuffer {
    buf: &'static mut RingBufferRaw,
    head: AtomicUsize,
    tail: AtomicUsize,
    stats: [RingBufferStats; 2],
}
```

ёмкости `RingBuffer::REAL_SIZE`.
Его поля:

- `RingBuffer::buf` --- ссылка на память с данными, которые хранятся в буфере.
- `RingBuffer::head` --- номер первого, содержащегося в буфере байта данных.
- `RingBuffer::tail` --- номер следующего за последним, содержащимся в буфере байте данных.

Поле `RingBuffer::stats` поддерживает статистики чтения и записи в буфер:

```rust
pub struct RingBufferStats {
    commited: AtomicUsize,
    commits: AtomicUsize,
    dropped: AtomicUsize,
    drops: AtomicUsize,
    errors: AtomicUsize,
    txs: AtomicUsize,
}
```

- `RingBufferStats::txs` --- количество транзакций чтения либо записи соответственно.
- `RingBufferStats::commits` --- количество закоммиченных транзакций соответствующего типа.
- `RingBufferStats::drops` --- количество оборванных (dropped, rolled back, aborted) транзакций соответствующего типа.
- `RingBufferStats::commited` --- количество байт, прочитанных или записанных в закоммиченных транзакциях.
- `RingBufferStats::dropped` --- количество байт, прочитанных или записанных в оборванных транзакциях.
- `RingBufferStats::errors` --- количество ошибок в транзакциях.

Методы `RingBuffer` создают транзакции:

- `RingBuffer::read_tx()` --- читающую;
- `RingBuffer::write_tx()` --- пишущую.

Транзакции устроены так:

```rust
pub struct RingBufferTx<'a, T: Tag> {
    ring_buffer: &'a mut RingBuffer,
    head: usize,
    tail: usize,
    bytes: usize,
    _tag: PhantomData<T>,
}
```

Они хранят:

- Ссылку `RingBufferTx::ring_buffer` на исходный `RingBuffer`.
- `RingBufferTx::head` и `RingBufferTx::tail` --- актуальные в рамках транзакции значения, в момент старта транзакции инициализирующиеся из полей `RingBuffer::head`.
- `RingBufferTx::bytes` --- количество байт, прочитанных или записанных на текущий момент в данной транзакции.
- Тег `RingBufferTx::_tag`, отличающий пишущие транзакции от читающих.


### Задача 1 --- читающая транзакция

Реализуйте метод

```rust
fn RingBufferTx<'_, ReadTag>::read(&mut self) -> &[u8]
```

который возвращает в виде среза все доступные на момент запуска читающей транзакции байты из буфера, обновляя поля только самой транзакции `RingBufferTx`.

И метод

```rust
fn RingBufferTx<'_, ReadTag>::commit(&mut self)
```

который коммитит читающую транзакцию, записывая обновлённое значение
`RingBuffer::head` и статистику `RingBuffer::read_stats()` в поля `RingBuffer`.


### Задача 2 --- пишущая транзакция

Реализуйте метод

```rust
fn RingBufferTx<'_, WriteTag>::write(&mut self, data: &[u8]) -> Result<()>
```

которая копирует в буфер байты среза `data`, обновляя поля самой транзакции `RingBufferTx` и статистики `RingBuffer::write_stats()`, но не трогает поля `RingBuffer::head` и `RingBuffer::tail`.
Если в буфере не остаётся места под `data` верните ошибку

```rust
pub enum Error {
    Overflow {
        capacity: usize,
        len: usize,
        exceeding_object_len: usize,
    },
}
```

С информацией

- Об остававшемся месте в буфере на момент старта транзакции. То есть, полной доступной для транзакции ёмкости, --- `Error::Overflow::capacity`.
- О уже записанном ранее в рамках той же транзакции объёме --- `Error::Overflow::len`.
- О размере объекта, который не влез --- `Error::Overflow::exceeding_object_len`.

Вам может пригодиться метод
[`copy_from_slice()`](https://doc.rust-lang.org/nightly/core/primitive.slice.html#method.copy_from_slice)
срезов.

Реализуйте метод

```rust
fn RingBufferTx<'_, WriteTag>::commit(&mut self)
```

который коммитит пишущую транзакцию, обновляя значение
`RingBuffer::tail` и статистику `RingBuffer::write_stats()` в полях `RingBuffer`.


### Задача 3 --- сброс транзакции

Реализуйте типаж [`core::ops::Drop`](https://doc.rust-lang.org/nightly/core/ops/trait.Drop.html) для транзакций обоих типов --- метод

```rust
fn RingBufferTx::drop(&mut self)
```

который обновляет соответствующие статистики `RingBufferTx::ring_buffer.stats[T::STATS_INDEX]`,
если в транзакции был прочитан или записан хотя бы один байт.


### Задача 4 --- отображение буфера в память процесса

Реализуйте функцию

```rust
fn map_log(address_space: &mut AddressSpace) -> Result<RingBuffer>
```

в файле [`kernel/src/process/mod.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/mod.rs).
Она должна реализовать двойное отображение памяти буфера в адресное пространство `address_space` процесса.
То есть, она должна выделить
`RingBuffer::REAL_SIZE` байт в физической памяти и
`RingBuffer::MAPPED_SIZE` --- в виртуальной.
И построить отображение выделенных физических фреймов дважды подряд в пространство `address_space`.


### Проверьте себя

Теперь должен заработать тест `stress()` в файле [`kernel/src/tests/ring_buffer.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/ring_buffer.rs):

```console
kernel::tests::ring_buffer::stress--------------------------
15:09:02.202 0 D iteration = 0; read_stats = RingBufferStats { commited: 0, commits: 0, dropped: 0, drops: 0, errors: 0, txs: 0 }; write_stats = RingBufferStats { commited: 0, commits: 0, dropped: 0, drops: 0, errors: 0, txs: 0 }
15:09:03.126 0 D iteration = 1000; read_stats = RingBufferStats { commited: 1191484, commits: 438, dropped: 1306871, drops: 442, errors: 0, txs: 904 }; write_stats = RingBufferStats { commited: 1192706, commits: 567, dropped: 678585, drops: 435, errors: 651, txs: 1398 }
15:09:04.038 0 D iteration = 2000; read_stats = RingBufferStats { commited: 2357303, commits: 883, dropped: 2401911, drops: 819, errors: 0, txs: 1764 }; write_stats = RingBufferStats { commited: 2359122, commits: 1121, dropped: 1426607, drops: 883, errors: 1263, txs: 2762 }
15:09:04.919 0 D iteration = 3000; read_stats = RingBufferStats { commited: 3523519, commits: 1344, dropped: 3583669, drops: 1213, errors: 0, txs: 2651 }; write_stats = RingBufferStats { commited: 3527312, commits: 1671, dropped: 2039230, drops: 1254, errors: 1874, txs: 4097 }
15:09:05.821 0 D iteration = 4000; read_stats = RingBufferStats { commited: 4696968, commits: 1776, dropped: 4824359, drops: 1611, errors: 0, txs: 3515 }; write_stats = RingBufferStats { commited: 4696968, commits: 2237, dropped: 2690684, drops: 1644, errors: 2484, txs: 5453 }
15:09:06.698 0 D iteration = 5000; read_stats = RingBufferStats { commited: 5859816, commits: 2206, dropped: 5997402, drops: 2001, errors: 0, txs: 4378 }; write_stats = RingBufferStats { commited: 5859816, commits: 2811, dropped: 3301265, drops: 2021, errors: 3097, txs: 6816 }
15:09:07.619 0 D iteration = 6000; read_stats = RingBufferStats { commited: 7078240, commits: 2657, dropped: 7114728, drops: 2393, errors: 0, txs: 5253 }; write_stats = RingBufferStats { commited: 7078783, commits: 3400, dropped: 4011499, drops: 2424, errors: 3733, txs: 8213 }
15:09:08.545 0 D iteration = 7000; read_stats = RingBufferStats { commited: 8313431, commits: 3104, dropped: 8435844, drops: 2832, errors: 0, txs: 6173 }; write_stats = RingBufferStats { commited: 8313462, commits: 3982, dropped: 4718830, drops: 2854, errors: 4417, txs: 9661 }
15:09:09.401 0 D iteration = 8000; read_stats = RingBufferStats { commited: 9457469, commits: 3537, dropped: 9491752, drops: 3199, errors: 0, txs: 7006 }; write_stats = RingBufferStats { commited: 9458642, commits: 4539, dropped: 5338305, drops: 3279, errors: 4991, txs: 10976 }
15:09:10.307 0 D iteration = 9000; read_stats = RingBufferStats { commited: 10635416, commits: 3972, dropped: 10666640, drops: 3611, errors: 0, txs: 7880 }; write_stats = RingBufferStats { commited: 10639354, commits: 5114, dropped: 6080415, drops: 3732, errors: 5631, txs: 12382 }
kernel::tests::ring_buffer::stress----------------- [passed]
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/mod.rs |   24 ++++++++++++++++++++++-
 ku/src/ring_buffer.rs     |   47 +++++++++++++++++++++++++++++++++++++++++-----
 2 files changed, 65 insertions(+), 6 deletions(-)
```
