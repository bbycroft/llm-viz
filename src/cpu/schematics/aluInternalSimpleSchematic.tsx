
import { ILSSchematic } from "@/src/cpu/ImportExport";
export const aluInternalSimpleSchematic: ILSSchematic = {"id":"c-99bxrqes","name":"ALU Internal Simple","parentCompDefId":"core/riscv/alu0","parentComp":{"id":"","defId":"core/riscv/alu0","x":0,"y":0,"r":0},"compBbox":{"minX":-16,"minY":-13,"maxX":83,"maxY":68},"model":{"wires":[{"nodes":[{"id":0,"x":20,"y":7,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"b"}},{"id":1,"x":18,"y":7,"edges":[0],"ref":{"type":3,"id":"3","compNodeId":"o"}}]},{"nodes":[{"id":0,"x":13,"y":6,"edges":[1],"ref":{"type":3,"id":"6","compNodeId":"b"}},{"id":1,"x":14,"y":6,"edges":[0],"ref":{"type":3,"id":"3","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":25,"y":55,"edges":[1],"ref":{"type":3,"id":"12","compNodeId":"o"}},{"id":1,"x":30,"y":55,"edges":[0,2]},{"id":2,"x":30,"y":58,"edges":[1,3]},{"id":3,"x":32,"y":58,"edges":[2],"ref":{"type":3,"id":"11","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":32,"y":60,"edges":[1],"ref":{"type":3,"id":"11","compNodeId":"b"}},{"id":1,"x":30,"y":60,"edges":[0,2]},{"id":2,"x":30,"y":63,"edges":[1,3]},{"id":3,"x":25,"y":63,"edges":[2],"ref":{"type":3,"id":"14","compNodeId":"o"}}]},{"nodes":[{"id":0,"x":34,"y":59,"edges":[1],"ref":{"type":3,"id":"11","compNodeId":"out"}},{"id":1,"x":36,"y":59,"edges":[0,2]},{"id":2,"x":36,"y":51,"edges":[1,3]},{"id":3,"x":37,"y":51,"edges":[2],"ref":{"type":3,"id":"16","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":34,"y":42,"edges":[1],"ref":{"type":3,"id":"15","compNodeId":"out"}},{"id":1,"x":36,"y":42,"edges":[0,2]},{"id":2,"x":36,"y":49,"edges":[1,3]},{"id":3,"x":37,"y":49,"edges":[2],"ref":{"type":3,"id":"16","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":39,"y":20,"edges":[1],"ref":{"type":3,"id":"18","compNodeId":"out"}},{"id":1,"x":41,"y":20,"edges":[0,2]},{"id":2,"x":41,"y":32,"edges":[1,3]},{"id":3,"x":42,"y":32,"edges":[2],"ref":{"type":3,"id":"10","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":24,"y":7,"edges":[1],"ref":{"type":3,"id":"0","compNodeId":"out"}},{"id":1,"x":30,"y":7,"edges":[0,2]},{"id":2,"x":30,"y":11,"edges":[1,3]},{"id":3,"x":32,"y":11,"edges":[2],"ref":{"type":3,"id":"19","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":34,"y":12,"edges":[1],"ref":{"type":3,"id":"19","compNodeId":"out"}},{"id":1,"x":36,"y":12,"edges":[0,2]},{"id":2,"x":36,"y":19,"edges":[1,3]},{"id":3,"x":37,"y":19,"edges":[2],"ref":{"type":3,"id":"18","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":38,"y":18,"edges":[1],"ref":{"type":3,"id":"18","compNodeId":"sel"}},{"id":1,"x":40,"y":18,"edges":[0,2,3]},{"id":2,"x":40,"y":48,"edges":[1,4]},{"id":3,"x":40,"y":4,"edges":[1,5]},{"id":4,"x":38,"y":48,"edges":[2],"ref":{"type":3,"id":"16","compNodeId":"sel"}},{"id":5,"x":29,"y":4,"edges":[3,6]},{"id":6,"x":29,"y":-2,"edges":[5],"ref":{"type":3,"id":"1","compNodeId":"o_0_1"}}]},{"nodes":[{"id":0,"x":25,"y":37,"edges":[1],"ref":{"type":3,"id":"13","compNodeId":"o"}},{"id":1,"x":30,"y":37,"edges":[0,2]},{"id":2,"x":30,"y":41,"edges":[1,3]},{"id":3,"x":32,"y":41,"edges":[2],"ref":{"type":3,"id":"15","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":43,"y":31,"edges":[1],"ref":{"type":3,"id":"10","compNodeId":"sel"}},{"id":1,"x":45,"y":31,"edges":[0,2]},{"id":2,"x":45,"y":3,"edges":[1,3]},{"id":3,"x":28,"y":3,"edges":[2,4]},{"id":4,"x":28,"y":-2,"edges":[3],"ref":{"type":3,"id":"1","compNodeId":"o_0_0"}}]},{"nodes":[{"id":0,"x":19,"y":47,"edges":[1],"ref":{"type":3,"id":"21","compNodeId":"o_0_0"}},{"id":1,"x":20,"y":47,"edges":[0],"ref":{"type":3,"id":"26","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":36,"y":21,"edges":[1,2]},{"id":1,"x":37,"y":21,"edges":[0],"ref":{"type":3,"id":"18","compNodeId":"b"}},{"id":2,"x":36,"y":29,"edges":[0,3]},{"id":3,"x":32,"y":29,"edges":[2],"ref":{"type":3,"id":"40","compNodeId":"o"}}]},{"nodes":[{"id":0,"x":35,"y":23,"edges":[1,2,3]},{"id":1,"x":35,"y":10,"edges":[0,4,5]},{"id":2,"x":35,"y":40,"edges":[0,6,7]},{"id":3,"x":26,"y":23,"edges":[0],"ref":{"type":3,"id":"24","compNodeId":"i"}},{"id":4,"x":35,"y":5,"edges":[1,8]},{"id":5,"x":33,"y":10,"edges":[1],"ref":{"type":3,"id":"19","compNodeId":"sel"}},{"id":6,"x":33,"y":40,"edges":[2],"ref":{"type":3,"id":"15","compNodeId":"sel"}},{"id":7,"x":35,"y":57,"edges":[2,9]},{"id":8,"x":30,"y":5,"edges":[4,10]},{"id":9,"x":33,"y":57,"edges":[7],"ref":{"type":3,"id":"11","compNodeId":"sel"}},{"id":10,"x":30,"y":-2,"edges":[8],"ref":{"type":3,"id":"1","compNodeId":"o_0_2"}}]},{"nodes":[{"id":0,"x":23,"y":23,"edges":[1],"ref":{"type":3,"id":"24","compNodeId":"o"}},{"id":1,"x":21,"y":23,"edges":[0,2]},{"id":2,"x":21,"y":25,"edges":[1],"ref":{"type":3,"id":"39","compNodeId":"signed"}}]},{"nodes":[{"id":0,"x":16,"y":17,"edges":[1],"ref":{"type":3,"id":"27","compNodeId":"i"}},{"id":1,"x":6,"y":17,"edges":[0,2,3]},{"id":2,"x":6,"y":5,"edges":[1,4,5]},{"id":3,"x":6,"y":29,"edges":[1,6,7]},{"id":4,"x":20,"y":5,"edges":[2],"ref":{"type":3,"id":"0","compNodeId":"a"}},{"id":5,"x":6,"y":-9,"edges":[2,8]},{"id":6,"x":20,"y":29,"edges":[3],"ref":{"type":3,"id":"39","compNodeId":"b"}},{"id":7,"x":6,"y":38,"edges":[3,9,10]},{"id":8,"x":60,"y":-9,"edges":[5,11,12]},{"id":9,"x":6,"y":47,"edges":[7,13,14]},{"id":10,"x":21,"y":38,"edges":[7],"ref":{"type":3,"id":"13","compNodeId":"b"}},{"id":11,"x":60,"y":12,"edges":[8,15]},{"id":12,"x":71,"y":-9,"edges":[8,16]},{"id":13,"x":16,"y":47,"edges":[9],"ref":{"type":3,"id":"21","compNodeId":"i"}},{"id":14,"x":6,"y":56,"edges":[9,17,18]},{"id":15,"x":64,"y":12,"edges":[11],"ref":{"type":3,"id":"30","compNodeId":"b"}},{"id":16,"x":71,"y":-12,"edges":[12],"ref":{"type":3,"id":"5","compNodeId":"a"}},{"id":17,"x":21,"y":56,"edges":[14],"ref":{"type":3,"id":"12","compNodeId":"b"}},{"id":18,"x":6,"y":64,"edges":[14,19]},{"id":19,"x":21,"y":64,"edges":[18],"ref":{"type":3,"id":"14","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":24,"y":17,"edges":[1],"ref":{"type":3,"id":"25","compNodeId":"out"}},{"id":1,"x":30,"y":17,"edges":[0,2]},{"id":2,"x":30,"y":13,"edges":[1,3]},{"id":3,"x":32,"y":13,"edges":[2],"ref":{"type":3,"id":"19","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":20,"y":17,"edges":[1],"ref":{"type":3,"id":"25","compNodeId":"b"}},{"id":1,"x":19,"y":17,"edges":[0],"ref":{"type":3,"id":"27","compNodeId":"o_0_0"}}]},{"nodes":[{"id":0,"x":24,"y":47,"edges":[1],"ref":{"type":3,"id":"26","compNodeId":"out"}},{"id":1,"x":30,"y":47,"edges":[0,2]},{"id":2,"x":30,"y":43,"edges":[1,3]},{"id":3,"x":32,"y":43,"edges":[2],"ref":{"type":3,"id":"15","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":39,"y":50,"edges":[1],"ref":{"type":3,"id":"16","compNodeId":"out"}},{"id":1,"x":41,"y":50,"edges":[0,2]},{"id":2,"x":41,"y":34,"edges":[1,3]},{"id":3,"x":42,"y":34,"edges":[2],"ref":{"type":3,"id":"10","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":62,"y":-2,"edges":[1],"ref":{"type":3,"id":"31","compNodeId":"o_0_2"}},{"id":1,"x":62,"y":0,"edges":[0,2]},{"id":2,"x":75,"y":0,"edges":[1,3]},{"id":3,"x":75,"y":13,"edges":[2],"ref":{"type":3,"id":"32","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":48,"y":2,"edges":[1],"ref":{"type":3,"id":"34","compNodeId":"i"}},{"id":1,"x":48,"y":0,"edges":[0,2,3]},{"id":2,"x":31,"y":0,"edges":[1,4]},{"id":3,"x":54,"y":0,"edges":[1,5]},{"id":4,"x":31,"y":-2,"edges":[2],"ref":{"type":3,"id":"1","compNodeId":"o_4_0"}},{"id":5,"x":54,"y":7,"edges":[3],"ref":{"type":3,"id":"38","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":48,"y":5,"edges":[1],"ref":{"type":3,"id":"34","compNodeId":"o"}},{"id":1,"x":48,"y":7,"edges":[0],"ref":{"type":3,"id":"33","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":47,"y":11,"edges":[1],"ref":{"type":3,"id":"33","compNodeId":"o"}},{"id":1,"x":47,"y":38,"edges":[0],"ref":{"type":3,"id":"42","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":74,"y":17,"edges":[1],"ref":{"type":3,"id":"32","compNodeId":"o"}},{"id":1,"x":74,"y":18,"edges":[0,2]},{"id":2,"x":51,"y":18,"edges":[1,3]},{"id":3,"x":51,"y":36,"edges":[2],"ref":{"type":3,"id":"43","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":68,"y":10,"edges":[1],"ref":{"type":3,"id":"30","compNodeId":"outEq"}},{"id":1,"x":70,"y":10,"edges":[0],"ref":{"type":3,"id":"36","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":68,"y":12,"edges":[1],"ref":{"type":3,"id":"30","compNodeId":"outLt"}},{"id":1,"x":70,"y":12,"edges":[0],"ref":{"type":3,"id":"36","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":65,"y":6,"edges":[1],"ref":{"type":3,"id":"37","compNodeId":"o"}},{"id":1,"x":65,"y":8,"edges":[0],"ref":{"type":3,"id":"30","compNodeId":"signed"}}]},{"nodes":[{"id":0,"x":65,"y":3,"edges":[1],"ref":{"type":3,"id":"37","compNodeId":"i"}},{"id":1,"x":65,"y":2,"edges":[0,2]},{"id":2,"x":63,"y":2,"edges":[1,3]},{"id":3,"x":63,"y":-2,"edges":[2],"ref":{"type":3,"id":"31","compNodeId":"o_0_1"}}]},{"nodes":[{"id":0,"x":64,"y":-2,"edges":[1],"ref":{"type":3,"id":"31","compNodeId":"o_0_0"}},{"id":1,"x":64,"y":1,"edges":[0,2]},{"id":2,"x":71,"y":1,"edges":[1,3]},{"id":3,"x":71,"y":9,"edges":[2],"ref":{"type":3,"id":"36","compNodeId":"sel"}}]},{"nodes":[{"id":0,"x":72,"y":11,"edges":[1],"ref":{"type":3,"id":"36","compNodeId":"out"}},{"id":1,"x":73,"y":11,"edges":[0,2]},{"id":2,"x":73,"y":13,"edges":[1],"ref":{"type":3,"id":"32","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":-7,"y":-7,"edges":[1,2]},{"id":1,"x":-7,"y":6,"edges":[0,3]},{"id":2,"x":30,"y":-7,"edges":[0,4,5]},{"id":3,"x":-22,"y":6,"edges":[1],"ref":{"type":3,"id":"2","compNodeId":"a"}},{"id":4,"x":30,"y":-5,"edges":[2],"ref":{"type":3,"id":"1","compNodeId":"i"}},{"id":5,"x":63,"y":-7,"edges":[2,6]},{"id":6,"x":63,"y":-5,"edges":[5],"ref":{"type":3,"id":"31","compNodeId":"i"}}]},{"nodes":[{"id":0,"x":53,"y":11,"edges":[1],"ref":{"type":3,"id":"38","compNodeId":"o"}},{"id":1,"x":53,"y":38,"edges":[0],"ref":{"type":3,"id":"43","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":45,"y":36,"edges":[1],"ref":{"type":3,"id":"42","compNodeId":"a"}},{"id":1,"x":45,"y":33,"edges":[0,2]},{"id":2,"x":44,"y":33,"edges":[1],"ref":{"type":3,"id":"10","compNodeId":"out"}}]},{"nodes":[{"id":0,"x":4,"y":68,"edges":[1],"ref":{"type":3,"id":"9","compNodeId":"a"}},{"id":1,"x":4,"y":66,"edges":[0,2]},{"id":2,"x":51,"y":66,"edges":[1,3]},{"id":3,"x":51,"y":40,"edges":[2],"ref":{"type":3,"id":"43","compNodeId":"o"}}]},{"nodes":[{"id":0,"x":-4,"y":-13,"edges":[1],"ref":{"type":3,"id":"4","compNodeId":"a"}},{"id":1,"x":-4,"y":-11,"edges":[0,2]},{"id":2,"x":4,"y":-11,"edges":[1,3,4]},{"id":3,"x":4,"y":8,"edges":[2,5,6]},{"id":4,"x":58,"y":-11,"edges":[2,7]},{"id":5,"x":4,"y":15,"edges":[3,8,9]},{"id":6,"x":14,"y":8,"edges":[3],"ref":{"type":3,"id":"3","compNodeId":"b"}},{"id":7,"x":58,"y":10,"edges":[4,10]},{"id":8,"x":20,"y":15,"edges":[5],"ref":{"type":3,"id":"25","compNodeId":"a"}},{"id":9,"x":4,"y":27,"edges":[5,11,12]},{"id":10,"x":64,"y":10,"edges":[7],"ref":{"type":3,"id":"30","compNodeId":"a"}},{"id":11,"x":20,"y":27,"edges":[9],"ref":{"type":3,"id":"39","compNodeId":"a"}},{"id":12,"x":4,"y":36,"edges":[9,13,14]},{"id":13,"x":4,"y":45,"edges":[12,15,16]},{"id":14,"x":21,"y":36,"edges":[12],"ref":{"type":3,"id":"13","compNodeId":"a"}},{"id":15,"x":4,"y":54,"edges":[13,17,18]},{"id":16,"x":20,"y":45,"edges":[13],"ref":{"type":3,"id":"26","compNodeId":"a"}},{"id":17,"x":21,"y":54,"edges":[15],"ref":{"type":3,"id":"12","compNodeId":"a"}},{"id":18,"x":4,"y":62,"edges":[15,19]},{"id":19,"x":21,"y":62,"edges":[18],"ref":{"type":3,"id":"14","compNodeId":"a"}}]},{"nodes":[{"id":0,"x":24,"y":29,"edges":[1],"ref":{"type":3,"id":"39","compNodeId":"outLt"}},{"id":1,"x":29,"y":29,"edges":[0],"ref":{"type":3,"id":"40","compNodeId":"i_1_0"}}]},{"nodes":[{"id":0,"x":24,"y":27,"edges":[1],"ref":{"type":3,"id":"39","compNodeId":"outEq"}},{"id":1,"x":25,"y":27,"edges":[0]}]},{"nodes":[{"id":0,"x":32,"y":-1,"edges":[1,2]},{"id":1,"x":32,"y":-2,"edges":[0],"ref":{"type":3,"id":"1","compNodeId":"o_1_0"}},{"id":2,"x":46,"y":-1,"edges":[0,3,4]},{"id":3,"x":46,"y":7,"edges":[2],"ref":{"type":3,"id":"33","compNodeId":"b"}},{"id":4,"x":52,"y":-1,"edges":[2,5]},{"id":5,"x":52,"y":7,"edges":[4],"ref":{"type":3,"id":"38","compNodeId":"b"}}]},{"nodes":[{"id":0,"x":27,"y":-1,"edges":[1,2]},{"id":1,"x":27,"y":-2,"edges":[0],"ref":{"type":3,"id":"1","compNodeId":"o_3_0"}},{"id":2,"x":10,"y":-1,"edges":[0,3]},{"id":3,"x":10,"y":6,"edges":[2,4,5]},{"id":4,"x":10,"y":10,"edges":[3,6,7]},{"id":5,"x":11,"y":6,"edges":[3],"ref":{"type":3,"id":"6","compNodeId":"a"}},{"id":6,"x":19,"y":10,"edges":[4,8]},{"id":7,"x":10,"y":42,"edges":[4,9]},{"id":8,"x":19,"y":8,"edges":[6,10]},{"id":9,"x":21,"y":42,"edges":[7,11]},{"id":10,"x":20,"y":8,"edges":[8],"ref":{"type":3,"id":"0","compNodeId":"carryIn"}},{"id":11,"x":21,"y":43,"edges":[9],"ref":{"type":3,"id":"26","compNodeId":"arith"}}]},{"nodes":[{"id":0,"x":45,"y":64,"edges":[1,2]},{"id":1,"x":33,"y":64,"edges":[0,3]},{"id":2,"x":45,"y":40,"edges":[0],"ref":{"type":3,"id":"42","compNodeId":"o"}},{"id":3,"x":33,"y":68,"edges":[1],"ref":{"type":3,"id":"7","compNodeId":"a"}}]}],"comps":[{"id":"0","defId":"core/math/adder","x":20,"y":3,"r":0,"args":{"carryInPort":true,"carryOutPort":false},"subSchematicId":"c-63zedesz"},{"id":"1","defId":"core/bits/expand-multi","x":33,"y":-5,"r":1,"args":{"bitWidth":6,"bitRange":[{"start":5,"end":5,"individual":false,"showBits":true,"id":3},{"start":2,"end":4,"individual":true,"showBits":true,"id":0},{"start":1,"end":1,"individual":false,"showBits":true,"id":4},{"start":0,"end":0,"showBits":true,"individual":false,"id":1}],"collapse":false,"reverse":true,"rotate":1}},{"id":"2","defId":"core/comp/port","x":-28,"y":3,"r":0,"args":{"portId":"ctrl","name":"","w":6,"h":6,"type":1,"portPos":0,"rotate":0,"bitWidth":6,"signed":false,"flags":3,"valueMode":2,"inputOverride":false,"inputValueOverride":14}},{"id":"3","defId":"core/gate/xor","x":14,"y":5,"r":0,"args":{"rotate":0,"bitWidth":32}},{"id":"4","defId":"core/comp/port","x":-1,"y":-19,"r":1,"args":{"portId":"lhs","name":"","w":6,"h":6,"type":1,"portPos":0,"rotate":1,"bitWidth":32,"signed":false,"flags":0,"valueMode":1,"inputOverride":false,"inputValueOverride":4}},{"id":"5","defId":"core/comp/port","x":74,"y":-18,"r":1,"args":{"portId":"rhs","name":"","w":6,"h":6,"type":1,"portPos":0,"rotate":1,"bitWidth":32,"signed":false,"flags":0,"valueMode":1,"inputOverride":false,"inputValueOverride":5}},{"id":"6","defId":"core/bits/expand","x":11,"y":5,"r":0,"args":{"rotate":0,"bitWidth":32}},{"id":"7","defId":"core/comp/port","x":30,"y":74,"r":3,"args":{"portId":"result","name":"","w":6,"h":6,"type":2,"portPos":0,"rotate":3,"bitWidth":32,"signed":false,"flags":0,"valueMode":1,"inputOverride":false,"inputValueOverride":0}},{"id":"9","defId":"core/comp/port","x":1,"y":74,"r":3,"args":{"portId":"branch","name":"","w":6,"h":6,"type":2,"portPos":0,"rotate":3,"bitWidth":1,"signed":false,"flags":0,"valueMode":1,"inputOverride":false,"inputValueOverride":0}},{"id":"10","defId":"core/flow/mux2","x":42,"y":31,"r":0,"args":{"rotate":0,"bitWidth":32,"reverse":false},"subSchematicId":"c-6f4cdt0t"},{"id":"11","defId":"core/flow/mux2","x":32,"y":57,"r":0,"args":{"rotate":0,"bitWidth":32,"reverse":false},"subSchematicId":"c-6f4cdt0t"},{"id":"12","defId":"core/gate/or","x":21,"y":53,"r":0,"args":{"rotate":0,"bitWidth":32,"extId":""}},{"id":"13","defId":"core/gate/xor","x":21,"y":35,"r":0,"args":{"rotate":0,"bitWidth":32}},{"id":"14","defId":"core/gate/and","x":21,"y":61,"r":0,"args":{"rotate":0,"bitWidth":32}},{"id":"15","defId":"core/flow/mux2","x":32,"y":40,"r":0,"args":{"rotate":0,"bitWidth":32,"reverse":false},"subSchematicId":"c-6f4cdt0t"},{"id":"16","defId":"core/flow/mux2","x":37,"y":48,"r":0,"args":{"rotate":0,"bitWidth":32,"reverse":false},"subSchematicId":"c-6f4cdt0t"},{"id":"18","defId":"core/flow/mux2","x":37,"y":18,"r":0,"args":{"rotate":0,"bitWidth":32,"reverse":false},"subSchematicId":"c-6f4cdt0t"},{"id":"19","defId":"core/flow/mux2","x":32,"y":10,"r":0,"args":{"rotate":0,"bitWidth":32,"reverse":false},"subSchematicId":"c-6f4cdt0t"},{"id":"21","defId":"core/bits/expand-multi","x":16,"y":45,"r":0,"args":{"bitWidth":32,"bitRange":[{"start":0,"end":4,"individual":false,"showBits":false,"id":0}],"collapse":false,"reverse":false,"rotate":0}},{"id":"24","defId":"core/gate/not","x":26,"y":24,"r":2,"args":{"rotate":2,"bitWidth":1}},{"id":"25","defId":"core/math/shiftLeft","x":20,"y":13,"r":0},{"id":"26","defId":"core/math/shiftRight","x":20,"y":43,"r":0},{"id":"27","defId":"core/bits/expand-multi","x":16,"y":15,"r":0,"args":{"bitWidth":32,"bitRange":[{"start":0,"end":4,"individual":false,"showBits":false,"id":0}],"collapse":false,"reverse":false,"rotate":0}},{"id":"30","defId":"core/math/comparitor","x":64,"y":8,"r":0},{"id":"31","defId":"core/bits/expand-multi","x":65,"y":-5,"r":1,"args":{"bitWidth":6,"bitRange":[{"start":2,"end":4,"individual":true,"showBits":true,"id":0}],"collapse":false,"reverse":false,"rotate":1}},{"id":"32","defId":"core/gate/xor","x":76,"y":13,"r":1,"args":{"rotate":1,"bitWidth":1}},{"id":"33","defId":"core/gate/and","x":49,"y":7,"r":1,"args":{"rotate":1,"bitWidth":1}},{"id":"34","defId":"core/gate/not","x":49,"y":2,"r":1,"args":{"rotate":1,"bitWidth":1}},{"id":"36","defId":"core/flow/mux2","x":70,"y":9,"r":0,"args":{"rotate":0,"bitWidth":32,"reverse":false},"subSchematicId":"c-6f4cdt0t"},{"id":"37","defId":"core/gate/not","x":66,"y":3,"r":1,"args":{"rotate":1,"bitWidth":1}},{"id":"38","defId":"core/gate/and","x":55,"y":7,"r":1,"args":{"rotate":1,"bitWidth":1}},{"id":"39","defId":"core/math/comparitor","x":20,"y":25,"r":0},{"id":"40","defId":"core/bits/expand-multi","x":32,"y":30,"r":2,"args":{"bitWidth":32,"bitRange":[{"start":1,"end":1,"individual":false,"showBits":true,"id":0},{"start":0,"end":0,"showBits":true,"individual":false,"id":1}],"collapse":true,"reverse":true,"rotate":0}},{"id":"42","defId":"core/gate/and-bcast","x":47,"y":36,"r":1,"args":{"rotate":0,"bitWidth":32}},{"id":"43","defId":"core/gate/and-bcast","x":53,"y":36,"r":1,"args":{"rotate":0,"bitWidth":32}}]}};

export const aluInternalSimpleSchematicStr = `#wire-schema 1
C 0 core/math/adder p:20,3,0 c:{"carryInPort":true,"carryOutPort":false}
C 1 core/bits/expand-multi p:33,-5,1 c:{"bitWidth":6,"bitRange":[{"start":5,"end":5,"individual":false,"showBits":true,"id":3},{"start":2,"end":4,"individual":true,"showBits":true,"id":0},{"start":1,"end":1,"individual":false,"showBits":true,"id":4},{"start":0,"end":0,"showBits":true,"individual":false,"id":1}],"collapse":false,"reverse":true,"rotate":1}
C 2 core/comp/port p:-28,3,0 c:{"portId":"ctrl","name":"","w":6,"h":6,"type":1,"portPos":0,"rotate":0,"bitWidth":6,"signed":false,"flags":3,"valueMode":2,"inputOverride":false,"inputValueOverride":14}
C 3 core/gate/xor p:14,5,0 c:{"rotate":0,"bitWidth":32}
C 4 core/comp/port p:-1,-19,1 c:{"portId":"lhs","name":"","w":6,"h":6,"type":1,"portPos":0,"rotate":1,"bitWidth":32,"signed":false,"flags":0,"valueMode":1,"inputOverride":false,"inputValueOverride":4}
C 5 core/comp/port p:74,-18,1 c:{"portId":"rhs","name":"","w":6,"h":6,"type":1,"portPos":0,"rotate":1,"bitWidth":32,"signed":false,"flags":0,"valueMode":1,"inputOverride":false,"inputValueOverride":5}
C 6 core/bits/expand p:11,5,0 c:{"rotate":0,"bitWidth":32}
C 7 core/comp/port p:30,74,3 c:{"portId":"result","name":"","w":6,"h":6,"type":2,"portPos":0,"rotate":3,"bitWidth":32,"signed":false,"flags":0,"valueMode":1,"inputOverride":false,"inputValueOverride":0}
C 9 core/comp/port p:1,74,3 c:{"portId":"branch","name":"","w":6,"h":6,"type":2,"portPos":0,"rotate":3,"bitWidth":1,"signed":false,"flags":0,"valueMode":1,"inputOverride":false,"inputValueOverride":0}
C 10 core/flow/mux2 p:42,31,0 c:{"rotate":0,"bitWidth":32,"reverse":false}
C 11 core/flow/mux2 p:32,57,0 c:{"rotate":0,"bitWidth":32,"reverse":false}
C 12 core/gate/or p:21,53,0 c:{"rotate":0,"bitWidth":32,"extId":""}
C 13 core/gate/xor p:21,35,0 c:{"rotate":0,"bitWidth":32}
C 14 core/gate/and p:21,61,0 c:{"rotate":0,"bitWidth":32}
C 15 core/flow/mux2 p:32,40,0 c:{"rotate":0,"bitWidth":32,"reverse":false}
C 16 core/flow/mux2 p:37,48,0 c:{"rotate":0,"bitWidth":32,"reverse":false}
C 18 core/flow/mux2 p:37,18,0 c:{"rotate":0,"bitWidth":32,"reverse":false}
C 19 core/flow/mux2 p:32,10,0 c:{"rotate":0,"bitWidth":32,"reverse":false}
C 21 core/bits/expand-multi p:16,45,0 c:{"bitWidth":32,"bitRange":[{"start":0,"end":4,"individual":false,"showBits":false,"id":0}],"collapse":false,"reverse":false,"rotate":0}
C 24 core/gate/not p:26,24,2 c:{"rotate":2,"bitWidth":1}
C 25 core/math/shiftLeft p:20,13,0 c:{}
C 26 core/math/shiftRight p:20,43,0 c:{}
C 27 core/bits/expand-multi p:16,15,0 c:{"bitWidth":32,"bitRange":[{"start":0,"end":4,"individual":false,"showBits":false,"id":0}],"collapse":false,"reverse":false,"rotate":0}
C 30 core/math/comparitor p:64,8,0 c:{}
C 31 core/bits/expand-multi p:65,-5,1 c:{"bitWidth":6,"bitRange":[{"start":2,"end":4,"individual":true,"showBits":true,"id":0}],"collapse":false,"reverse":false,"rotate":1}
C 32 core/gate/xor p:76,13,1 c:{"rotate":1,"bitWidth":1}
C 33 core/gate/and p:49,7,1 c:{"rotate":1,"bitWidth":1}
C 34 core/gate/not p:49,2,1 c:{"rotate":1,"bitWidth":1}
C 36 core/flow/mux2 p:70,9,0 c:{"rotate":0,"bitWidth":32,"reverse":false}
C 37 core/gate/not p:66,3,1 c:{"rotate":1,"bitWidth":1}
C 38 core/gate/and p:55,7,1 c:{"rotate":1,"bitWidth":1}
C 39 core/math/comparitor p:20,25,0 c:{}
C 40 core/bits/expand-multi p:32,30,2 c:{"bitWidth":32,"bitRange":[{"start":1,"end":1,"individual":false,"showBits":true,"id":0},{"start":0,"end":0,"showBits":true,"individual":false,"id":1}],"collapse":true,"reverse":true,"rotate":0}
C 42 core/gate/and-bcast p:47,36,1 c:{"rotate":0,"bitWidth":32}
C 43 core/gate/and-bcast p:53,36,1 c:{"rotate":0,"bitWidth":32}
W 0 ns:[20,7 p:0/b|18,7,0 p:3/o]
W 1 ns:[13,6 p:6/b|14,6,0 p:3/a]
W 2 ns:[25,55 p:12/o|30,55,0|30,58,1|32,58,2 p:11/a]
W 3 ns:[32,60 p:11/b|30,60,0|30,63,1|25,63,2 p:14/o]
W 4 ns:[34,59 p:11/out|36,59,0|36,51,1|37,51,2 p:16/b]
W 5 ns:[34,42 p:15/out|36,42,0|36,49,1|37,49,2 p:16/a]
W 6 ns:[39,20 p:18/out|41,20,0|41,32,1|42,32,2 p:10/a]
W 7 ns:[24,7 p:0/out|30,7,0|30,11,1|32,11,2 p:19/a]
W 8 ns:[34,12 p:19/out|36,12,0|36,19,1|37,19,2 p:18/a]
W 9 ns:[38,18 p:18/sel|40,18,0|40,48,1|40,4,1|38,48,2 p:16/sel|29,4,3|29,-2,5 p:1/o_0_1]
W 10 ns:[25,37 p:13/o|30,37,0|30,41,1|32,41,2 p:15/a]
W 11 ns:[43,31 p:10/sel|45,31,0|45,3,1|28,3,2|28,-2,3 p:1/o_0_0]
W 12 ns:[19,47 p:21/o_0_0|20,47,0 p:26/b]
W 13 ns:[36,21|37,21,0 p:18/b|36,29,0|32,29,2 p:40/o]
W 15 ns:[35,23|35,10,0|35,40,0|26,23,0 p:24/i|35,5,1|33,10,1 p:19/sel|33,40,2 p:15/sel|35,57,2|30,5,4|33,57,7 p:11/sel|30,-2,8 p:1/o_0_2]
W 16 ns:[23,23 p:24/o|21,23,0|21,25,1 p:39/signed]
W 17 ns:[16,17 p:27/i|6,17,0|6,5,1|6,29,1|20,5,2 p:0/a|6,-9,2|20,29,3 p:39/b|6,38,3|60,-9,5|6,47,7|21,38,7 p:13/b|60,12,8|71,-9,8|16,47,9 p:21/i|6,56,9|64,12,11 p:30/b|71,-12,12 p:5/a|21,56,14 p:12/b|6,64,14|21,64,18 p:14/b]
W 18 ns:[24,17 p:25/out|30,17,0|30,13,1|32,13,2 p:19/b]
W 19 ns:[20,17 p:25/b|19,17,0 p:27/o_0_0]
W 20 ns:[24,47 p:26/out|30,47,0|30,43,1|32,43,2 p:15/b]
W 21 ns:[39,50 p:16/out|41,50,0|41,34,1|42,34,2 p:10/b]
W 23 ns:[62,-2 p:31/o_0_2|62,0,0|75,0,1|75,13,2 p:32/a]
W 24 ns:[48,2 p:34/i|48,0,0|31,0,1|54,0,1|31,-2,2 p:1/o_4_0|54,7,3 p:38/a]
W 25 ns:[48,5 p:34/o|48,7,0 p:33/a]
W 26 ns:[47,11 p:33/o|47,38,0 p:42/b]
W 27 ns:[74,17 p:32/o|74,18,0|51,18,1|51,36,2 p:43/a]
W 28 ns:[68,10 p:30/outEq|70,10,0 p:36/a]
W 29 ns:[68,12 p:30/outLt|70,12,0 p:36/b]
W 30 ns:[65,6 p:37/o|65,8,0 p:30/signed]
W 31 ns:[65,3 p:37/i|65,2,0|63,2,1|63,-2,2 p:31/o_0_1]
W 32 ns:[64,-2 p:31/o_0_0|64,1,0|71,1,1|71,9,2 p:36/sel]
W 33 ns:[72,11 p:36/out|73,11,0|73,13,1 p:32/b]
W 34 ns:[-7,-7|-7,6,0|30,-7,0|-22,6,1 p:2/a|30,-5,2 p:1/i|63,-7,2|63,-5,5 p:31/i]
W 36 ns:[53,11 p:38/o|53,38,0 p:43/b]
W 37 ns:[45,36 p:42/a|45,33,0|44,33,1 p:10/out]
W 38 ns:[4,68 p:9/a|4,66,0|51,66,1|51,40,2 p:43/o]
W 39 ns:[-4,-13 p:4/a|-4,-11,0|4,-11,1|4,8,2|58,-11,2|4,15,3|14,8,3 p:3/b|58,10,4|20,15,5 p:25/a|4,27,5|64,10,7 p:30/a|20,27,9 p:39/a|4,36,9|4,45,12|21,36,12 p:13/a|4,54,13|20,45,13 p:26/a|21,54,15 p:12/a|4,62,15|21,62,18 p:14/a]
W 41 ns:[24,29 p:39/outLt|29,29,0 p:40/i_1_0]
W 42 ns:[]
W 43 ns:[24,27 p:39/outEq|25,27,0]
W 44 ns:[32,-1|32,-2,0 p:1/o_1_0|46,-1,0|46,7,2 p:33/b|52,-1,2|52,7,4 p:38/b]
W 45 ns:[27,-1|27,-2,0 p:1/o_3_0|10,-1,0|10,6,2|10,10,3|11,6,3 p:6/a|19,10,4|10,42,4|19,8,6|21,42,7|20,8,8 p:0/carryIn|21,43,9 p:26/arith]
W 47 ns:[45,64|33,64,0|45,40,0 p:42/o|33,68,1 p:7/a]
`;
