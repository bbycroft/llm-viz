
volatile unsigned int * const GPIO_VAL = (unsigned int *)0x80;

int main();
// static void sleep();

__attribute__((naked)) void _start() {
    // set stack pointer to 0xe0
    asm(
        "li sp, 0xe0\n\t"
        "jal main\n\t"
        "li a0, 44\n\t"
        "ecall\n\t"
    );
}

// static void sleep() {
//     int i;
//     for(i = 0; i < 10; i++) {
//         asm("nop");
//     }
// }

int main() {
    //  void (*sleep_ptr)() = &sleep;

    for (int j = 0; j < 2; j++) {
        *GPIO_VAL = 0x10101010;
        asm("nop");
        asm("nop");
        asm("nop");
        *GPIO_VAL = 0x01010101;
        asm("nop");
        asm("nop");
        asm("nop");
    }
    return 0;
}

