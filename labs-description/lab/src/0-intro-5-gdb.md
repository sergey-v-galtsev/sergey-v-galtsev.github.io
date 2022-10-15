## Запуск, в том числе с отладчиком gdb

Если что-то пошло не так, для отладки можно запустить

```console
$ make run-gdb
```

Запустится эмулятор qemu, который будет ждать подключения `gdb`.
В другой консоли запустите `gdb` командой

```console
$ make gdb
```

`gdb` подключится к `qemu`.
Теперь можно, например, поставить `breakpoint`:

```console
...
0x000000000000fff0 in ?? ()
(gdb) br kernel_main
Breakpoint 1 at 0x21141f: file src/main.rs, line 36.
```

и запустить Nikka

```console
(gdb) c
Continuing.

Thread 1 hit Breakpoint 1, kernel::kernel_main (boot_info=0x10000000000) at src/main.rs:36
36    kernel::init(boot_info);
```

Запустить `qemu` без `gdb` можно командой

```console
$ make run
```

А для прогона тестов

```console
$ make test
```


### Отладка пользовательских процессов

При необходимости отлаживать пользовательский процесс,
нужно сделать несколько дополнительных вещей:

- Отредактировать файл [`gdbinit`](https://gitlab.com/sergey-v-galtsev/nikka-public/-/blob/master/gdbinit), заменив в нём команду загрузки бинарника ядра `file target/kernel/debug/kernel` на команду загрузки нужного пользовательского бинарника, например `file target/kernel/user/cow_fork`.
- Можно также добавить в `gdbinit` дополнительные команды, например
```gdb
breakpoint lib::syscall::trap_handler_invoker
ignore 1 10
continue
```
добавит точку останова на заданную функцию и пропустит первые 10 попаданий на неё. То есть приглашение gdb будет показано на 11-е попадание в точку останова.
- Запустить `make test-gdb` в одной консоли и несколько раз `make gdb` в другой консоли, пока не запустится нужный тестовый процесс.


### Дизассеблирование

Для получения информации о бинарниках и для их дизассемблирования можно использовать `objdump` в сочетании с `rustfilt`.
Например:
```console
$ objdump --all-headers target/kernel/debug/kernel | rustfilt
$ objdump --disassemble --disassembler-options=intel target/kernel/debug/kernel | rustfilt
$ objdump --all-headers target/kernel/user/cow_fork | rustfilt
$ objdump --disassemble --disassembler-options=intel target/kernel/user/cow_fork | rustfilt
```

Для запуска `rustfilt` и других бинарников Rust полезно добавить `$HOME/.cargo/bin/` в свой `$PATH`:
```console
$ tail -n1 ~/.bashrc
export PATH="$HOME/.cargo/bin:$PATH"
```
