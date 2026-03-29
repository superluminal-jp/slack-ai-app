/**
 * Resolve an agent zone's `src/` directory (Docker build context) from a CDK construct file path.
 *
 * Constructs live under `cdk/lib/constructs/`; three levels up is the zone root, then `src/`.
 * If that path has no Dockerfile (e.g. unexpected __dirname), falls back to `../src` from cwd
 * when the current working directory is the zone's `cdk/` folder (typical for `cdk deploy`).
 */
export declare function resolveZoneSrcDir(constructDir: string): string;
//# sourceMappingURL=resolve-zone-src-dir.d.ts.map