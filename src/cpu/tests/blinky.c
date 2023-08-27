
volatile unsigned int * const GPIO_VAL = (unsigned int *)0x40020000;

const int ITER_COUNT = 2;
const int BLINK_MODE_0 = 0x000000cc;
const int BLINK_MODE_1 = 0x00000055;

int iter_counter = 0;

int main();
// static void sleep();

__attribute__((naked)) void _start() {
    // set stack pointer to 0xe0
    asm(
        "li sp, 0x100e0\n"
        "jal main\n"
        "li a0, 44\n"
        "ecall\n"
    );
}

void sleep() {
    asm("nop");
    asm("nop");
    asm("nop");
    iter_counter += 1;
}

int main() {
    //  void (*sleep_ptr)() = &sleep;

    for (int j = 0; j < ITER_COUNT; j++) {
        *GPIO_VAL = BLINK_MODE_0;
        // asm("jal sleep");
        sleep();
        *GPIO_VAL = BLINK_MODE_1;
        // asm("jal sleep");
        sleep();
    }
    *GPIO_VAL = iter_counter;
    return 0;
}

