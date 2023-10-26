
import { ILSSchematic } from "@/src/cpu/schematics/SchematicLibrary";
export const romUsageSchematic: ILSSchematic = {"id":"c-s1m3zs3x","name":"ROM Usage","model":{"wires":[{"nodes":[{"id":0,"x":40,"y":15,"edges":[1],"ref":{"type":3,"id":"7","compNodeId":"addr"}},{"id":1,"x":44,"y":15,"edges":[0,2]},{"id":2,"x":44,"y":26,"edges":[1,3]},{"id":3,"x":92,"y":26,"edges":[2,4]},{"id":4,"x":92,"y":32,"edges":[3,5,6]},{"id":5,"x":98,"y":32,"edges":[4],"ref":{"type":3,"id":"10","compNodeId":"b"}},{"id":6,"x":89,"y":32,"edges":[4],"ref":{"type":3,"id":"9","compNodeId":"out"}}]},{"nodes":[{"id":0,"x":100,"y":32,"edges":[1],"ref":{"type":3,"id":"10","compNodeId":"out"}},{"id":1,"x":101,"y":32,"edges":[0,2]},{"id":2,"x":101,"y":39,"edges":[1,3]},{"id":3,"x":44,"y":39,"edges":[2,4]},{"id":4,"x":44,"y":32,"edges":[3,5]},{"id":5,"x":49,"y":32,"edges":[4],"ref":{"type":3,"id":"9","compNodeId":"in"}}]},{"nodes":[{"id":0,"x":96,"y":27,"edges":[1],"ref":{"type":3,"id":"11","compNodeId":"out"}},{"id":1,"x":96,"y":30,"edges":[0,2]},{"id":2,"x":98,"y":30,"edges":[1],"ref":{"type":3,"id":"10","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":49,"y":14,"edges":[1,2]},{"id":1,"x":49,"y":18,"edges":[0,3]},{"id":2,"x":40,"y":14,"edges":[0],"ref":{"type":3,"id":"7","compNodeId":"data"}},{"id":3,"x":60,"y":18,"edges":[1],"ref":{"type":3,"id":"8","compNodeId":"a"}}]}],"comps":[{"id":"7","defId":"core/mem/rom0","x":5,"y":13,"args":null},{"id":"8","defId":"core/comp/port","x":60,"y":16,"args":{"portId":"data","name":"Data Out","w":14,"h":4,"type":2,"portPos":2,"bitWidth":32,"signed":true,"valueMode":0,"inputOverride":false,"inputValueOverride":0}},{"id":"9","defId":"core/flipflop/reg1","x":49,"y":29,"args":null},{"id":"10","defId":"core/math/adder","x":98,"y":29,"args":null},{"id":"11","defId":"core/io/const32","x":94,"y":23,"args":{"value":4,"valueMode":0,"bitWidth":32,"h":4,"w":4,"portPos":1,"signed":false}}]}};

export const romUsageSchematicStr = `#wire-schema 1
C 7 core/mem/rom0 p:5,13
C 8 core/comp/port p:60,16 c:{"portId":"data","name":"Data Out","w":14,"h":4,"type":2,"portPos":2,"bitWidth":32,"signed":true,"valueMode":0,"inputOverride":false,"inputValueOverride":0}
C 9 core/flipflop/reg1 p:49,29
C 10 core/math/adder p:98,29
C 11 core/io/const32 p:94,23 c:{"value":4,"valueMode":0,"bitWidth":32,"h":4,"w":4,"portPos":1,"signed":false}
W 0 ns:[40,15 p:7/addr|44,15,0|44,26,1|92,26,2|92,32,3|98,32,4 p:10/b|89,32,4 p:9/out]
W 1 ns:[100,32 p:10/out|101,32,0|101,39,1|44,39,2|44,32,3|49,32,4 p:9/in]
W 2 ns:[96,27 p:11/out|96,30,0|98,30,1 p:10/a]
W 4 ns:[49,14|49,18,0|40,14,0 p:7/data|60,18,1 p:8/a]
`;
