
import { ILSSchematic } from "@/src/cpu/ImportExport";
export const riscvBasicAddInsSchematic: ILSSchematic = {"id":"c-tas504jp","name":"RISCV Basic Add Ins","model":{"wires":[{"nodes":[{"id":0,"x":40,"y":39,"edges":[1,2]},{"id":1,"x":40,"y":35,"edges":[0,3]},{"id":2,"x":4,"y":39,"edges":[0,4]},{"id":3,"x":38,"y":35,"edges":[1],"ref":{"type":3,"id":"6","compNodeId":"out"}},{"id":4,"x":4,"y":35,"edges":[2,5],"ref":{"type":3,"id":"5","compNodeId":"out"}},{"id":5,"x":7,"y":35,"edges":[4],"ref":{"type":3,"id":"2","compNodeId":"in"}}]},{"nodes":[{"id":0,"x":8,"y":42,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"ctrl"}},{"id":1,"x":8,"y":24,"edges":[0],"ref":{"type":3,"id":"3","compNodeId":"regCtrl"}}]},{"nodes":[{"id":0,"x":29,"y":29,"edges":[1,2]},{"id":1,"x":2,"y":29,"edges":[0,3]},{"id":2,"x":29,"y":35,"edges":[0,4,5]},{"id":3,"x":2,"y":6,"edges":[1,6]},{"id":4,"x":34,"y":35,"edges":[2],"ref":{"type":3,"id":"6","compNodeId":"b"}},{"id":5,"x":27,"y":35,"edges":[2],"ref":{"type":3,"id":"2","compNodeId":"out"}},{"id":6,"x":-1,"y":6,"edges":[3],"ref":{"type":3,"id":"8","compNodeId":"addr"}}]},{"nodes":[{"id":0,"x":-1,"y":5,"edges":[1],"ref":{"type":3,"id":"8","compNodeId":"data"}},{"id":1,"x":4,"y":5,"edges":[0],"ref":{"type":3,"id":"3","compNodeId":"ins"}}]},{"nodes":[{"id":0,"x":44,"y":45,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"outA"}},{"id":1,"x":50,"y":45,"edges":[0,2],"ref":{"type":3,"id":"17","compNodeId":"a"}},{"id":2,"x":50,"y":46,"edges":[1]}]},{"nodes":[{"id":0,"x":50,"y":47,"edges":[1],"ref":{"type":3,"id":"17","compNodeId":"b"}},{"id":1,"x":47,"y":47,"edges":[0,2]},{"id":2,"x":47,"y":48,"edges":[1,3]},{"id":3,"x":44,"y":48,"edges":[2],"ref":{"type":3,"id":"0","compNodeId":"outB"}}]},{"nodes":[{"id":0,"x":54,"y":47,"edges":[1],"ref":{"type":3,"id":"17","compNodeId":"out"}},{"id":1,"x":56,"y":47,"edges":[0,2]},{"id":2,"x":56,"y":41,"edges":[1,3]},{"id":3,"x":2,"y":41,"edges":[2,4]},{"id":4,"x":2,"y":45,"edges":[3,5]},{"id":5,"x":4,"y":45,"edges":[4],"ref":{"type":3,"id":"0","compNodeId":"in"}}]},{"nodes":[{"id":0,"x":33,"y":33,"edges":[1],"ref":{"type":3,"id":"9","compNodeId":"out"}},{"id":1,"x":34,"y":33,"edges":[0],"ref":{"type":3,"id":"6","compNodeId":"a"}}]}],"comps":[{"id":"0","defId":"core/riscv/reg32","x":4,"y":42,"r":0},{"id":"2","defId":"core/flipflop/reg1","x":7,"y":33,"r":0},{"id":"3","defId":"core/riscv/insDecode0","x":4,"y":4,"r":0,"subSchematicId":"c-bdo4jd5a"},{"id":"6","defId":"core/math/adder","x":34,"y":31,"r":0,"subSchematicId":"c-63zedesz"},{"id":"8","defId":"core/mem/rom0","x":-33,"y":4,"r":0},{"id":"9","defId":"core/io/const32","x":30,"y":32,"r":0,"args":{"value":4,"valueMode":0,"bitWidth":32,"h":2,"w":3,"portPos":1,"rotate":null,"signed":false}},{"id":"17","defId":"core/math/adder","x":50,"y":43,"r":0,"subSchematicId":"c-63zedesz"}]}};

export const riscvBasicAddInsSchematicStr = `#wire-schema 1
C 0 core/riscv/reg32 p:4,42,0 c:{}
C 2 core/flipflop/reg1 p:7,33,0 c:{}
C 3 core/riscv/insDecode0 p:4,4,0 c:{}
C 6 core/math/adder p:34,31,0 c:{}
C 8 core/mem/rom0 p:-33,4,0 c:{}
C 9 core/io/const32 p:30,32,0 c:{"value":4,"valueMode":0,"bitWidth":32,"h":2,"w":3,"portPos":1,"rotate":null,"signed":false}
C 17 core/math/adder p:50,43,0 c:{}
W 0 ns:[40,39|40,35,0|4,39,0|38,35,1 p:6/out|4,35,2 p:5/out|7,35,4 p:2/in]
W 1 ns:[8,42 p:0/ctrl|8,24,0 p:3/regCtrl]
W 2 ns:[29,29|2,29,0|29,35,0|2,6,1|34,35,2 p:6/b|27,35,2 p:2/out|-1,6,3 p:8/addr]
W 3 ns:[-1,5 p:8/data|4,5,0 p:3/ins]
W 4 ns:[44,45 p:0/outA|50,45,0 p:17/a|50,46,1]
W 6 ns:[50,47 p:17/b|47,47,0|47,48,1|44,48,2 p:0/outB]
W 7 ns:[54,47 p:17/out|56,47,0|56,41,1|2,41,2|2,45,3|4,45,4 p:0/in]
W 8 ns:[33,33 p:9/out|34,33,0 p:6/a]
`;
