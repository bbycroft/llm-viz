
import { ILSSchematic } from "@/src/cpu/schematics/SchematicLibrary";
export const pcCounterSchematic: ILSSchematic = {"id":"c-a7yetcbo","name":"PC Counter","model":{"wires":[{"nodes":[{"id":0,"x":41,"y":-12,"edges":[1],"ref":{"type":3,"id":"8","compNodeId":"out"}},{"id":1,"x":44,"y":-12,"edges":[0,2]},{"id":2,"x":44,"y":-6,"edges":[1,3]},{"id":3,"x":47,"y":-6,"edges":[2],"ref":{"type":3,"id":"7","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":41,"y":-4,"edges":[1],"ref":{"type":3,"id":"6","compNodeId":"out"}},{"id":1,"x":45,"y":-4,"edges":[0,2]},{"id":2,"x":45,"y":-4,"edges":[1,3]},{"id":3,"x":47,"y":-4,"edges":[2],"ref":{"type":3,"id":"7","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":49,"y":-4,"edges":[1],"ref":{"type":3,"id":"7","compNodeId":"out"}},{"id":1,"x":52,"y":-4,"edges":[0,2]},{"id":2,"x":52,"y":3,"edges":[1,3]},{"id":3,"x":-2,"y":3,"edges":[2,4]},{"id":4,"x":-2,"y":-4,"edges":[3,5]},{"id":5,"x":1,"y":-4,"edges":[4],"ref":{"type":3,"id":"6","compNodeId":"in"}}]}],"comps":[{"id":"6","defId":"core/flipflop/reg1","x":1,"y":-7,"args":null},{"id":"7","defId":"core/math/adder","x":47,"y":-7,"args":null},{"id":"8","defId":"core/io/const32","x":37,"y":-14,"args":{"value":4,"valueMode":0,"bitWidth":32,"h":4,"w":4,"portPos":0,"signed":false}}]}};

export const pcCounterSchematicStr = `#wire-schema 1
C 6 core/flipflop/reg1 p:1,-7
C 7 core/math/adder p:47,-7
C 8 core/io/const32 p:37,-14 c:{"value":4,"valueMode":0,"bitWidth":32,"h":4,"w":4,"portPos":0,"signed":false}
W 0 ns:[41,-12 p:8/out|44,-12,0|44,-6,1|47,-6,2 p:7/a]
W 1 ns:[41,-4 p:6/out|45,-4,0|45,-4,1|47,-4,2 p:7/b]
W 2 ns:[49,-4 p:7/out|52,-4,0|52,3,1|-2,3,2|-2,-4,3|1,-4,4 p:6/in]
`;
