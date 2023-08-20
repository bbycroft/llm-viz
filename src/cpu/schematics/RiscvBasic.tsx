
export const riscvBasicSchematic = `
#wire-schema 1
C ram 0 p:-12,-23
C rom 1 p:-12,-10
C insFetch 3 p:-12,2
C id 2 p:3,4
C ls 8 p:26,4
C alu 4 p:26,18
C pc 5 p:3,11
C reg 6 p:3,21
W 6 ns:[-12,3 p:insFetch/addr|-17,3,0]
W 7 ns:[-12,4 p:insFetch/data|-17,4,0]
W 10 ns:[3,24 p:reg/in|-1,24,0|-1,30,1|31,30,2|31,24,3 p:alu/result|38,30,3|38,6,5|36,6,6 p:ls/dataOut]
W 11 ns:[3,12 p:pc/in|-5,12,0]
W 13 ns:[29,10|29,7,0 p:ls/addrBase|20,10,0|29,18,0 p:alu/lhs|16,10,2|20,24,2|16,12,4|16,9,4|13,24,5 p:reg/outA|13,12,6 p:pc/out|-7,9,7|-7,5,10 p:insFetch/pc]
W 16 ns:[3,5 p:id/ins|0,5,0|0,3,1|-2,3,2 p:insFetch/ins]
W 21 ns:[33,18 p:alu/rhs|33,12,0|22,12,1|33,7,1 p:ls/data|22,6,2|22,26,2|13,6,4 p:id/rhsImm|13,26,5 p:reg/outB]
`;
