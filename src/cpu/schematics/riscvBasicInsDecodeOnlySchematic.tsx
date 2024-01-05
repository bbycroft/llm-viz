
import { ILSSchematic } from "@/src/cpu/ImportExport";
export const riscvBasicInsDecodeOnlySchematic: ILSSchematic = {"id":"c-pwhp6e2e","name":"RISCV Basic Ins Decode Only","model":{"wires":[{"nodes":[{"id":0,"x":50,"y":49,"edges":[1,2]},{"id":1,"x":50,"y":45,"edges":[0,3]},{"id":2,"x":14,"y":49,"edges":[0,4]},{"id":3,"x":48,"y":45,"edges":[1],"ref":{"type":3,"id":"2","compNodeId":"out"}},{"id":4,"x":14,"y":45,"edges":[2,5]},{"id":5,"x":17,"y":45,"edges":[4],"ref":{"type":3,"id":"0","compNodeId":"in"}}]},{"nodes":[{"id":0,"x":39,"y":39,"edges":[1,2]},{"id":1,"x":12,"y":39,"edges":[0,3]},{"id":2,"x":39,"y":45,"edges":[0,4,5]},{"id":3,"x":12,"y":16,"edges":[1,6]},{"id":4,"x":44,"y":45,"edges":[2],"ref":{"type":3,"id":"2","compNodeId":"b"}},{"id":5,"x":37,"y":45,"edges":[2],"ref":{"type":3,"id":"0","compNodeId":"out"}},{"id":6,"x":9,"y":16,"edges":[3],"ref":{"type":3,"id":"3","compNodeId":"addr"}}]},{"nodes":[{"id":0,"x":9,"y":15,"edges":[1],"ref":{"type":3,"id":"3","compNodeId":"data"}},{"id":1,"x":14,"y":15,"edges":[0],"ref":{"type":3,"id":"1","compNodeId":"ins"}}]},{"nodes":[{"id":0,"x":15,"y":34,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"pcRegMuxCtrl"}},{"id":1,"x":15,"y":36,"edges":[0]}]},{"nodes":[{"id":0,"x":18,"y":34,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"regCtrl"}},{"id":1,"x":18,"y":36,"edges":[0]}]},{"nodes":[{"id":0,"x":29,"y":34,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"lhsSel"}},{"id":1,"x":29,"y":36,"edges":[0]}]},{"nodes":[{"id":0,"x":32,"y":34,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"aluCtrl"}},{"id":1,"x":32,"y":36,"edges":[0]}]},{"nodes":[{"id":0,"x":54,"y":32,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"imm"}},{"id":1,"x":56,"y":32,"edges":[0]}]},{"nodes":[{"id":0,"x":54,"y":22,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"rhsSel"}},{"id":1,"x":56,"y":22,"edges":[0]}]},{"nodes":[{"id":0,"x":54,"y":15,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"loadStoreCtrl"}},{"id":1,"x":56,"y":15,"edges":[0]}]},{"nodes":[{"id":0,"x":44,"y":43,"edges":[1],"ref":{"type":3,"id":"2","compNodeId":"a"}},{"id":1,"x":43,"y":43,"edges":[0],"ref":{"type":3,"id":"4","compNodeId":"out"}}]}],"comps":[{"id":"0","defId":"core/flipflop/reg1","x":17,"y":43,"r":0},{"id":"1","defId":"core/riscv/insDecode0","x":14,"y":14,"r":0,"subSchematicId":"c-bdo4jd5a"},{"id":"2","defId":"core/math/adder","x":44,"y":41,"r":0,"subSchematicId":"c-63zedesz"},{"id":"3","defId":"core/mem/rom0","x":-23,"y":14,"r":0},{"id":"4","defId":"core/io/const32","x":39,"y":42,"r":0,"args":{"value":4,"valueMode":0,"bitWidth":32,"h":2,"w":4,"portPos":1,"rotate":null,"signed":false}}]}};

export const riscvBasicInsDecodeOnlySchematicStr = `#wire-schema 1
C 0 core/flipflop/reg1 p:17,43,0 c:{}
C 1 core/riscv/insDecode0 p:14,14,0 c:{}
C 2 core/math/adder p:44,41,0 c:{}
C 3 core/mem/rom0 p:-23,14,0 c:{}
C 4 core/io/const32 p:39,42,0 c:{"value":4,"valueMode":0,"bitWidth":32,"h":2,"w":4,"portPos":1,"rotate":null,"signed":false}
W 0 ns:[50,49|50,45,0|14,49,0|48,45,1 p:2/out|14,45,2|17,45,4 p:0/in]
W 1 ns:[39,39|12,39,0|39,45,0|12,16,1|44,45,2 p:2/b|37,45,2 p:0/out|9,16,3 p:3/addr]
W 2 ns:[9,15 p:3/data|14,15,0 p:1/ins]
W 3 ns:[15,34 p:1/pcRegMuxCtrl|15,36,0]
W 4 ns:[18,34 p:1/regCtrl|18,36,0]
W 5 ns:[29,34 p:1/lhsSel|29,36,0]
W 6 ns:[32,34 p:1/aluCtrl|32,36,0]
W 7 ns:[54,32 p:1/imm|56,32,0]
W 8 ns:[54,22 p:1/rhsSel|56,22,0]
W 9 ns:[54,15 p:1/loadStoreCtrl|56,15,0]
W 10 ns:[44,43 p:2/a|43,43,0 p:4/out]
`;
