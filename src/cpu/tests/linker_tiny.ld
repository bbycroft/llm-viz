
/* Entry Point */
ENTRY(_start)

/* Not entirely sure how this works, with overlapping memories, or how COMMON works.  */

/* Memory Layout */
MEMORY
{
  FLASH (rx) : ORIGIN = 0x00, LENGTH = 1024
  RAM (rw) : ORIGIN = 0x10000, LENGTH = 1024
}

SECTIONS
{
  . = ORIGIN(FLASH);

  /* Code and RO data */
  .text : {
    /* KEEP(*(.vector))  Interrupt vector table */
    *(.text)
    *(.text.startup)
  } > FLASH

. = ORIGIN(RAM);

  .rodata : {
    *(.rodata)
  } > RAM

  /* RW data */
  /* .data : AT (ADDR(.text) + SIZEOF(.text)) {
    *(.data)
  } > RAM */
  .data : {
    *(.data)
  } > RAM

  /* BSS and heap */
  .bss : {
    *(.bss)
    *(COMMON)
  } > RAM
}
