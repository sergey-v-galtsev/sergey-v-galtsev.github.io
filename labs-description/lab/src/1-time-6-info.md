## Информация о системе

Ядро предоставляет пользовательским процессам часть информации о системе,
сохраняя её в памяти, доступной пользователю на чтение.
Эта информация собирается в виде структуры общей информации о системе
[`ku::info::SystemInfo`](../../doc/ku/info/struct.SystemInfo.html)
и в виде структуры с информацией о текущем процессе
[`ku::info::ProcessInfo`](../../doc/ku/info/struct.ProcessInfo.html),
которые определены в файле [`ku/src/info.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/info.rs).

В частности, в поле
[`SystemInfo::rtc`](../../doc/ku/info/struct.SystemInfo.html#structfield.rtc)
процессу пользователя доступен
[`AtomicCorrelationInterval`](../../doc/ku/time/correlation_interval/struct.AtomicCorrelationInterval.html)
для показаний RTC.
А также, например, идентификатор текущего процесса в поле
[`ProcessInfo::pid`](../../doc/ku/info/struct.ProcessInfo.html#structfield.pid).

Пользовательские процессы сохраняют указатели на предоставляемую ядром информацию в глобальных переменных
[`ku::info::PROCESS_INFO`](../../doc/ku/info/static.PROCESS_INFO.html)
и
[`ku::info::SYSTEM_INFO`](../../doc/ku/info/static.SYSTEM_INFO.html).
За это отвечает функция [`lib::_start()`](../../doc/lib/fn._start.html)
в файле [`user/lib/src/lib.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/user/lib/src/lib.rs),
с которой начинается выполнение процессов, подключивших библиотеку `user/lib` в своём `Cargo.toml`.

Поэтому пользовательский процесс может узнать свой идентификатор или текущее системное время,
не делая никаких системных вызовов, а просто читая из памяти.
То есть, без переключения в контекст ядра, что было бы дольше.
Ядро даже не предоставляет системных вызовов для выяснения времени или идентификатора процесса.
Это похоже на механизм
[virtual dynamic shared object (vDSO)](https://en.wikipedia.org/wiki/VDSO).
