
import { ILSSchematic } from "@/src/cpu/ImportExport";
export const riscvBasicAddInsSchematic: ILSSchematic = {"id":"c-tas504jp","name":"RISCV Basic Add Ins","model":{"wires":[{"nodes":[{"id":0,"x":40,"y":39,"edges":[1,2]},{"id":1,"x":40,"y":35,"edges":[0,3]},{"id":2,"x":4,"y":39,"edges":[0,4]},{"id":3,"x":38,"y":35,"edges":[1],"ref":{"type":3,"id":"6","compNodeId":"out"}},{"id":4,"x":4,"y":35,"edges":[2,5],"ref":{"type":3,"id":"5","compNodeId":"out"}},{"id":5,"x":7,"y":35,"edges":[4],"ref":{"type":3,"id":"2","compNodeId":"in"}}]},{"nodes":[{"id":0,"x":8,"y":42,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"ctrl"}},{"id":1,"x":8,"y":24,"edges":[0],"ref":{"type":3,"id":"3","compNodeId":"regCtrl"}}]},{"nodes":[{"id":0,"x":29,"y":29,"edges":[1,2]},{"id":1,"x":2,"y":29,"edges":[0,3]},{"id":2,"x":29,"y":35,"edges":[0,4,6]},{"id":3,"x":2,"y":6,"edges":[1,5]},{"id":4,"x":34,"y":35,"edges":[2],"ref":{"type":3,"id":"6","compNodeId":"b"}},{"id":5,"x":-1,"y":6,"edges":[3],"ref":{"type":3,"id":"8","compNodeId":"addr"}},{"id":6,"x":27,"y":35,"edges":[2],"ref":{"type":3,"id":"2","compNodeId":"out"}}]},{"nodes":[{"id":0,"x":-1,"y":5,"edges":[1],"ref":{"type":3,"id":"8","compNodeId":"data"}},{"id":1,"x":4,"y":5,"edges":[0],"ref":{"type":3,"id":"3","compNodeId":"ins"}}]},{"nodes":[{"id":0,"x":44,"y":45,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"outA"}},{"id":1,"x":50,"y":45,"edges":[0,2],"ref":{"type":3,"id":"17","compNodeId":"a"}},{"id":2,"x":50,"y":46,"edges":[1]}]},{"nodes":[{"id":0,"x":31,"y":32,"edges":[1],"ref":{"type":3,"id":"9","compNodeId":"out"}},{"id":1,"x":31,"y":33,"edges":[0,2]},{"id":2,"x":34,"y":33,"edges":[1],"ref":{"type":3,"id":"6","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":50,"y":47,"edges":[1],"ref":{"type":3,"id":"17","compNodeId":"b"}},{"id":1,"x":47,"y":47,"edges":[0,2]},{"id":2,"x":47,"y":48,"edges":[1,3]},{"id":3,"x":44,"y":48,"edges":[2],"ref":{"type":3,"id":"0","compNodeId":"outB"}}]},{"nodes":[{"id":0,"x":54,"y":47,"edges":[1],"ref":{"type":3,"id":"17","compNodeId":"out"}},{"id":1,"x":56,"y":47,"edges":[0,2]},{"id":2,"x":56,"y":41,"edges":[1,3]},{"id":3,"x":2,"y":41,"edges":[2,4]},{"id":4,"x":2,"y":45,"edges":[3,5]},{"id":5,"x":4,"y":45,"edges":[4],"ref":{"type":3,"id":"0","compNodeId":"in"}}]}],"comps":[{"id":"0","defId":"core/riscv/reg32","x":4,"y":42},{"id":"2","defId":"core/flipflop/reg1","x":7,"y":33},{"id":"3","defId":"core/riscv/insDecode0","x":4,"y":4},{"id":"6","defId":"core/math/adder","x":34,"y":31},{"id":"8","defId":"core/mem/rom0","x":-36,"y":4},{"id":"9","defId":"core/io/const32","x":30,"y":30,"args":{"value":4,"valueMode":0,"bitWidth":32,"h":2,"w":2,"portPos":1,"signed":false,"rotate":null}},{"id":"17","defId":"core/math/adder","x":50,"y":43}]}};

export const riscvBasicAddInsSchematicStr = `#wire-schema 1
C 0 core/riscv/reg32 p:4,42 c:{}
C 2 core/flipflop/reg1 p:7,33 c:{}
C 3 core/riscv/insDecode0 p:4,4 c:{}
C 6 core/math/adder p:34,31 c:{}
C 8 core/mem/rom0 p:-36,4 c:{}
C 9 core/io/const32 p:30,30 c:{"value":4,"valueMode":0,"bitWidth":32,"h":2,"w":2,"portPos":1,"signed":false,"rotate":null}
C 17 core/math/adder p:50,43 c:{}
W 1 ns:[40,39|40,35,0|4,39,0|38,35,1 p:6/out|4,35,2 p:5/out|7,35,4 p:2/in]
W 2 ns:[8,42 p:0/ctrl|8,24,0 p:3/regCtrl]
W 3 ns:[]
W 5 ns:[29,29|2,29,0|29,35,0|2,6,1|34,35,2 p:6/b|-1,6,3 p:8/addr|27,35,2 p:2/out]
W 6 ns:[]
W 7 ns:[]
W 8 ns:[]
W 9 ns:[]
W 10 ns:[]
W 11 ns:[]
W 12 ns:[]
W 13 ns:[]
W 14 ns:[]
W 15 ns:[]
W 16 ns:[]
W 18 ns:[]
W 19 ns:[]
W 20 ns:[-1,5 p:8/data|4,5,0 p:3/ins]
W 21 ns:[]
W 23 ns:[]
W 25 ns:[]
W 26 ns:[]
W 27 ns:[44,45 p:0/outA|50,45,0 p:17/a|50,46,1]
W 28 ns:[]
W 29 ns:[31,32 p:9/out|31,33,0|34,33,1 p:6/a]
W 30 ns:[50,47 p:17/b|47,47,0|47,48,1|44,48,2 p:0/outB]
W 31 ns:[54,47 p:17/out|56,47,0|56,41,1|2,41,2|2,45,3|4,45,4 p:0/in]
`;
