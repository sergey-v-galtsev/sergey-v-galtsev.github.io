window.SIDEBAR_ITEMS = {"constant":[["KERNEL_RW",""],["USER",""],["USER_READ",""],["USER_RW",""]],"enum":[["FrameAllocator","Аллокатор физических фреймов."]],"fn":[["init","Инициализация подсистемы памяти."],["phys2virt","Возвращает страницу `phys2virt`, с которой начинается линейное отображение всей физической памяти в виртуальную."],["phys2virt_map","Для простоты работы с ней, физическая память целиком замаплена в некоторую область виртуальной. Эта функция по адресу первой (виртуальной) страницы этой области `phys2virt` выдаёт соответствующий виртуальный адрес для заданного физического `address`."]],"mod":[["addr","Определения типов адресов памяти, как виртуальных, так и физических — [`Addr`], [`Virt`] и [`Phys`]."],["address_space","Абстракция адресного пространства [`AddressSpace`]."],["block","Работа с блоками памяти [`Block`]."],["boot_frame_allocator","Временный аллокатор физических фреймов [`BootFrameAllocator`]."],["frage","Определения типов (виртуальных) страниц памяти и (физических) фреймов — [`Frage`], [`Frame`] и [`Page`]."],["gdt","Таблица сегментов памяти [`Gdt`]."],["main_frame_allocator","Основной аллокатор физических фреймов [`MainFrameAllocator`]."],["mapping","Реализация отображения виртуальной памяти в физическую [`Mapping`]."],["mmu","Дополнительные функции для работы с Memory Management Unit, доступные только ядру."],["page_allocator","Аллокатор страниц виртуальной памяти [`PageAllocator`]."],["size","Абстракция размера в памяти [`Size`]."],["stack","Работа со стеками [`Stack`]. Выделенные стеки для непредвиденных исключений [`ExceptionStacks`]."],["tss","Сегмент состояния задачи (task state segment, TSS)."]],"struct":[["AddressSpace","Структура для работы с виртуальным адресным пространством."],["BASE_ADDRESS_SPACE","Базовое виртуальное адресное пространство. Создаётся загрузчиком до старта ядра и донастраивается ядром. Все остальные адресные пространства получаются из него и его копий с помощью метода [`AddressSpace::duplicate()`]."],["Block","Абстракция куска физической или виртуальной памяти, постраничного или произвольного."],["FRAME_ALLOCATOR","Аллокатор физических фреймов."],["Size",""]],"trait":[["SizeOf",""]],"type":[["Frame","(Физический) фрейм памяти."],["Page","(Виртуальная) страница памяти."],["Phys","Физический адрес архитектуры x86-64."],["Virt","Виртуальный адрес архитектуры x86-64."]]};