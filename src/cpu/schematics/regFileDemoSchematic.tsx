
import { ILSSchematic } from "@/src/cpu/schematics/SchematicLibrary";
export const regFileDemoSchematic: ILSSchematic = {"id":"reg-file-demo","name":"Reg File Demo","model":{"wires":[{"nodes":[{"id":0,"x":587,"y":351,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"ctrl"}},{"id":1,"x":587,"y":350,"edges":[0,2]},{"id":2,"x":601,"y":350,"edges":[1,3]},{"id":3,"x":601,"y":347,"edges":[2],"ref":{"type":3,"id":"0","compNodeId":"ctrl"}}]},{"nodes":[{"id":0,"x":623,"y":354,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"outA"}},{"id":1,"x":624,"y":354,"edges":[0,2]},{"id":2,"x":624,"y":350,"edges":[1,3]},{"id":3,"x":608,"y":350,"edges":[2,4]},{"id":4,"x":608,"y":345,"edges":[3,5]},{"id":5,"x":609,"y":345,"edges":[4],"ref":{"type":3,"id":"3","compNodeId":"x"}}]},{"nodes":[{"id":0,"x":623,"y":357,"edges":[1],"ref":{"type":3,"id":"1","compNodeId":"outB"}},{"id":1,"x":625,"y":357,"edges":[0,2]},{"id":2,"x":625,"y":349,"edges":[1,3]},{"id":3,"x":616,"y":349,"edges":[2,4]},{"id":4,"x":616,"y":345,"edges":[3,5]},{"id":5,"x":617,"y":345,"edges":[4],"ref":{"type":3,"id":"4","compNodeId":"x"}}]},{"nodes":[{"id":0,"x":594,"y":345,"edges":[1,2]},{"id":1,"x":594,"y":349,"edges":[0,3]},{"id":2,"x":593,"y":345,"edges":[0],"ref":{"type":3,"id":"2","compNodeId":"out"}},{"id":3,"x":582,"y":349,"edges":[1,4]},{"id":4,"x":582,"y":354,"edges":[3,5]},{"id":5,"x":583,"y":354,"edges":[4],"ref":{"type":3,"id":"1","compNodeId":"in"}}]}],"comps":[{"id":"0","defId":"core/riscv/regFile0Input","x":596,"y":335,"args":{"inEnable":true,"inReg":3,"outAEnable":true,"outAReg":3,"outBEnable":true,"outBReg":4}},{"id":"1","defId":"core/riscv/reg32","x":583,"y":351,"args":null},{"id":"2","defId":"core/io/const32","x":583,"y":343,"args":{"value":7,"valueMode":0,"bitWidth":32,"h":4,"w":10,"portPos":0,"signed":false}},{"id":"3","defId":"core/io/output0","x":609,"y":343,"args":null},{"id":"4","defId":"core/io/output0","x":617,"y":343,"args":null}]}};

export const regFileDemoSchematicStr = `#wire-schema 1
C 0 core/riscv/regFile0Input p:596,335 c:{"inEnable":true,"inReg":3,"outAEnable":true,"outAReg":3,"outBEnable":true,"outBReg":4}
C 1 core/riscv/reg32 p:583,351
C 2 core/io/const32 p:583,343 c:{"value":7,"valueMode":0,"bitWidth":32,"h":4,"w":10,"portPos":0,"signed":false}
C 3 core/io/output0 p:609,343
C 4 core/io/output0 p:617,343
W 0 ns:[587,351 p:1/ctrl|587,350,0|601,350,1|601,347,2 p:0/ctrl]
W 1 ns:[623,354 p:1/outA|624,354,0|624,350,1|608,350,2|608,345,3|609,345,4 p:3/x]
W 2 ns:[623,357 p:1/outB|625,357,0|625,349,1|616,349,2|616,345,3|617,345,4 p:4/x]
W 3 ns:[594,345|594,349,0|593,345,0 p:2/out|582,349,1|582,354,3|583,354,4 p:1/in]
`;
