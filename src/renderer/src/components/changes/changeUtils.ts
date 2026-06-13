export type ChangeKind =
  | 'modified'
  | 'created'
  | 'deleted'
  | 'renamed'
  | 'conflicted'
  | 'untracked';

export interface ChangedFile {
  path: string;
  originalPath?: string;
  kind: ChangeKind;
  section: 'staged' | 'working';
}

export interface ActiveChange {
  path: string;
  kind: ChangeKind;
  originalPath?: string;
  staged?: boolean;
}

export function mapStatusCode(code: string): ChangeKind | null {
  if (code === 'M') return 'modified';
  if (code === 'A') return 'created';
  if (code === 'D') return 'deleted';
  if (code === 'R') return 'renamed';
  if (code === 'C' || code === 'U') return 'conflicted';
  if (code === '?') return 'untracked';
  return null;
}

export function splitPath(path: string): { parent: string; name: string } {
  const parts = path.split('/');
  const name = parts.pop() ?? path;
  const parent = parts.join('/');
  return { parent, name };
}

export function changeMeta(kind: ChangeKind): { code: string; label: string; className: string } {
  if (kind === 'modified') return { code: 'M', label: 'Modified', className: 'text-amber' };
  if (kind === 'created') return { code: 'A', label: 'Added', className: 'text-signal-ok' };
  if (kind === 'deleted') return { code: 'D', label: 'Deleted', className: 'text-signal-err' };
  if (kind === 'renamed') return { code: 'R', label: 'Renamed', className: 'text-purple-400' };
  if (kind === 'conflicted')
    return { code: 'C', label: 'Conflicted', className: 'text-signal-warn' };
  return { code: '?', label: 'Untracked', className: 'text-ink-400' };
}

export function summarizeWorking(files: ChangedFile[]): string {
  const tally = { M: 0, A: 0, D: 0, R: 0, C: 0, '?': 0 };
  for (const file of files) {
    const { code } = changeMeta(file.kind);
    if (code in tally) tally[code as keyof typeof tally] += 1;
  }
  const chunks: string[] = [];
  if (tally.M) chunks.push(`${tally.M}M`);
  if (tally.A) chunks.push(`${tally.A}A`);
  if (tally.D) chunks.push(`${tally.D}D`);
  if (tally.R) chunks.push(`${tally.R}R`);
  if (tally.C) chunks.push(`${tally.C}C`);
  if (tally['?']) chunks.push(`${tally['?']}?`);
  return chunks.join(' · ');
}

export function mapPathKind(
  path: string,
  status: {
    created?: string[];
    modified?: string[];
    deleted?: string[];
    conflicted?: string[];
    renamed?: { from: string; to: string }[];
  },
): { kind: ChangeKind; originalPath?: string } {
  const renamed = status.renamed?.find((r) => r.to === path);
  if (renamed) return { kind: 'renamed', originalPath: renamed.from };
  if (status.conflicted?.includes(path)) return { kind: 'conflicted' };
  if (status.created?.includes(path)) return { kind: 'created' };
  if (status.deleted?.includes(path)) return { kind: 'deleted' };
  if (status.modified?.includes(path)) return { kind: 'modified' };
  return { kind: 'modified' };
}
