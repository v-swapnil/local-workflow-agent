/**
 * Unified-diff applier built on the `diff` (jsdiff) library.
 *
 * Wrapper exists so callers stay decoupled from the upstream API and we can
 * normalise edge cases (missing files, /dev/null, posix paths).
 */
import { parsePatch, applyPatch } from 'diff';

export interface PatchedFile {
  path: string;
  content: string;
  isNew: boolean;
  isDelete: boolean;
}

function stripPrefix(p: string | undefined): string {
  if (!p) return '';
  if (p === '/dev/null') return p;
  if (p.startsWith('a/') || p.startsWith('b/')) return p.slice(2);
  return p;
}

export function planPatch(
  patch: string,
  readOriginal: (path: string) => string | null,
): PatchedFile[] {
  const files = parsePatch(patch);
  const out: PatchedFile[] = [];
  for (const f of files) {
    const oldPath = stripPrefix(f.oldFileName);
    const newPath = stripPrefix(f.newFileName);
    const isNew = oldPath === '/dev/null';
    const isDelete = newPath === '/dev/null';
    const targetPath = isDelete ? oldPath : newPath;

    if (isDelete) {
      out.push({ path: targetPath, content: '', isNew: false, isDelete: true });
      continue;
    }

    const original = isNew ? '' : (readOriginal(oldPath) ?? '');
    const result = applyPatch(original, f, { fuzzFactor: 2 });
    if (result === false) {
      throw new Error(`failed to apply patch to ${targetPath}`);
    }
    out.push({ path: targetPath, content: result, isNew, isDelete: false });
  }
  return out;
}
