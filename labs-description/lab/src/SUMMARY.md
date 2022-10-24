# Summary

[Введение в лабораторные работы](0-intro-1-nikka.md)
[Почему Rust](0-intro-2-rust.md)
[Структура кода](0-intro-3-dirs.md)
[Компиляция и запуск тестов](0-intro-4-install.md)
[Запуск с отладчиком gdb](0-intro-5-gdb.md)
[Логирование и логи](0-intro-6-log.md)
[Настройка VSCode](0-intro-7-vscode.md)

# Лабораторная работа №1

- [Время](1-time-0-intro.md)
  - [Часы реального времени](1-time-1-rtc.md)
  - [Счётчик тактов процессора](1-time-2-tsc.md)
  - [Счётчики тиков](1-time-3-correlation-point.md)
  - [Измерение частоты процессора и повышение разрешения часов](1-time-4-correlation-interval.md)
  - [Обработка прерываний RTC](1-time-5-interrupts.md)
  - [Информация о системе](1-time-6-info.md)
  - [Собираем всё вместе](1-time-7-summary.md)

# Лабораторная работа №2

- [Память](2-mm-0-intro.md)
  - [Типы](2-mm-1-types.md)
  - [Страничные отображения](2-mm-2-mapping.md)
  - [Диаграммы преобразований](2-mm-3-diagrams.md)
  - [План](2-mm-4-plan.md)
  - [Временный аллокатор фреймов](2-mm-5-boot-frame-allocator.md)
  - [Виртуальное адресное пространство](2-mm-6-address-space.md)
    - [Аллокатор виртуальных страниц адресного пространства](2-mm-6-address-space-1-allocation.md)
    - [Отображение виртуальных страниц в физические фреймы](2-mm-6-address-space-2-translate.md)
    - [Высокоуровневый интерфейс управления адресным пространством](2-mm-6-address-space-3-map.md)
  - [Основной аллокатор фреймов](2-mm-7-main-frame-allocator.md)
  - [Проверьте себя](2-mm-8-tests.md)

# Лабораторная работа №3

- [Процессы](3-process-0-intro.md)
  - [Загрузка процесса в память](3-process-1-elf.md)
  - [Проверки доступа процесса к памяти](3-process-2-permission-checks.md)
  - [Переход в режим пользователя](3-process-3-user-mode.md)
  - [Поддержка системных вызовов](3-process-4-syscall.md)

# Лабораторная работа №4

- [Конкурентное выполнение задач](4-concurrency-0-intro.md)
  - [Поддержка нескольких процессоров (SMP)](4-concurrency-1-smp-0-intro.md)
    - [Работа с local APIC](4-concurrency-1-smp-1-local-apic.md)
    - [Состояние каждого процессора](4-concurrency-1-smp-2-cpus.md)
    - [Загрузка Application Processor](4-concurrency-1-smp-3-ap-init.md)
  - [Таблица процессов](4-concurrency-2-table.md)
  - [Вытесняющая многозадачность](4-concurrency-3-preemption.md)
  - [Планировщик](4-concurrency-4-scheduler.md)

# Лабораторная работа №5

- [Продвинутая работа с памятью в пространстве пользователя](5-um-0-intro.md)
  - [Разделяемая память](5-um-1-ring-buffer.md)
  - [Системные вызовы для работы с виртуальной памятью](5-um-2-memory.md)
  - [Eager fork](5-um-3-eager-fork.md)
  - [Обработка исключений в режиме пользователя](5-um-4-traps.md)
  - [Copy-on-write fork](5-um-5-cow-fork.md)
