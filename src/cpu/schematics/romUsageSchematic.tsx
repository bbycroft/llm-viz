
import { ILSSchematic } from "@/src/cpu/schematics/SchematicLibrary";
export const romUsageSchematic: ILSSchematic = {"id":"c-s1m3zs3x","name":"ROM Usage","model":{"wires":[{"nodes":[{"id":0,"x":35,"y":5,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"addr"}},{"id":1,"x":37,"y":5,"edges":[0,2]},{"id":2,"x":37,"y":17,"edges":[1,3]},{"id":3,"x":82,"y":17,"edges":[2,4]},{"id":4,"x":82,"y":22,"edges":[3,6,7]},{"id":5,"x":79,"y":22,"edges":[7],"ref":{"type":3,"id":"4","compNodeId":"out"}},{"id":6,"x":88,"y":22,"edges":[4],"ref":{"type":3,"id":"5","compNodeId":"b"}},{"id":7,"x":82,"y":22,"edges":[5,4]}]},{"nodes":[{"id":0,"x":90,"y":22,"edges":[1],"ref":{"type":3,"id":"5","compNodeId":"out"}},{"id":1,"x":91,"y":22,"edges":[0,2]},{"id":2,"x":91,"y":29,"edges":[1,3]},{"id":3,"x":37,"y":29,"edges":[2,4]},{"id":4,"x":37,"y":22,"edges":[3,5]},{"id":5,"x":39,"y":22,"edges":[4],"ref":{"type":3,"id":"4","compNodeId":"in"}}]},{"nodes":[{"id":0,"x":86,"y":17,"edges":[1],"ref":{"type":3,"id":"6","compNodeId":"out"}},{"id":1,"x":86,"y":20,"edges":[0,2]},{"id":2,"x":88,"y":20,"edges":[1],"ref":{"type":3,"id":"5","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":53,"y":9,"edges":[1],"ref":{"type":3,"id":"3","compNodeId":"a"}},{"id":1,"x":42,"y":9,"edges":[0,2]},{"id":2,"x":42,"y":4,"edges":[1,3]},{"id":3,"x":35,"y":4,"edges":[2],"ref":{"type":3,"id":"0","compNodeId":"data"}}]}],"comps":[{"id":"0","defId":"core/mem/rom0","x":0,"y":3,"args":null},{"id":"3","defId":"core/comp/port","x":53,"y":7,"args":{"portId":"data","name":"Data Out","w":14,"h":4,"type":2,"portPos":2,"bitWidth":32,"signed":true,"valueMode":0,"inputOverride":false,"inputValueOverride":0}},{"id":"4","defId":"core/flipflop/reg1","x":39,"y":19,"args":null},{"id":"5","defId":"core/math/adder","x":88,"y":19,"args":null},{"id":"6","defId":"core/io/const32","x":84,"y":13,"args":{"value":4,"valueMode":0,"bitWidth":32,"h":4,"w":4,"portPos":1,"signed":false}}]}};

export const romUsageSchematicStr = `#wire-schema 1
C 0 core/mem/rom0 p:0,3
C 3 core/comp/port p:53,7 c:{"portId":"data","name":"Data Out","w":14,"h":4,"type":2,"portPos":2,"bitWidth":32,"signed":true,"valueMode":0,"inputOverride":false,"inputValueOverride":0}
C 4 core/flipflop/reg1 p:39,19
C 5 core/math/adder p:88,19
C 6 core/io/const32 p:84,13 c:{"value":4,"valueMode":0,"bitWidth":32,"h":4,"w":4,"portPos":1,"signed":false}
W 1 ns:[35,5 p:0/addr|37,5,0|37,17,1|82,17,2|82,22,3|79,22 p:4/out|88,22,4 p:5/b|82,22,5,4]
W 4 ns:[90,22 p:5/out|91,22,0|91,29,1|37,29,2|37,22,3|39,22,4 p:4/in]
W 5 ns:[86,17 p:6/out|86,20,0|88,20,1 p:5/a]
W 9 ns:[53,9 p:3/a|42,9,0|42,4,1|35,4,2 p:0/data]
`;
