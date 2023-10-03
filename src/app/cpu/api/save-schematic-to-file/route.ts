
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

    let targetPath = path.resolve(basePath, filename);

    if (!isSafePath(basePath, targetPath)) {
        return BadRequest(`Invalid path '${filename}'`);
    }

    let body = await request.text();

    await fs.writeFileSync(targetPath, body)

    return Response.json({ success: true, target: targetPath });
}

function NotFound(message?: string) {
    return Response.json({ code: 404, status: 'Not Found', message }, { status: 404 });
}

function BadRequest(message: string) {
    return Response.json({ code: 400, status: 'Bad Request', message }, { status: 400 });
}
