import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import { IComp, IExeComp, ILibraryItem, ISchematic } from "../CpuModel";
import { ICompDef } from "./CompBuilder";
import { ISchematicCompArgs } from "../schematics/SchematicLibrary";
import * as d3Color from 'd3-color';
import { clamp } from "@/src/utils/data";
import React, { memo } from "react";
import { CompRectBase, CompRectUnscaled } from "./RenderHelpers";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCodeBranch, faPencil, faFloppyDisk, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

export interface ISchematicCompData {
    // nothing
}

export function createSchematicCompDef(id: string, name: string, schematic: ISchematic, compArgs: ISchematicCompArgs): ILibraryItem {

    let compDef: ICompDef<ISchematicCompData, {}> = {
        defId: id,
        name: name,
        ports: (args) => {
            return compArgs.ports;
        },
        size: compArgs.size,
        applyConfig: (comp, args) => {
            comp.size = compArgs.size;
        },
        build: (builder) => {
            builder.addData({});
            return builder.build();
        },

        renderAll: true,
        render: ({ comp, exeComp, ctx, cvs }) => {

            let fillStyle = ctx.fillStyle;

            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);
            ctx.fill();
            ctx.stroke();

            ctx.save();

            let bb = new BoundingBox3d(comp.pos, comp.pos.add(comp.size));
            createInsetGradient(ctx, bb, cvs.scale * 20, '#06b6d4');

            ctx.lineWidth = cvs.scale * 1;
            ctx.beginPath();
            ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);
            ctx.strokeStyle = 'black';
            ctx.stroke();

            ctx.restore();
        },
        renderDom: ({ comp, exeComp, isActive }) => {
            return <SchematicComp comp={comp} exeComp={exeComp} isActive={isActive} compDef={compDef} />;
        },

        subLayout: {
            layout: schematic,
            ports: compArgs.ports,
            bb: new BoundingBox3d(),
        },
    };

    let libItem: ILibraryItem = {
        compDef,
        id,
        name,
        schematic,
    };

    return libItem;
}

export enum RectSide {
    Top,
    Right,
    Bottom,
    Left,
}

export enum RectCorner {
    TopLeft = 1,
    TopRight = 2,
    BottomRight = 4,
    BottomLeft = 8,

    IsLeft = TopLeft | BottomLeft,
    IsTop = TopLeft | TopRight,
}

function createInsetGradient(ctx: CanvasRenderingContext2D, bb: BoundingBox3d, inset: number, colorOuter: string) {
    let w = bb.max.x - bb.min.x;
    let h = bb.max.y - bb.min.y;

    for (let i = 0; i < 4; i++) {
        let isTB = i % 2 === 0;
        let isBR = i === 1 || i === 2;
        let base = isBR ? bb.max : bb.min;
        let insetX = isTB ? 0 : (isBR ? -inset : inset);
        let insetY = isTB ? (isBR ? -inset : inset) : 0;
        let oppDir = (isTB ? new Vec3(w, 0) : new Vec3(0, h)).mul(isBR ? -1 : 1);

        let grad = ctx.createLinearGradient(base.x, base.y, base.x + insetX, base.y + insetY);
        function hexWithOpacity(hex: string, stop: number) {
            let opacity = Math.pow(1.0 - stop, 2.0);

            let color = d3Color.color(hex)!;
            return color.formatHex() + clamp((opacity * 255) >> 0, 0, 255).toString(16).padStart(2, '0');
        }
        grad.addColorStop(0, hexWithOpacity(colorOuter, 0));
        grad.addColorStop(0.25, hexWithOpacity(colorOuter, 0.25));
        grad.addColorStop(0.5, hexWithOpacity(colorOuter, 0.5));
        grad.addColorStop(0.75, hexWithOpacity(colorOuter, 0.75));
        grad.addColorStop(1, hexWithOpacity(colorOuter, 1));

        ctx.fillStyle = grad;
        // now have to create a trapazoid path
        let mulFactor = 0.95; // 0.95; // 1.0; // 0.95;

        ctx.beginPath();
        if (isTB) {
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(base.x + oppDir.x, base.y + oppDir.y);
            ctx.lineTo(base.x + oppDir.x - insetY * mulFactor, base.y + insetY);
            ctx.lineTo(base.x + insetY * mulFactor, base.y + insetY);
        } else {
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(base.x + oppDir.x, base.y + oppDir.y);
            ctx.lineTo(base.x + oppDir.x + insetX, base.y + oppDir.y - insetX * mulFactor);
            ctx.lineTo(base.x + insetX, base.y + insetX * mulFactor);
        }
        ctx.closePath();
        ctx.fill();
    }
}

const SchematicComp: React.FC<{
    comp: IComp<ISchematicCompData>,
    exeComp: IExeComp<{}>,
    compDef: ICompDef<ISchematicCompData, {}>,
    isActive: boolean,
}> = memo(function SchematicComp({ comp, exeComp, isActive, compDef }) {

    let unsavedChanges = true;

    return <>
        <CompRectBase comp={comp}>
        </CompRectBase>
        <CompRectUnscaled hideHover comp={comp}>
            <div className="absolute top-0 right-0 m-2 bg-white rounded shadow pointer-events-auto flex h-10 overflow-hidden shadow-[rgba(0,0,0,0.2)] opacity-10 hover:opacity-100 transition-opacity">
                <div className="relative flex items-center px-2">
                    {compDef.name}
                </div>
                <button className="relative px-2 hover:bg-blue-300 min-w-[2.5rem] text-slate-700">
                    <FontAwesomeIcon icon={faFloppyDisk} />
                    {unsavedChanges && <div className="absolute -top-1 -right-0 text-red-500 text-2xl">*</div>}
                </button>
                <button className="px-2 hover:bg-blue-300 min-w-[2.5rem] text-slate-700" title="Branch this instance">
                    <FontAwesomeIcon icon={faCodeBranch} />
                </button>
                <button className="px-2 hover:bg-blue-300 min-w-[2.5rem] text-slate-700">
                    <FontAwesomeIcon icon={faMagnifyingGlass} />
                </button>
            </div>
        </CompRectUnscaled>
    </>;
});
