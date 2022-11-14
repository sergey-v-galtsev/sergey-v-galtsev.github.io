## Таблица процессов

Код таблицы процессов находится в файле [`kernel/src/process/table.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/process/table.rs).


### Идентификаторы процессов [`ku::process::pid::Pid`](../../doc/ku/process/pid/enum.Pid.html)

В файле [`ku/src/process/pid.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/process/pid.rs) описана структура

```rust
#[derive(Clone, Copy, Eq, PartialEq)]
pub enum Pid {
    Current,
    Id {
        slot: u16,
        epoch: u32,
    },
}
```

Она позволяет отдельно указывать либо
[`Pid::Current`](../../doc/ku/process/pid/enum.Pid.html#variant.Current) ---
текущий процесс, это удобно для использования тех системных вызовов, что принимают на вход
[`Pid`](../../doc/ku/process/pid/enum.Pid.html).
Либо конкретный процесс
[`Pid::Id`](../../doc/ku/process/pid/enum.Pid.html#variant.Id),
идентификатор которого состоит из номера слота в таблице процессов
[`slot`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.slot)
и эпохи этого слота
[`epoch`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.epoch).
Поле [`slot`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.slot) позволяет быстро находить процесс по его идентификатору в таблице процессов, ---
она может быть устроена как вектор, а не как хеш-таблица.
А [`epoch`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.epoch) позволяет сделать идентификаторы процессов уникальными на протяжении всего времени работы системы.

Например, в Unix есть гонка, из-за того что одно и то же значение `pid_t` может в разное время ссылаться на разные процессы.
Если вы хотите что-то сделать с определённым процессом, и записали его `pid_t` себе,
то конкурентно он может прекратить своё исполнение, а ядро выдаст то же самое значение `pid_t` новому процессу.
Теперь вы что-то делаете с процессом по сохранённому у себя `pid_t`, например, посылаете ему сигнал `SIGKILL`, но это уже другой процесс.
Реализации пытаются уменьшить вероятность таких гонок за счёт выдачи `pid_t` по кругу.
В Nikka для избежания гонки, каждый раз, когда новый процесс получает тот же
[`slot`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.slot),
он получает на единицу большее значение
[`epoch`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.epoch).
За это отвечает метод
[`Pid::next_epoch()`](../../doc/ku/process/pid/enum.Pid.html#method.next_epoch).

Другие методы [`Pid`](../../doc/ku/process/pid/enum.Pid.html):

- [`Pid::new(slot)`](../../doc/ku/process/pid/enum.Pid.html#method.new) создаёт [`Pid`](../../doc/ku/process/pid/enum.Pid.html) с начальным значением [`epoch`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.epoch) для заданного `slot`.
- [`Pid::slot()`](../../doc/ku/process/pid/enum.Pid.html#method.slot) возвращает значение [`slot`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.slot).
- [`Pid::into_usize()`](../../doc/ku/process/pid/enum.Pid.html#method.into_usize) и [`Pid::from_usize()`](../../doc/ku/process/pid/enum.Pid.html#method.from_usize) позволяют сериализовать [`Pid`](../../doc/ku/process/pid/enum.Pid.html) в регистр для передачи в системные вызовы.


### Слот таблицы процессов [`kernel::process::table::Slot`](../../doc/kernel/process/table/enum.Slot.html)

Таблица процессов состоит из фиксированного количества слотов

```rust
enum Slot {
    Free {
        pid: Pid,
        next: Option<Pid>,
    },
    Occupied {
        process: Mutex<Process>,
    },
}
```

Каждый из которых либо свободен ---
[`Slot::Free`](../../doc/kernel/process/table/enum.Slot.html#variant.Free),
либо занят ---
[`Slot::Occupied`](../../doc/kernel/process/table/enum.Slot.html#variant.Occupied).

Свободные слоты содержат поле
[`pid`](../../doc/kernel/process/table/enum.Slot.html#variant.Free.field.pid)
для того, что помнить эпоху последнего процесса, занимавшего этот слот.
И выдать следующему процессу, который попадёт в тот же слот, номер эпохи на единицу больше.
Также свободные слоты провязаны в список, чтобы удобнее было за \\(O(1)\\)
находить какой-нибудь свободный слот под новый процесс.

Занятые слоты содержат спинлок
[`process`](../../doc/kernel/process/table/enum.Slot.html#variant.Occupied.field.process).
Когда нам понадобится обратиться к процессу, нужно будет захватить его спинлок,
чтобы избежать неконсистентного конкурентного изменения структуры
[`kernel::process::process::Process`](../../doc/kernel/process/process/struct.Process.html).
Чтобы обратиться с самой таблице процессов
[`static ref kernel::process::table::TABLE: Mutex<Table>`](../../doc/kernel/process/table/struct.TABLE.html),
конечно тоже нужно захватить её общий спинлок.
Но не хочется держать заблокированным спинлок всей таблицы, пока мы работаем со структурой
[`kernel::process::process::Process`](../../doc/kernel/process/process/struct.Process.html)
одного её процесса.
Поэтому, таблица будет по идентификатору процесса
[`Pid`](../../doc/ku/process/pid/enum.Pid.html)
фактически обменивать заблокированный спинлок `Mutex<Table>` на заблокированный спинлок процесса `Mutex<Process>`.
После чего вызывающий код сможет работать с процессом конкурентно другому коду,
который сможет захватить уже освободившийся `Mutex<Table>`.


### Задача 5 --- таблица процессов


#### Инициализация таблицы

Реализуйте [метод](../../doc/kernel/process/struct.Table.html#method.new)

```rust
fn Table::new(len: usize) -> Self
```

Он создаёт таблицу процессов
[`Table::table`](../../doc/kernel/process/struct.Table.html#structfield.table)
размера `len` элементов, заполняя её пустыми слотами
[`Slot::Free`](../../doc/kernel/process/table/enum.Slot.html#variant.Free)
с соответствующими индексам слотов полями
[`Pid::Id::slot`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.slot).
Эти пустые слоты он провязывает в односвязный список с головой в поле
[`Table::free`](../../doc/kernel/process/struct.Table.html#structfield.free).
Чтобы избежать переаллокаций рекомендуется использовать метод
[`alloc::vec::Vec::with_capacity()`](https://doc.rust-lang.org/nightly/alloc/vec/struct.Vec.html#method.with_capacity).


#### Аллокация слота под процесс

Реализуйте [метод](../../doc/kernel/process/struct.Table.html#method.allocate)

```rust
fn Table::allocate(mut process: Process) -> Result<Pid>
```

Он должен выделить новому процессу `process` свободный слот таблицы.
Слот возьмите из головы списка свободных
[`Table::free`](../../doc/kernel/process/struct.Table.html#structfield.free).
Запишите в него `process`, а
[`pid`](../../doc/kernel/process/table/enum.Slot.html#variant.Free.field.pid)
слота запишите в структуру процесса `process` методом
[`Process::set_pid()`](../../doc/kernel/process/process/struct.Process.html#method.set_pid).
Если же свободного слота нет, верните ошибку
[`Error::NoProcessSlot`](../../doc/kernel/error/enum.Error.html#variant.NoProcessSlot).
В этом случае при выходе из метода, `process` будет автоматически уничтожен, а все его ресурсы освобождены.
Так как по сигнатуре
[`Table::allocate(process: Process)`](../../doc/kernel/process/struct.Table.html#method.allocate)
поглощает свой аргумент.
Этот и все последующие методы --- статические, они оперируют с глобальным
[синглтоном](https://en.wikipedia.org/wiki/Singleton_pattern)
[`static ref TABLE: Mutex<Table>`](../../doc/kernel/process/table/struct.TABLE.html),
захватывая его блокировку --- `TABLE.lock()`.
При реализации вам может пригодиться метод
[`Option::take()`](https://doc.rust-lang.org/nightly/core/option/enum.Option.html#method.take).


#### Получение процесса по его идентификатору

Реализуйте [метод](../../doc/kernel/process/struct.Table.html#method.get)

```rust
fn Table::get(pid: Pid) -> Result<MutexGuard<'static, Process>>
```

Он возвращает заблокированный спинлок
[`spin::mutex::MutexGuard`](../../doc/spin/mutex/struct.MutexGuard.html)
со структурой
[`kernel::process::process::Process`](../../doc/kernel/process/process/struct.Process.html),
соответствующей идентификатору `pid`.
Верните ошибку
[`Error::NoProcess`](../../doc/kernel/error/enum.Error.html#variant.NoProcess),
если процесса по указанному `pid` нет.
То есть, если либо не занят `pid.slot()`, либо в этом слоте у процесса другое значение
[`kernel::process::process::Process::pid()`](../../doc/kernel/process/process/struct.Process.html#method.pid)
(значит у него другая эпоха
[`Pid::epoch`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.epoch),
так как слот
[`Pid::slot`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.slot)
должен совпадать).
Вытащить значение
[`epoch`](../../doc/ku/process/pid/enum.Pid.html#variant.Id.field.epoch) тип
[`Pid`](../../doc/ku/process/pid/enum.Pid.html)
не позволяет, но зато он позволяет сравнивать два своих значения на равенство за счёт реализации
`#[derive(..., Eq, PartialEq)]`.

Так как размер таблицы процессов
[`static ref TABLE: Mutex<Table>`](../../doc/kernel/process/table/struct.TABLE.html)
после инициализации мы никода не меняем, и в частности не уменьшаем,
время жизни каждого её слота --- практически `'static`.
Который и указан в результирующем типе метода
[`Table::get()`](../../doc/kernel/process/struct.Table.html#method.get).
Но Rust не может проверить это самостоятельно.
Нам придётся пообещать ему это с помощью
[unsafe--функции](../../doc/kernel/process/table/fn.forge_static_lifetime.html)

```rust
unsafe fn forge_static_lifetime<T>(x: &T) -> &'static T
```

Естественно, чтобы вернуть
[`MutexGuard`](../../doc/spin/mutex/struct.MutexGuard.html)
нужно заблокировать процесс в слоте методом
[`Mutex::lock()`](../../doc/spin/mutex/struct.Mutex.html#method.lock).
Спинлок же самой
[`TABLE`](../../doc/kernel/process/table/struct.TABLE.html)
будет автоматически разблокирован аналогичным гардом при выходе из функции.
Получается, что она в начале захватывает низкогранулярную блокировку на всю таблицу
[`TABLE`](../../doc/kernel/process/table/struct.TABLE.html),
а потом повышает гранулярность этой блокировки до блокировки одного слота таблицы.
И вызывающая функции в дальнейшем работает уже с высокогранулярной блокировкой.


#### Освобождение слота с уничтожением процесса

Реализуйте [метод](../../doc/kernel/process/struct.Table.html#method.free)

``` rust
fn Table::free(process: MutexGuard<Process>)
```

Он:

- Удаляет процесс `process`.
- Инкрементирует эпоху в освободившемся слоте.
- Вставляет слот в голову списка свободных слотов [`Table::free`](../../doc/kernel/process/struct.Table.html#structfield.free).

Вам могут пригодиться функции
[`drop()`](https://doc.rust-lang.org/nightly/core/mem/fn.drop.html) и
[`core::mem::replace()`](https://doc.rust-lang.org/nightly/core/mem/fn.replace.html).


### Проверьте себя

Теперь должны заработать тесты `basic()` и `full_capacity()` в файле
[`kernel/src/tests/4-concurrency-5-table.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/kernel/src/tests/4-concurrency-5-table.rs):

```console
$ (cd kernel; cargo test --test 4-concurrency-5-table)
...
4_concurrency_5_table::basic--------------------------------
20:26:51 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:26:51 0 I duplicate; address_space = "process" @ 0p7E8A000
20:26:51 0 I switch to; address_space = "process" @ 0p7E8A000
20:26:51 0 I switch to; address_space = "base" @ 0p1000
20:26:51 0 I allocate; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E8A000, { rip: 0v0, rsp: 0v0 } }; process_count = 1
20:26:51 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:26:51 0 I duplicate; address_space = "process" @ 0p7E74000
20:26:51 0 I switch to; address_space = "process" @ 0p7E74000
20:26:51 0 I switch to; address_space = "base" @ 0p1000
20:26:51 0 I allocate; slot = Process { pid: 1:0, address_space: "1:0" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 2
20:26:51 0 D pid_1 = 0:0; pid_2 = 1:0
20:26:51 0 I free; slot = Process { pid: 0:0, address_space: "0:0" @ 0p7E8A000, { rip: 0v0, rsp: 0v0 } }; process_count = 1
20:26:51 0 I drop; address_space = "0:0" @ 0p7E8A000
20:26:51 0 I free; slot = Process { pid: 1:0, address_space: "1:0" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 0
20:26:51 0 I drop; address_space = "1:0" @ 0p7E74000
4_concurrency_5_table::basic----------------------- [passed]

4_concurrency_5_table::full_capacity------------------------
20:26:51 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:26:51 0 I duplicate; address_space = "process" @ 0p7E74000
20:26:51 0 I switch to; address_space = "process" @ 0p7E74000
20:26:51 0 I switch to; address_space = "base" @ 0p1000
20:26:51 0 I allocate; slot = Process { pid: 1:1, address_space: "1:1" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 1
20:26:51 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:26:51 0 I duplicate; address_space = "process" @ 0p7E79000
20:26:51 0 I switch to; address_space = "process" @ 0p7E79000
20:26:51 0 I switch to; address_space = "base" @ 0p1000
20:26:51 0 I allocate; slot = Process { pid: 0:1, address_space: "0:1" @ 0p7E79000, { rip: 0v0, rsp: 0v0 } }; process_count = 2
20:26:51 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:26:51 0 I duplicate; address_space = "process" @ 0p7E5C000
20:26:51 0 I switch to; address_space = "process" @ 0p7E5C000
20:26:51 0 I switch to; address_space = "base" @ 0p1000
20:26:51 0 I allocate; slot = Process { pid: 2:0, address_space: "2:0" @ 0p7E5C000, { rip: 0v0, rsp: 0v0 } }; process_count = 3
...
20:27:10.241 0 I drop; address_space = "process" @ 0p6888000
20:27:10.289 0 I free; slot = Process { pid: 1:1, address_space: "1:1" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:10.295 0 I drop; address_space = "1:1" @ 0p7E74000
20:27:10.375 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:10.381 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:10.385 0 I switch to; address_space = "process" @ 0p7E74000
20:27:10.391 0 I switch to; address_space = "base" @ 0p1000
20:27:10.395 0 I allocate; slot = Process { pid: 1:2, address_space: "1:2" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:10.447 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:10.455 0 I duplicate; address_space = "process" @ 0p6888000
20:27:10.459 0 I switch to; address_space = "process" @ 0p6888000
20:27:10.463 0 I switch to; address_space = "base" @ 0p1000
20:27:10.467 0 I drop; address_space = "process" @ 0p6888000
20:27:10.503 0 D prev_pid = 1:1; pid = 1:2
20:27:10.505 0 I free; slot = Process { pid: 1:2, address_space: "1:2" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:10.513 0 I drop; address_space = "1:2" @ 0p7E74000
20:27:10.593 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:10.599 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:10.603 0 I switch to; address_space = "process" @ 0p7E74000
20:27:10.609 0 I switch to; address_space = "base" @ 0p1000
20:27:10.613 0 I allocate; slot = Process { pid: 1:3, address_space: "1:3" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:10.665 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:10.673 0 I duplicate; address_space = "process" @ 0p6888000
20:27:10.677 0 I switch to; address_space = "process" @ 0p6888000
20:27:10.681 0 I switch to; address_space = "base" @ 0p1000
20:27:10.685 0 I drop; address_space = "process" @ 0p6888000
20:27:10.719 0 D prev_pid = 1:2; pid = 1:3
20:27:10.723 0 I free; slot = Process { pid: 1:3, address_space: "1:3" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:10.731 0 I drop; address_space = "1:3" @ 0p7E74000
20:27:10.809 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:10.817 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:10.821 0 I switch to; address_space = "process" @ 0p7E74000
20:27:10.827 0 I switch to; address_space = "base" @ 0p1000
20:27:10.831 0 I allocate; slot = Process { pid: 1:4, address_space: "1:4" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:10.883 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:10.889 0 I duplicate; address_space = "process" @ 0p6888000
20:27:10.893 0 I switch to; address_space = "process" @ 0p6888000
20:27:10.899 0 I switch to; address_space = "base" @ 0p1000
20:27:10.903 0 I drop; address_space = "process" @ 0p6888000
20:27:10.937 0 D prev_pid = 1:3; pid = 1:4
20:27:10.941 0 I free; slot = Process { pid: 1:4, address_space: "1:4" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:10.949 0 I drop; address_space = "1:4" @ 0p7E74000
20:27:11.027 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.035 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:11.039 0 I switch to; address_space = "process" @ 0p7E74000
20:27:11.043 0 I switch to; address_space = "base" @ 0p1000
20:27:11.047 0 I allocate; slot = Process { pid: 1:5, address_space: "1:5" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:11.101 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.107 0 I duplicate; address_space = "process" @ 0p6888000
20:27:11.111 0 I switch to; address_space = "process" @ 0p6888000
20:27:11.117 0 I switch to; address_space = "base" @ 0p1000
20:27:11.121 0 I drop; address_space = "process" @ 0p6888000
20:27:11.155 0 D prev_pid = 1:4; pid = 1:5
20:27:11.159 0 I free; slot = Process { pid: 1:5, address_space: "1:5" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:11.165 0 I drop; address_space = "1:5" @ 0p7E74000
20:27:11.245 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.253 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:11.257 0 I switch to; address_space = "process" @ 0p7E74000
20:27:11.261 0 I switch to; address_space = "base" @ 0p1000
20:27:11.265 0 I allocate; slot = Process { pid: 1:6, address_space: "1:6" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:11.319 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.325 0 I duplicate; address_space = "process" @ 0p6888000
20:27:11.329 0 I switch to; address_space = "process" @ 0p6888000
20:27:11.335 0 I switch to; address_space = "base" @ 0p1000
20:27:11.339 0 I drop; address_space = "process" @ 0p6888000
20:27:11.373 0 D prev_pid = 1:5; pid = 1:6
20:27:11.377 0 I free; slot = Process { pid: 1:6, address_space: "1:6" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:11.385 0 I drop; address_space = "1:6" @ 0p7E74000
20:27:11.463 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.471 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:11.475 0 I switch to; address_space = "process" @ 0p7E74000
20:27:11.479 0 I switch to; address_space = "base" @ 0p1000
20:27:11.483 0 I allocate; slot = Process { pid: 1:7, address_space: "1:7" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:11.535 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.543 0 I duplicate; address_space = "process" @ 0p6888000
20:27:11.547 0 I switch to; address_space = "process" @ 0p6888000
20:27:11.553 0 I switch to; address_space = "base" @ 0p1000
20:27:11.557 0 I drop; address_space = "process" @ 0p6888000
20:27:11.591 0 D prev_pid = 1:6; pid = 1:7
20:27:11.595 0 I free; slot = Process { pid: 1:7, address_space: "1:7" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:11.601 0 I drop; address_space = "1:7" @ 0p7E74000
20:27:11.681 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.689 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:11.691 0 I switch to; address_space = "process" @ 0p7E74000
20:27:11.697 0 I switch to; address_space = "base" @ 0p1000
20:27:11.701 0 I allocate; slot = Process { pid: 1:8, address_space: "1:8" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:11.753 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.761 0 I duplicate; address_space = "process" @ 0p6888000
20:27:11.765 0 I switch to; address_space = "process" @ 0p6888000
20:27:11.769 0 I switch to; address_space = "base" @ 0p1000
20:27:11.773 0 I drop; address_space = "process" @ 0p6888000
20:27:11.809 0 D prev_pid = 1:7; pid = 1:8
20:27:11.811 0 I free; slot = Process { pid: 1:8, address_space: "1:8" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:11.819 0 I drop; address_space = "1:8" @ 0p7E74000
20:27:11.899 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.905 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:11.909 0 I switch to; address_space = "process" @ 0p7E74000
20:27:11.915 0 I switch to; address_space = "base" @ 0p1000
20:27:11.919 0 I allocate; slot = Process { pid: 1:9, address_space: "1:9" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:11.971 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:11.979 0 I duplicate; address_space = "process" @ 0p6888000
20:27:11.983 0 I switch to; address_space = "process" @ 0p6888000
20:27:11.987 0 I switch to; address_space = "base" @ 0p1000
20:27:11.991 0 I drop; address_space = "process" @ 0p6888000
20:27:12.025 0 D prev_pid = 1:8; pid = 1:9
20:27:12.029 0 I free; slot = Process { pid: 1:9, address_space: "1:9" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:12.037 0 I drop; address_space = "1:9" @ 0p7E74000
20:27:12.117 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:12.125 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:12.127 0 I switch to; address_space = "process" @ 0p7E74000
20:27:12.133 0 I switch to; address_space = "base" @ 0p1000
20:27:12.137 0 I allocate; slot = Process { pid: 1:10, address_space: "1:10" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:12.189 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:12.197 0 I duplicate; address_space = "process" @ 0p6888000
20:27:12.201 0 I switch to; address_space = "process" @ 0p6888000
20:27:12.207 0 I switch to; address_space = "base" @ 0p1000
20:27:12.211 0 I drop; address_space = "process" @ 0p6888000
20:27:12.245 0 D prev_pid = 1:9; pid = 1:10
20:27:12.249 0 I free; slot = Process { pid: 1:10, address_space: "1:10" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 255
20:27:12.255 0 I drop; address_space = "1:10" @ 0p7E74000
20:27:12.335 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:12.343 0 I duplicate; address_space = "process" @ 0p7E74000
20:27:12.345 0 I switch to; address_space = "process" @ 0p7E74000
20:27:12.351 0 I switch to; address_space = "base" @ 0p1000
20:27:12.355 0 I allocate; slot = Process { pid: 1:11, address_space: "1:11" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 256
20:27:12.407 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
20:27:12.415 0 I duplicate; address_space = "process" @ 0p6888000
20:27:12.419 0 I switch to; address_space = "process" @ 0p6888000
20:27:12.423 0 I switch to; address_space = "base" @ 0p1000
20:27:12.427 0 I drop; address_space = "process" @ 0p6888000
20:27:12.463 0 D prev_pid = 1:10; pid = 1:11
...
20:27:22.979 0 I free; slot = Process { pid: 2:0, address_space: "2:0" @ 0p7E5C000, { rip: 0v0, rsp: 0v0 } }; process_count = 2
20:27:22.987 0 I drop; address_space = "2:0" @ 0p7E5C000
20:27:23.021 0 I free; slot = Process { pid: 0:1, address_space: "0:1" @ 0p7E79000, { rip: 0v0, rsp: 0v0 } }; process_count = 1
20:27:23.029 0 I drop; address_space = "0:1" @ 0p7E79000
20:27:23.063 0 I free; slot = Process { pid: 1:11, address_space: "1:11" @ 0p7E74000, { rip: 0v0, rsp: 0v0 } }; process_count = 0
20:27:23.069 0 I drop; address_space = "1:11" @ 0p7E74000
4_concurrency_5_table::full_capacity--------------- [passed]
20:27:23.107 0 I exit qemu; exit_code = SUCCESS
```


### Ориентировочный объём работ этой части лабораторки

```console
 kernel/src/process/table.rs |  119 +++++++++++++++++++++++++++++++++++++++++---
 1 file changed, 111 insertions(+), 8 deletions(-)
```
