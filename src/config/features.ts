/**
 * Public vs WIP route flags for static deploys.
 *
 * Default: WIP routes are available in `next dev`, and 404 in production
 * builds (Cloudflare / `yarn build`) so incomplete work can live on main
 * without being publicly reachable.
 *
 * To ship or preview a static export that includes WIP:
 *   NEXT_PUBLIC_SHOW_WIP=true yarn build
 */
export const showWip =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_SHOW_WIP === 'true';

export const features = {
    /** Live public project */
    llm: true,
    /** In-progress CPU schematic / guide */
    cpu: showWip,
    /** In-progress deflate / codec viz */
    codec: showWip,
    /** Fluid sim experiment */
    fluidSim: showWip,
} as const;

export type Feature = keyof typeof features;
