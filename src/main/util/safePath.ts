import { resolve, relative, isAbsolute } from 'node:path';

/**
 * Resolves `target` against `root` and ensures the result stays inside `root`.
 */
export function safeJoin(root: string, target: string): string {
  const cleaned = target.normalize('NFC').replace(/^\/+/, '');
  if (isAbsolute(cleaned)) return cleaned;
  const joined = resolve(root, cleaned);
  return joined;
}
