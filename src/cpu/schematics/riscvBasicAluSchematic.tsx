
import { ILSSchematic } from "@/src/cpu/ImportExport";
export const riscvBasicAluSchematic: ILSSchematic = {"id":"c-b1vflxaz","name":"RISCV Basic ALU","model":{"wires":[{"nodes":[{"id":0,"x":50,"y":49,"edges":[1,2]},{"id":1,"x":50,"y":45,"edges":[0,3]},{"id":2,"x":14,"y":49,"edges":[0,4]},{"id":3,"x":48,"y":45,"edges":[1],"ref":{"type":3,"id":"3","compNodeId":"out"}},{"id":4,"x":14,"y":45,"edges":[2,5]},{"id":5,"x":17,"y":45,"edges":[4],"ref":{"type":3,"id":"1","compNodeId":"in"}}]},{"nodes":[{"id":0,"x":18,"y":52,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"ctrl"}},{"id":1,"x":18,"y":34,"edges":[0],"ref":{"type":3,"id":"2","compNodeId":"regCtrl"}}]},{"nodes":[{"id":0,"x":39,"y":39,"edges":[1,2]},{"id":1,"x":12,"y":39,"edges":[0,3]},{"id":2,"x":39,"y":45,"edges":[0,4,5]},{"id":3,"x":12,"y":16,"edges":[1,6]},{"id":4,"x":44,"y":45,"edges":[2],"ref":{"type":3,"id":"3","compNodeId":"b"}},{"id":5,"x":37,"y":45,"edges":[2],"ref":{"type":3,"id":"1","compNodeId":"out"}},{"id":6,"x":9,"y":16,"edges":[3],"ref":{"type":3,"id":"4","compNodeId":"addr"}}]},{"nodes":[{"id":0,"x":9,"y":15,"edges":[1],"ref":{"type":3,"id":"4","compNodeId":"data"}},{"id":1,"x":14,"y":15,"edges":[0],"ref":{"type":3,"id":"2","compNodeId":"ins"}}]},{"nodes":[{"id":0,"x":54,"y":58,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"outB"}},{"id":1,"x":71,"y":58,"edges":[0,2]},{"id":2,"x":71,"y":61,"edges":[1],"ref":{"type":3,"id":"7","compNodeId":"rhs"}}]},{"nodes":[{"id":0,"x":66,"y":79,"edges":[1,2]},{"id":1,"x":66,"y":73,"edges":[0],"ref":{"type":3,"id":"7","compNodeId":"result"}},{"id":2,"x":12,"y":79,"edges":[0,3]},{"id":3,"x":12,"y":55,"edges":[2,4]},{"id":4,"x":14,"y":55,"edges":[3],"ref":{"type":3,"id":"0","compNodeId":"in"}}]},{"nodes":[{"id":0,"x":43,"y":43,"edges":[1],"ref":{"type":3,"id":"5","compNodeId":"out"}},{"id":1,"x":44,"y":43,"edges":[0],"ref":{"type":3,"id":"3","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":32,"y":34,"edges":[1],"ref":{"type":3,"id":"2","compNodeId":"aluCtrl"}},{"id":1,"x":32,"y":36,"edges":[0,2]},{"id":2,"x":56,"y":36,"edges":[1,3]},{"id":3,"x":56,"y":64,"edges":[2,4]},{"id":4,"x":58,"y":64,"edges":[3],"ref":{"type":3,"id":"7","compNodeId":"ctrl"}}]},{"nodes":[{"id":0,"x":54,"y":55,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"outA"}},{"id":1,"x":61,"y":55,"edges":[0,2]},{"id":2,"x":61,"y":61,"edges":[1],"ref":{"type":3,"id":"7","compNodeId":"lhs"}}]}],"comps":[{"id":"0","defId":"core/riscv/reg32","x":14,"y":52,"r":0},{"id":"1","defId":"core/flipflop/reg1","x":17,"y":43,"r":0},{"id":"2","defId":"core/riscv/insDecode0","x":14,"y":14,"r":0,"subSchematicId":"c-bdo4jd5a"},{"id":"3","defId":"core/math/adder","x":44,"y":41,"r":0,"subSchematicId":"c-63zedesz"},{"id":"4","defId":"core/mem/rom0","x":-23,"y":14,"r":0},{"id":"5","defId":"core/io/const32","x":40,"y":42,"r":0,"args":{"value":4,"valueMode":0,"bitWidth":32,"h":2,"w":3,"portPos":1,"rotate":null,"signed":false}},{"id":"7","defId":"core/riscv/alu0","x":58,"y":61,"r":0,"subSchematicId":"c-99bxrqes"}],"wireLabels":[]}};

export const riscvBasicAluSchematicStr = `#wire-schema 1
C 0 core/riscv/reg32 p:14,52,0 c:{}
C 1 core/flipflop/reg1 p:17,43,0 c:{}
C 2 core/riscv/insDecode0 p:14,14,0 c:{}
C 3 core/math/adder p:44,41,0 c:{}
C 4 core/mem/rom0 p:-23,14,0 c:{}
C 5 core/io/const32 p:40,42,0 c:{"value":4,"valueMode":0,"bitWidth":32,"h":2,"w":3,"portPos":1,"rotate":null,"signed":false}
C 7 core/riscv/alu0 p:58,61,0 c:{}
W 0 ns:[50,49|50,45,0|14,49,0|48,45,1 p:3/out|14,45,2|17,45,4 p:1/in]
W 1 ns:[18,52 p:0/ctrl|18,34,0 p:2/regCtrl]
W 2 ns:[39,39|12,39,0|39,45,0|12,16,1|44,45,2 p:3/b|37,45,2 p:1/out|9,16,3 p:4/addr]
W 3 ns:[9,15 p:4/data|14,15,0 p:2/ins]
W 4 ns:[54,58 p:0/outB|71,58,0|71,61,1 p:7/rhs]
W 5 ns:[66,79|66,73,0 p:7/result|12,79,0|12,55,2|14,55,3 p:0/in]
W 6 ns:[43,43 p:5/out|44,43,0 p:3/a]
W 7 ns:[32,34 p:2/aluCtrl|32,36,0|56,36,1|56,64,2|58,64,3 p:7/ctrl]
W 8 ns:[54,55 p:0/outA|61,55,0|61,61,1 p:7/lhs]
`;
