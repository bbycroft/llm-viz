
import { ILSSchematic } from "@/src/cpu/ImportExport";
export const pcCounterSchematic: ILSSchematic = {"id":"c-a7yetcbo","name":"PC Counter","model":{"wires":[{"nodes":[{"id":0,"x":41,"y":-9,"edges":[1],"ref":{"type":3,"id":"8","compNodeId":"out"}},{"id":1,"x":43,"y":-9,"edges":[0,2]},{"id":2,"x":43,"y":-5,"edges":[1,3]},{"id":3,"x":46,"y":-5,"edges":[2],"ref":{"type":3,"id":"7","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":40,"y":-3,"edges":[1],"ref":{"type":3,"id":"6","compNodeId":"out"}},{"id":1,"x":46,"y":-3,"edges":[0],"ref":{"type":3,"id":"7","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":50,"y":-3,"edges":[1],"ref":{"type":3,"id":"7","compNodeId":"out"}},{"id":1,"x":52,"y":-3,"edges":[0,2]},{"id":2,"x":52,"y":2,"edges":[1,3]},{"id":3,"x":18,"y":2,"edges":[2,4]},{"id":4,"x":18,"y":-3,"edges":[3,5]},{"id":5,"x":20,"y":-3,"edges":[4],"ref":{"type":3,"id":"6","compNodeId":"in"}}]}],"comps":[{"id":"6","defId":"core/flipflop/reg1","x":20,"y":-5,"r":0},{"id":"7","defId":"core/math/adder","x":46,"y":-7,"r":0,"subSchematicId":"c-63zedesz"},{"id":"8","defId":"core/io/const32","x":37,"y":-11,"r":0,"args":{"value":4,"valueMode":0,"bitWidth":32,"h":4,"w":4,"portPos":0,"rotate":0,"signed":false}}],"wireLabels":[{"id":"1","wireId":"2","text":"Next PC","numRenderFlags":9,"anchorPos":[30.392739247200147,2],"rectRelPos":[1.5,-2.5],"rectSize":[4,2]},{"id":"2","wireId":"1","text":"Curr PC","numRenderFlags":9,"anchorPos":[40.55276743948075,-3],"rectRelPos":[1.5,0.5],"rectSize":[4,2]}]}};

export const pcCounterSchematicStr = `#wire-schema 1
C 6 core/flipflop/reg1 p:20,-5,0 c:{}
C 7 core/math/adder p:46,-7,0 c:{}
C 8 core/io/const32 p:37,-11,0 c:{"value":4,"valueMode":0,"bitWidth":32,"h":4,"w":4,"portPos":0,"rotate":0,"signed":false}
W 0 ns:[41,-9 p:8/out|43,-9,0|43,-5,1|46,-5,2 p:7/a]
W 1 ns:[40,-3 p:6/out|46,-3,0 p:7/b]
W 2 ns:[50,-3 p:7/out|52,-3,0|52,2,1|18,2,2|18,-3,3|20,-3,4 p:6/in]
`;
