/**
 * Resolve an agent zone's `src/` directory (Docker build context) from a CDK construct file path.
 *
 * Constructs live under `cdk/lib/constructs/`; three levels up is the zone root, then `src/`.
 * If that path has no Dockerfile (e.g. unexpected __dirname), falls back to `../src` from cwd
 * when the current working directory is the zone's `cdk/` folder (typical for `cdk deploy`).
 */

import * as fs from "fs";
import * as path from "path";

export function resolveZoneSrcDir(constructDir: string): string {
  const fromConstruct = path.resolve(constructDir, "..", "..", "..", "src");
  if (fs.existsSync(path.join(fromConstruct, "Dockerfile"))) {
    return fromConstruct;
  }

  const cwd = process.cwd();
  if (path.basename(cwd) === "cdk") {
    const fromCwd = path.resolve(cwd, "..", "src");
    if (fs.existsSync(path.join(fromCwd, "Dockerfile"))) {
      return fromCwd;
    }
  }

  const tried = [path.join(fromConstruct, "Dockerfile")];
  if (path.basename(cwd) === "cdk") {
    tried.push(path.join(path.resolve(cwd, "..", "src"), "Dockerfile"));
  }

  throw new Error(
    `Agent Dockerfile not found. CDK needs <zone>/src/Dockerfile. Tried:\n  ${tried.join("\n  ")}\n` +
      "Use a full git clone (not sparse), confirm the file exists on disk, and run deploy from the repo or with cwd on the zone's cdk/ directory.",
  );
}
