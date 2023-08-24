
#define SECTION(name) \
    .section .text_##name, "ax", @progbits; \
    .globl _start_##name; \
    _start_##name:; \
    .org 0x00

#define SECTION2(name) SECTION(name)

#define HELLO what
#define CAT_INNER(a, b) a##b
#define CAT(a, b) CAT_INNER(a, b)

SECTION2(HELLO)
#define FAIL CAT(HELLO, _fail)

const failure = FAIL;


int main() {

}
