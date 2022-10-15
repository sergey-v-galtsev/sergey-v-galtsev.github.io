## Проверьте себя

После того как вы полностью реализуете работу с памятью, проверьте себя.
Запустите интеграционные тесты командой `cargo test --test 2-mm-*`
в директории `kernel` репозитория.
Вы должны увидеть что-то вроде

```console
$ (cd kernel; cargo test --test 2-mm-*)
    Finished test [unoptimized + debuginfo] target(s) in 0.08s
     Running tests/2-mm-1-block.rs (/home/sergey/tmp/shad-os/target/kernel/debug/deps/2_mm_1_block-f2c7db20fb3d2656)
Building bootloader
   Compiling bootloader v0.9.22 (/home/sergey/.cargo/registry/src/github.com-1ecc6299db9ec823/bootloader-0.9.22)
    Finished release [optimized + debuginfo] target(s) in 0.95s
Running: `qemu-system-x86_64 -drive format=raw,file=/home/sergey/tmp/shad-os/target/kernel/debug/deps/bootimage-2_mm_1_block-f2c7db20fb3d2656.bin -no-reboot -m size=128M -smp cpus=4 -device isa-debug-exit,iobase=0xF4,iosize=0x04 -serial stdio -display none`
19:38:12 0 I RTC init; acknowledged_settings = USE_24_HOUR_FORMAT | UPDATE_ENDED_INTERRUPT
19:38:12 0 I time init
19:38:12 0 I Nikka booted; now = 2022-10-09 19:38:12 UTC; tsc = Tsc(2295235227)
19:38:12 0 I GDT init
19:38:12 0 I interrupts init
running 1 tests

2_mm_1_block::block-----------------------------------------
19:38:12 0 D start = 0; end = 0; block = [0v0, 0v0), size 0 B
19:38:12 0 D start = 0; end = 33; block = [0v0, 0v21), size 33 B
19:38:12 0 D start = 0; end = 66; block = [0v0, 0v42), size 66 B
19:38:12 0 D start = 0; end = 99; block = [0v0, 0v63), size 99 B
19:38:12 0 D start = 25; end = 33; block = [0v19, 0v21), size 8 B
19:38:12 0 D start = 25; end = 66; block = [0v19, 0v42), size 41 B
19:38:12 0 D start = 25; end = 99; block = [0v19, 0v63), size 74 B
19:38:13 0 D start = 50; end = 66; block = [0v32, 0v42), size 16 B
19:38:13 0 D start = 50; end = 99; block = [0v32, 0v63), size 49 B
19:38:13 0 D start = 50; end = 132; block = [0v32, 0v84), size 82 B
19:38:13 0 D start = 75; end = 99; block = [0v4B, 0v63), size 24 B
19:38:13 0 D start = 75; end = 132; block = [0v4B, 0v84), size 57 B
19:38:13 0 D start = 75; end = 165; block = [0v4B, 0vA5), size 90 B
2_mm_1_block::block-------------------------------- [passed]
19:38:13 0 I exit qemu; exit_code = SUCCESS
     Running tests/2-mm-1-boot-frame-allocator.rs (/home/sergey/tmp/shad-os/target/kernel/debug/deps/2_mm_1_boot_frame_allocator-687c8353e5574705)
Building bootloader
   Compiling bootloader v0.9.22 (/home/sergey/.cargo/registry/src/github.com-1ecc6299db9ec823/bootloader-0.9.22)
    Finished release [optimized + debuginfo] target(s) in 0.96s
Running: `qemu-system-x86_64 -drive format=raw,file=/home/sergey/tmp/shad-os/target/kernel/debug/deps/bootimage-2_mm_1_boot_frame_allocator-687c8353e5574705.bin -no-reboot -m size=128M -smp cpus=4 -device isa-debug-exit,iobase=0xF4,iosize=0x04 -serial stdio -display none`
19:38:15 0 I RTC init; acknowledged_settings = USE_24_HOUR_FORMAT | UPDATE_ENDED_INTERRUPT
19:38:15 0 I time init
19:38:15 0 I Nikka booted; now = 2022-10-09 19:38:15 UTC; tsc = Tsc(2230097572)
19:38:15 0 I GDT init
19:38:15 0 I interrupts init
19:38:15 0 I phys2virt = Page(4503595332403200 @ 0vFFFFF00000000000)
19:38:15 0 I init; frame_allocator = "boot"; block = [0p5AB000, 0p7FE0000), size 122.207 MiB; free_frame_count = 31285
19:38:15 0 I memory init; duration = 17.297 ms
running 3 tests

2_mm_1_boot_frame_allocator::sanity_check-------------------
19:38:15 0 D free_frames = 31285; min_free_frames = 28672; qemu_memory_frames = 32768
19:38:15 0 D managed = 31285; used = 0
2_mm_1_boot_frame_allocator::sanity_check---------- [passed]

2_mm_1_boot_frame_allocator::allocate-----------------------
19:38:15 0 D frames = [Frame(32735 @ 0p7FDF000), Frame(32734 @ 0p7FDE000)]
2_mm_1_boot_frame_allocator::allocate-------------- [passed]

2_mm_1_boot_frame_allocator::allocated_frames_are_unique----
19:38:15 0 D free_frames = 31283
19:38:15 0 D prev_frame = 32733 @ 0p7FDD000; frame = 32732 @ 0p7FDC000
19:38:15 0 D prev_frame = 22733 @ 0p58CD000; frame = 22732 @ 0p58CC000
19:38:16 0 D prev_frame = 12733 @ 0p31BD000; frame = 12732 @ 0p31BC000
19:38:16 0 D prev_frame = 2733 @ 0pAAD000; frame = 2732 @ 0pAAC000
2_mm_1_boot_frame_allocator::allocated_frames_are_unique [passed]
19:38:16 0 I exit qemu; exit_code = SUCCESS
     Running tests/2-mm-2-page-allocator.rs (/home/sergey/tmp/shad-os/target/kernel/debug/deps/2_mm_2_page_allocator-0d16673aec3ec8e4)
Building bootloader
   Compiling bootloader v0.9.22 (/home/sergey/.cargo/registry/src/github.com-1ecc6299db9ec823/bootloader-0.9.22)
    Finished release [optimized + debuginfo] target(s) in 0.97s
Running: `qemu-system-x86_64 -drive format=raw,file=/home/sergey/tmp/shad-os/target/kernel/debug/deps/bootimage-2_mm_2_page_allocator-0d16673aec3ec8e4.bin -no-reboot -m size=128M -smp cpus=4 -device isa-debug-exit,iobase=0xF4,iosize=0x04 -serial stdio -display none`
19:38:17 0 I RTC init; acknowledged_settings = USE_24_HOUR_FORMAT | UPDATE_ENDED_INTERRUPT
19:38:17 0 I time init
19:38:17 0 I Nikka booted; now = 2022-10-09 19:38:17 UTC; tsc = Tsc(2240178158)
19:38:17 0 I GDT init
19:38:17 0 I interrupts init
19:38:17 0 I phys2virt = Page(4503595332403200 @ 0vFFFFF00000000000)
19:38:17 0 I init; frame_allocator = "boot"; block = [0p5AA000, 0p7FE0000), size 122.211 MiB; free_frame_count = 31286
19:38:17 0 I page allocator init; free_page_count = 33957085184; block = [0v18000000000, 0v10000000000000000), size 126.500 TiB
19:38:17 0 I init; address_space = "base" @ 0p1000
19:38:17 0 I drop; address_space = "invalid" @ 0p0
19:38:17 0 I memory init; duration = 32.639 ms
running 4 tests

2_mm_2_page_allocator::sanity_check-------------------------
19:38:17 0 D page_allocator_block = [0v18000000000, 0v7FFFFFFFF000), size 126.500 TiB, Page[~1.500 TiB, ~128.000 TiB)
2_mm_2_page_allocator::sanity_check---------------- [passed]

2_mm_2_page_allocator::allocate_page------------------------
19:38:17 0 D page = Page(34359738366 @ 0v7FFFFFFFE000)
2_mm_2_page_allocator::allocate_page--------------- [passed]

2_mm_2_page_allocator::allocate_two_pages-------------------
19:38:17 0 D pages = [Page(34359738365 @ 0v7FFFFFFFD000), Page(34359738364 @ 0v7FFFFFFFC000)]
2_mm_2_page_allocator::allocate_two_pages---------- [passed]

2_mm_2_page_allocator::allocate_block-----------------------
19:38:17 0 D requested_size = 38.000 KiB; block = [0v7FFFFFFF2000, 0v7FFFFFFFC000), size 40.000 KiB, Page[~128.000 TiB, ~128.000 TiB)
2_mm_2_page_allocator::allocate_block-------------- [passed]
19:38:17 0 I exit qemu; exit_code = SUCCESS
     Running tests/2-mm-3-mapping.rs (/home/sergey/tmp/shad-os/target/kernel/debug/deps/2_mm_3_mapping-792b889b8b2abc13)
Building bootloader
   Compiling bootloader v0.9.22 (/home/sergey/.cargo/registry/src/github.com-1ecc6299db9ec823/bootloader-0.9.22)
    Finished release [optimized + debuginfo] target(s) in 0.94s
Running: `qemu-system-x86_64 -drive format=raw,file=/home/sergey/tmp/shad-os/target/kernel/debug/deps/bootimage-2_mm_3_mapping-792b889b8b2abc13.bin -no-reboot -m size=128M -smp cpus=4 -device isa-debug-exit,iobase=0xF4,iosize=0x04 -serial stdio -display none`
19:38:19 0 I RTC init; acknowledged_settings = USE_24_HOUR_FORMAT | UPDATE_ENDED_INTERRUPT
19:38:19 0 I time init
19:38:19 0 I Nikka booted; now = 2022-10-09 19:38:19 UTC; tsc = Tsc(2260321974)
19:38:19 0 I GDT init
19:38:19 0 I interrupts init
19:38:19 0 I phys2virt = Page(4503595332403200 @ 0vFFFFF00000000000)
19:38:19 0 I init; frame_allocator = "boot"; block = [0p5AA000, 0p7FE0000), size 122.211 MiB; free_frame_count = 31286
19:38:19 0 I page allocator init; free_page_count = 33957085184; block = [0v18000000000, 0v10000000000000000), size 126.500 TiB
19:38:19 0 I init; address_space = "base" @ 0p1000
19:38:19 0 I drop; address_space = "invalid" @ 0p0
19:38:19 0 I memory init; duration = 17.655 ms
running 2 tests

2_mm_3_mapping::translate-----------------------------------
19:38:19 0 D pte = PageTableEntry(2613347)
19:38:19 0 D read_ptr = 0xfffff0000027e420; write_ptr = 0x10000201420
19:38:19 0 D write_value = 0; read_value = 0; variable = 0
19:38:19 0 D write_value = 1; read_value = 1; variable = 1
19:38:19 0 D write_value = 2; read_value = 2; variable = 2
19:38:19 0 D write_value = 3; read_value = 3; variable = 3
19:38:19 0 D write_value = 4; read_value = 4; variable = 4
2_mm_3_mapping::translate-------------------------- [passed]

2_mm_3_mapping::map_intermediate----------------------------
19:38:19 0 D page = Page(34359738366 @ 0v7FFFFFFFE000)
19:38:19 0 D pte = PageTableEntry(0)
2_mm_3_mapping::map_intermediate------------------- [passed]
19:38:19 0 I exit qemu; exit_code = SUCCESS
     Running tests/2-mm-4-interface.rs (/home/sergey/tmp/shad-os/target/kernel/debug/deps/2_mm_4_interface-eb5fc3d25a039e4c)
Building bootloader
   Compiling bootloader v0.9.22 (/home/sergey/.cargo/registry/src/github.com-1ecc6299db9ec823/bootloader-0.9.22)
    Finished release [optimized + debuginfo] target(s) in 0.93s
Running: `qemu-system-x86_64 -drive format=raw,file=/home/sergey/tmp/shad-os/target/kernel/debug/deps/bootimage-2_mm_4_interface-eb5fc3d25a039e4c.bin -no-reboot -m size=128M -smp cpus=4 -device isa-debug-exit,iobase=0xF4,iosize=0x04 -serial stdio -display none`
19:38:21 0 I RTC init; acknowledged_settings = USE_24_HOUR_FORMAT | UPDATE_ENDED_INTERRUPT
19:38:21 0 I time init
19:38:21 0 I Nikka booted; now = 2022-10-09 19:38:21 UTC; tsc = Tsc(2289679569)
19:38:21 0 I GDT init
19:38:21 0 I interrupts init
19:38:21 0 I phys2virt = Page(4503595332403200 @ 0vFFFFF00000000000)
19:38:21 0 I init; frame_allocator = "boot"; block = [0p5A9000, 0p7FE0000), size 122.215 MiB; free_frame_count = 31287
19:38:21 0 I page allocator init; free_page_count = 33957085184; block = [0v18000000000, 0v10000000000000000), size 126.500 TiB
19:38:21 0 I init; address_space = "base" @ 0p1000
19:38:21 0 I drop; address_space = "invalid" @ 0p0
19:38:21 0 I memory init; duration = 32.833 ms
running 1 tests

2_mm_4_interface::map_slice---------------------------------
19:38:22 0 D slice = [0v7FFFFEFFF000, 0v7FFFFFFFF000), size 16.000 MiB, Virt[~128.000 TiB, ~128.000 TiB)
2_mm_4_interface::map_slice------------------------ [passed]
19:38:25.077 0 I exit qemu; exit_code = SUCCESS
     Running tests/2-mm-5-main-frame-allocator.rs (/home/sergey/tmp/shad-os/target/kernel/debug/deps/2_mm_5_main_frame_allocator-5e980c813edc491b)
Building bootloader
   Compiling bootloader v0.9.22 (/home/sergey/.cargo/registry/src/github.com-1ecc6299db9ec823/bootloader-0.9.22)
    Finished release [optimized + debuginfo] target(s) in 0.94s
Running: `qemu-system-x86_64 -drive format=raw,file=/home/sergey/tmp/shad-os/target/kernel/debug/deps/bootimage-2_mm_5_main_frame_allocator-5e980c813edc491b.bin -no-reboot -m size=128M -smp cpus=4 -device isa-debug-exit,iobase=0xF4,iosize=0x04 -serial stdio -display none`
19:38:26 0 I RTC init; acknowledged_settings = USE_24_HOUR_FORMAT | UPDATE_ENDED_INTERRUPT
19:38:26 0 I time init
19:38:26 0 I Nikka booted; now = 2022-10-09 19:38:26 UTC; tsc = Tsc(2328791295)
19:38:26 0 I GDT init
19:38:26 0 I interrupts init
19:38:26 0 I phys2virt = Page(4503595332403200 @ 0vFFFFF00000000000)
19:38:26 0 I init; frame_allocator = "boot"; block = [0p5C2000, 0p7FE0000), size 122.117 MiB; free_frame_count = 31262
19:38:26 0 I page allocator init; free_page_count = 33957085184; block = [0v18000000000, 0v10000000000000000), size 126.500 TiB
19:38:26 0 I init; address_space = "base" @ 0p1000
19:38:26 0 I drop; address_space = "invalid" @ 0p0
19:38:26 0 I available memory; total = 127.875 MiB; usable = 123.621 MiB; total_frames = 32736; usable_frames = 31647
19:38:26 0 D frame info mapped; frame_allocator = "main"; duration = 21.447 ms
19:38:26 0 D frame info init; frame_allocator = "main"; duration = 64.325 ms
19:38:26 0 D move free frames from the boot frame allocator; frame_allocator = "main"; free_frame_count = 31067
19:38:26 0 I drop; frame_allocator = "boot"; block = [0p5C2000, 0p5C2000), size 0 B; leaked_frame_count = 0
19:38:26 0 D moved all free frames; frame_allocator = "main"; duration = 93.900 ms
19:38:27 0 I init; frame_allocator = "main"; free_frame_count = 31452; duration = 205.386 ms
19:38:27 0 I memory init; duration = 237.945 ms
running 5 tests

2_mm_5_main_frame_allocator::sanity_check-------------------
19:38:27 0 D free_frames = 31452; min_free_frames = 28672; qemu_memory_frames = 32768
2_mm_5_main_frame_allocator::sanity_check---------- [passed]

2_mm_5_main_frame_allocator::basic_frame_allocator_functions
19:38:27 0 D frames = [Frame(32540 @ 0p7F1C000), Frame(32539 @ 0p7F1B000)]
19:38:27 0 D reallocate_last_freed_frame = Frame(32540 @ 0p7F1C000)
2_mm_5_main_frame_allocator::basic_frame_allocator_functions [passed]

2_mm_5_main_frame_allocator::allocated_frames_are_unique----
19:38:27 0 D free_frames = 31390
19:38:27 0 D free_frames = 0
19:38:29.579 0 D free_frames = 31390
2_mm_5_main_frame_allocator::allocated_frames_are_unique [passed]

2_mm_5_main_frame_allocator::shared_memory------------------
19:38:29.613 0 D frame = Frame(32479 @ 0p7EDF000)
19:38:29.617 0 D pages = [Page(34359738111 @ 0v7FFFFFEFF000), Page(34359738112 @ 0v7FFFFFF00000)]
19:38:29.627 0 D write_ptr = 0x7ffffff00000; read_ptr = 0x7fffffeff000
19:38:29.633 0 D write_value = 0; read_value = 0
19:38:29.639 0 D write_value = 1; read_value = 1
19:38:29.643 0 D write_value = 2; read_value = 2
2_mm_5_main_frame_allocator::shared_memory--------- [passed]

2_mm_5_main_frame_allocator::duplicate_and_drop_mapping-----
19:38:29.695 0 I page allocator init; free_page_count = 33822867456; block = [0v18000000000, 0v7F8000000000), size 126.000 TiB
19:38:29.703 0 I duplicate; address_space = "process" @ 0p7EDF000
19:38:29.709 0 D ptes = [PageTableEntry(2613347), PageTableEntry(2613347)]
19:38:29.715 0 D pte_addresses = [Virt(0vFFFFF000005BB008), Virt(0vFFFFF00007EE7008)]
19:38:29.725 0 I drop; address_space = "process" @ 0p7EDF000
2_mm_5_main_frame_allocator::duplicate_and_drop_mapping [passed]
19:38:29.761 0 I exit qemu; exit_code = SUCCESS
```

В случае ошибки вы увидите что-нибудь вроде
```console
...
panicked at 'called `Result::unwrap()` on an `Err` value: NoFrame', src/memory/main_frame_allocator.rs:49:14
--------------------------------------------------- [failed]
21:41:55 0 I exit qemu; exit_code = FAILURE
error: test failed, to rerun pass '--bin kernel'
```

Но учтите, что тесты не могут покрывать всё.
Так что даже если они прошли успешно, возможно код содержит ошибки,
которые проявят себя позже в следующих лабораторных работах.
Чтобы повысить свою уверенность, что этого не произойдёт,
добавьте собственные тесты, а также внимательно перечитайте свой код и код вокруг.
