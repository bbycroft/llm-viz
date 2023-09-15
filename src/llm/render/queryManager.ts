import { IGLContext } from "@/src/utils/shader";

export interface IQueryManager {
    ctx: IGLContext;
    queries: Map<string, IQuery>;
    TIME_ELAPSED_EXT: number;
}

export interface IQuery {
    query: WebGLQuery;
    hasRun: boolean;
    hasStarted: boolean;
}

export function createQueryManager(ctx: IGLContext): IQueryManager {

    return {
        ctx,
        queries: new Map(),
        TIME_ELAPSED_EXT: ctx.ext.disjointTimerQuery?.TIME_ELAPSED_EXT!,
    };
}

export function beginQueryAndGetPrevMs(manager: IQueryManager, name: string): number | null {
    if (!manager.ctx.ext.disjointTimerQuery) {
        return null;
    }

    let existing = manager.queries.get(name);
    if (!existing) {
        let query = manager.ctx.gl.createQuery()!;
        manager.queries.set(name, existing = { query, hasRun: false, hasStarted: false });
    }

    let resultAvailable = false
    if (existing.hasRun) {
        resultAvailable = manager.ctx.gl.getQueryParameter(existing.query, manager.ctx.gl.QUERY_RESULT_AVAILABLE);
    }

    let resultMs: number | null = null;

    if (resultAvailable) {
        let timeElapsed = manager.ctx.gl.getQueryParameter(existing.query, manager.ctx.gl.QUERY_RESULT);
        resultMs = timeElapsed / 1000000;
    }

    if (!existing.hasRun || resultAvailable) {
        manager.ctx.gl.beginQuery(manager.TIME_ELAPSED_EXT, existing.query);
        existing.hasRun = true;
        existing.hasStarted = true;
    }

    return resultMs;
}

export function endQuery(manager: IQueryManager, name: string) {
    if (!manager.ctx.ext.disjointTimerQuery) {
        return;
    }
    let existing = manager.queries.get(name);
    if (existing && existing.hasRun && existing.hasStarted) {
        manager.ctx.gl.endQuery(manager.TIME_ELAPSED_EXT);
        existing.hasStarted = false;
    }
}
