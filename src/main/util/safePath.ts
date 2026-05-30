import { resolve, relative, isAbsolute } from 'node:path';

/**
 * Resolves `target` against `root` and ensures the result stays inside `root`.
 * Throws if the path attempts to escape (`..`, absolute paths, symlink tricks).
 */
export function safeJoin(root: string, target: string): string {
  const cleaned = target.normalize('NFC').replace(/^\/+/, '');
  const joined = resolve(root, cleaned);
  const rel = relative(root, joined);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path escapes workspace: ${target}`);
  }
  return joined;
}

export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}
