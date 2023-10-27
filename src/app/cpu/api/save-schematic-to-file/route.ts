
import { isNil } from '@/src/utils/data';
import os from 'os';
import fs from 'fs';
import path from 'path';

function isSafePath(basePath: string, unsafePath: string) {
    const resolvedPath = path.resolve(basePath, unsafePath);
    return resolvedPath.startsWith(path.resolve(basePath));
  }

export async function POST(request: Request) {
    if (process.env.FILE_UPLOAD_API !== 'true') {
        return NotFound();
    }

    let { searchParams } = new URL(request.url);

    let filename = searchParams.get('filename');
    if (!filename) {
        return BadRequest('filename and content are required');
    }

    let basePath = 'src/cpu/schematics/';

    let targetPath = path.resolve(basePath, filename + 'Schematic.tsx');

    if (!isSafePath(basePath, targetPath)) {
        return BadRequest(`Invalid path '${filename}'`);
    }

    let body = await request.text();

    let manifestFileName = path.join(basePath, 'schematicManifest.json');
    let manifestFile = fs.readFileSync(manifestFileName);
    let manifest = JSON.parse(manifestFile.toString()) as IManifest;
    let existing = manifest.schematics.find(a => a.id === filename);
    if (!existing) {
        manifest.schematics.push({ id: filename });
    }
    fs.writeFileSync(manifestFileName, JSON.stringify(manifest, null, 2) + os.EOL);

    let manifestTsFileName = path.join(basePath, 'SchematicManifest.ts');

    updateManifestFile(manifest, manifestTsFileName);

    fs.writeFileSync(targetPath, body);

    return Response.json({ success: true, target: targetPath });
}

function NotFound(message?: string) {
    return Response.json({ code: 404, status: 'Not Found', message }, { status: 404 });
}

function BadRequest(message: string) {
    return Response.json({ code: 400, status: 'Bad Request', message }, { status: 400 });
}

interface IManifest {
    schematics: { id: string }[];
}

function updateManifestFile(manifest: IManifest, manifestTsFileName: string) {

    let str = 'import { ILSSchematic } from "./SchematicLibrary";' + os.EOL;
    for (let item of manifest.schematics) {
        str += `import { ${item.id}Schematic } from "./${item.id}Schematic";` + os.EOL;
    }

    str += os.EOL + 'export const schematicManifest: ILSSchematic[] = [' + os.EOL;
    for (let item of manifest.schematics) {
        str += `    ${item.id}Schematic,` + os.EOL;
    }
    str += '];' + os.EOL + os.EOL;

    fs.writeFileSync(manifestTsFileName, str);
}
