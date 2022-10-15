## Счётчик тактов процессора

Из всех имеющихся в стандартном компьютере часов, самым большим разрешением
обладает тактовый генератор процессора.
В Nikka работа с ним собрана в модуль
[`ku::time::tsc`](../../doc/ku/time/tsc/index.html)
в файле
[`ku/src/time/tsc.rs`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/ku/src/time/tsc.rs).
Сопоставлять другие источники времени будем с ним.

Функция [`fn ku::time::tsc::tsc() -> i64`](../../doc/ku/time/tsc/fn.tsc.html)
возвращает
[номер текущего такта процессора](https://en.wikipedia.org/wiki/Time_Stamp_Counter)
в некоторый момент времени своего исполнения.

> Относительно оптимальным решением для этого было бы использовать инструкцию
> [`RDTSCP`](https://www.felixcloutier.com/x86/rdtscp),
> позвать которую в Rust можно как
> [`core::arch::x86_64::__rdtscp()`](https://doc.rust-lang.org/nightly/core/arch/x86_64/fn.__rdtscp.html).
> К сожалению, она доступна только на довольно новых процессорах,
> поэтому Nikka использует более старую инструкцию
> [`RDTSC`](https://www.felixcloutier.com/x86/rdtsc),
> в сочетании с [`LFENCE`](https://www.felixcloutier.com/x86/lfence),
> через функции
> [`core::arch::x86_64::_rdtsc()`](https://doc.rust-lang.org/nightly/core/arch/x86_64/fn._rdtsc.html)
> и
> [`core::arch::x86_64::_mm_lfence()`](https://doc.rust-lang.org/nightly/core/arch/x86_64/fn._mm_lfence.html).
> Кроме того, она рассчитывает, что результат `RDTSC` поместится в
> [`i64`](https://doc.rust-lang.org/nightly/core/primitive.i64.html),
> что удобно, например, для взятия разности при вычислении интервала времени.
>
> ```rust
> #[inline(always)]
> pub fn tsc() -> i64 {
>     unsafe {
>         x86_64::_mm_lfence();
>         x86_64::_rdtsc().try_into().expect("i64 overflow when storing TSC is expected only after tens of years of uptime")
>     }
> }
> ```
>
> В статье
> [How to Benchmark Code Execution Times on Intel® IA-32 and IA-64 Instruction Set Architectures](https://www.intel.com/content/dam/www/public/us/en/documents/white-papers/ia-32-ia-64-benchmark-code-execution-paper.pdf)
> есть продвинутые рекомендации по использованию инструкций `RDTSC` и `RDTSCP` для измерений интервалов времени.
> Кроме того, с использованием инструкций `RDTSC` и `RDTSCP` связаны и другие тонкости, например:
>
> - Инвариантность в зависимости от нагрузки на процессор и его режима энергосбережения. На старых процессорах при изменении его частоты работы меняется и частота счётчика тактов, то есть она не инвариантна.
> - Согласованность счётчиков тактов между разными процессорами системы.
> - Вообще говоря, прикладные программы не могут рассчитывать на доступность этих инструкций. Так как ядро может запретить их использование в непривилегированном режиме.
> - Ядро не спроста может хотеть запретить эти инструкции. Существует множество атак на криптографические алгоритмы, базирующихся на том, что атакующему доступно точное измерение времени работы атакуемого криптографического приложения.
>
> Для упрощения, Nikka игнорирует эти сложности.


### Момент времени [`ku::time::tsc::Tsc`](../../doc/ku/time/tsc/struct.Tsc.html)


Структура [`Tsc`](../../doc/ku/time/tsc/struct.Tsc.html)
описывает момент времени, храня значение счётчика тактов процессора.
Она похожа на стандартную, но недоступную нам в `#[no_std]`--окружении
структуру
[`std::time::Instant`](https://doc.rust-lang.org/std/time/struct.Instant.html).
Обе описывают [монотонно возрастающее время](https://blog.codeminer42.com/the-monotonic-clock-and-why-you-should-care-about-it/).
То есть время, не ходящее "назад" ни при переводе часов на летнее время, ни при корректировке неточно идущих часов.
Но такое время может никак не соответствовать [реальному времени](https://en.wikipedia.org/wiki/Civil_time).


### Интервал времени [`ku::time::tsc::TscDuration`](../../doc/ku/time/tsc/struct.TscDuration.html)

Структура [`TscDuration`](../../doc/ku/time/tsc/struct.TscDuration.html) описывает
интервал между двумя моментами времени
[`Tsc`](../../doc/ku/time/tsc/struct.Tsc.html).
Она наивно предполагает, что используемый ею счётчик тактов процессора как минимум инвариантен и согласован между процессорами.

Структура [`TscDuration`](../../doc/ku/time/tsc/struct.TscDuration.html)
может быть напечатана. Например,

```rust
let timer = time::timer();
let frame_allocator = MainFrameAllocator::new(memory_map);
info!(
    frame_allocator = "main",
    free_frame_count = frame_allocator.count(),
    duration = %timer.elapsed(),
    "init",
);
```

пишет в лог `duration = 322.017 Mtsc`:

```
15:08:28 0 I init; frame_allocator = "main frame allocator"; free_frame_count = 10601; duration = 322.017 Mtsc
```

где Mtsc --- миллионы тактов процессора.
Наша ближайшая задача, ---
научиться выражать продолжительность в гораздо более удобных для человека единицах измерения, привязанных к реальному миру.


> ### Монотонное время
>
> Обратите внимание, что интервалы времени корректно измерять только по монотонному времени.
> Иначе в момент корректировки неточно идущих часов или при ступенчатом добавлении високосной секунды,
> интервал будет неверен.
> Аналогично, сравнивать моменты времени на больше или меньше тоже можно только по монотонным часам.
> Из-за ошибочного использования в этих случаях реального времени порой происходят крупные сбои, например
> [сбой в Cloudflare](https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/).
>
> Как вариант, можно хранить в типе, отвечающем за точку во времени, одновременно и показания часов реального времени,
> и показания монотонных часов в тот же момент.
> Тогда при оперировании с одной временной точкой, можно показывать человеку привычное ему реальное время.
> А вот при вычислении интервалов времени между двумя точками, а также для сравнения точек на больше и меньше,
> использовать монотонные компоненты этих точек.
> В Go [сделали именно так](https://go.googlesource.com/proposal/+/master/design/12914-monotonic.md).
> Это стоит немного дополнительной памяти для хранения монотонных компонент.
>
> К сожалению, уже есть довольно много неаккуратно написанного кода, полагающегося на монотонность системного времени.
> Один из элегантных методов обхода возникающих из-за этого проблем при резком подводе часов реального времени,
> особенно назад, состоит в размазывании большой одномоментной дельты на маленькие,
> вносимые в течение длительного времени.
> Системный вызов [adjtime](https://linux.die.net/man/3/adjtime) корректирует неточно идущие локальные часы именно так.
> Аналогично [поступает и Google с високосными секундами](https://googleblog.blogspot.com/2011/09/time-technology-and-leaping-seconds.html).
>
> Строго говоря, [`RDTSC`](https://www.felixcloutier.com/x86/rdtsc) не является монотонным источником времени.
> Так как этот счётчик можно менять, в том числе назад.
> См. стр. [615](https://xem.github.io/minix86/manual/intel-x86-and-64-manual-vol3/o_fe12b1e2a880e0ce-615.html) и
> [616](https://xem.github.io/minix86/manual/intel-x86-and-64-manual-vol3/o_fe12b1e2a880e0ce-615.html)
> в руководстве от Intel:
>
> > 17.15.3  Time-Stamp Counter Adjustment
> >
> > Software can modify the value of the time-stamp counter (TSC) of a logical processor by using the WRMSR instruction
> > to write to the IA32_TIME_STAMP_COUNTER MSR (address 10H). Because such a write applies only to that
> > logical processor, software seeking to synchronize the TSC values of multiple logical processors must perform these
> > writes on each logical processor.
