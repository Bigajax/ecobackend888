import fs from "fs";
import path from "path";

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function toAbsolute(candidate: string): string {
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

let warnedInvalidEnv = false;

export function getAssetsRoot(): string {
  const envRoot = process.env.ECO_ASSETS_ROOT;
  if (envRoot) {
    const resolvedEnv = toAbsolute(envRoot);
    if (isDirectory(resolvedEnv)) {
      return resolvedEnv;
    }
    if (!warnedInvalidEnv) {
      warnedInvalidEnv = true;
      console.warn("[assetsRoot] invalid_env_root", {
        envRoot,
        resolvedEnv,
      });
    }
  }

  const productionRoot = path.resolve(__dirname, "..", "..", "assets");
  const workspaceRoot = path.resolve(process.cwd(), "server", "assets");

  const candidates = process.env.NODE_ENV === "production"
    ? [productionRoot, workspaceRoot]
    : [workspaceRoot, productionRoot];

  for (const candidate of candidates) {
    if (isDirectory(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

export function describeAssetsRoot(): { root: string; exists: boolean } {
  const root = getAssetsRoot();
  return { root, exists: isDirectory(root) };
}
