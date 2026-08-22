import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Walk up from the compiled module to the npm package root (the directory
 * that contains package.json). Returns null when the package root cannot be
 * located, which can happen in unusual bundling environments.
 */
export function findPackageRoot(fromUrl = import.meta.url): string | null {
  let dir = dirname(fileURLToPath(fromUrl));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
