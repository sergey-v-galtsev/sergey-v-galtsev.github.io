window.SIDEBAR_ITEMS = {"constant":[["KERNEL_RSP_OFFSET_IN_CPU","Смещение внутри [`Cpu`], по которому нужно сохранять `rsp` ядра, чтобы процессор переключал стек на него при возникновении прерываний в ненулевом кольце защиты. Ядро сохраняет там свой `rsp`, когда переключается в режим пользователя и восстанавливает свой `rsp` оттуда, когда возвращается из режима пользователя или получает он него системный вызов."]],"fn":[["init","Инициализирует вектор структур [`Cpu`] размера `cpu_count` и регистры `FS` и `TR` для `current_cpu` (Bootstrap Processor)."],["init_cpu_vec","Выделяет память для структур [`Cpu`] и для содержащихся в них стеках."]],"struct":[["Cpu","CPU–local storage. Aligned on the cache line size to avoid false sharing. Why align on 128 bytes instead of 64?"]]};