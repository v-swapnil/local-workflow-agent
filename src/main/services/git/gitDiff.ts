import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getWorkspace } from '../workspaces';
import { gitFor, isRepo } from './gitCore.js';
import type { GitDiff } from './gitCore.js';

export interface GitFileStat {
  path: string;
  section: 'staged' | 'working';
  additions: number;
  deletions: number;
  /** Binary files report no line counts (git numstat emits "-"). */
  binary: boolean;
}

export async function workspaceDiff(workspaceId: string, staged = false): Promise<GitDiff> {
  return workspaceDiffAtPath((await getWorkspace(workspaceId)).path, staged);
}

export async function workspaceDiffAtPath(path: string, staged = false): Promise<GitDiff> {
  if (!(await isRepo(path))) return { isRepo: false, unifiedDiff: '', staged };
  const git = gitFor(path);
  const diffArgs = staged ? ['--cached'] : [];
  const tracked = await git.diff(diffArgs);
  let untracked = '';
  if (!staged) {
    const status = await git.status();
    for (const untrackedFile of status.not_added) {
      try {
        const rawDiff = await git.raw(['diff', '--no-index', '--', '/dev/null', untrackedFile]);
        untracked += rawDiff;
      } catch (err) {
        // git diff --no-index returns exit 1 when files differ; simple-git treats as throw.
        const gitErr = err as { git?: string; message?: string };
        if (gitErr?.git) untracked += gitErr.git;
      }
    }
  }
  return { isRepo: true, unifiedDiff: tracked + untracked, staged };
}

export async function showFileAtHead(
  workspaceId: string,
  filePath: string,
): Promise<string | null> {
  return showFileAtHeadAtPath((await getWorkspace(workspaceId)).path, filePath);
}

export async function showFileAtHeadAtPath(
  basePath: string,
  filePath: string,
): Promise<string | null> {
  if (!(await isRepo(basePath))) return null;
  try {
    return await gitFor(basePath).show([`HEAD:${filePath}`]);
  } catch {
    // New/untracked files and paths absent in HEAD should return null.
    return null;
  }
}

export async function fileDiff(
  workspaceId: string,
  filePath: string,
  staged = false,
): Promise<string> {
  return fileDiffAtPath((await getWorkspace(workspaceId)).path, filePath, staged);
}

export async function fileDiffAtPath(
  basePath: string,
  filePath: string,
  staged = false,
): Promise<string> {
  if (!(await isRepo(basePath))) return '';
  const git = gitFor(basePath);
  if (staged) return git.diff(['--cached', '--', filePath]);

  const status = await git.status();
  const fileEntry = status.files.find((entry) => entry.path === filePath);
  const isUntracked = fileEntry?.working_dir === '?' || status.not_added.includes(filePath);
  if (isUntracked) {
    try {
      return await git.raw(['diff', '--no-index', '--', '/dev/null', filePath]);
    } catch (err) {
      // Exit code 1 for differences is expected for --no-index.
      const gitErr = err as { git?: string; message?: string };
      return gitErr.git ?? gitErr.message ?? '';
    }
  }
  return git.diff(['--', filePath]);
}

/**
 * Parse `git diff --numstat` output into per-file line stats.
 * Format per line: `additions\tdeletions\tpath`. Binary files report "-".
 * Renames appear as `old => new` (possibly with `{...}` segments) — we keep
 * the resulting (new) path so it joins with the status file list.
 */
function parseNumstat(raw: string, section: 'staged' | 'working'): GitFileStat[] {
  const out: GitFileStat[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const addStr = parts[0]!;
    const delStr = parts[1]!;
    let path = parts.slice(2).join('\t');
    if (path.includes(' => ')) {
      path = path.replace(/\{.*? => (.*?)\}/g, '$1').replace(/^.*? => (.*)$/, '$1');
    }
    const binary = addStr === '-' || delStr === '-';
    out.push({
      path,
      section,
      additions: binary ? 0 : Number(addStr) || 0,
      deletions: binary ? 0 : Number(delStr) || 0,
      binary,
    });
  }
  return out;
}

/**
 * Per-file addition/deletion line counts for the whole working tree:
 * staged changes, unstaged tracked changes, and untracked files
 * (counted as additions since they don't yet exist in the index).
 */
export async function workspaceChangeStatsAtPath(basePath: string): Promise<GitFileStat[]> {
  if (!(await isRepo(basePath))) return [];
  const git = gitFor(basePath);
  const stats: GitFileStat[] = [];

  const [stagedRaw, workingRaw, untrackedRaw] = await Promise.all([
    git.raw(['diff', '--cached', '--numstat']),
    git.raw(['diff', '--numstat']),
    git.raw(['ls-files', '--others', '--exclude-standard']),
  ]);

  stats.push(...parseNumstat(stagedRaw, 'staged'));
  stats.push(...parseNumstat(workingRaw, 'working'));

  const untrackedFiles = untrackedRaw
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const file of untrackedFiles) {
    let additions = 0;
    let binary = false;
    try {
      const content = await readFile(join(basePath, file), 'utf8');
      if (content.includes('\u0000')) {
        binary = true;
      } else if (content.length > 0) {
        additions = content.split('\n').length;
        if (content.endsWith('\n')) additions -= 1;
      }
    } catch {
      // Unreadable file (e.g. deleted mid-read) — leave at zero.
    }
    stats.push({ path: file, section: 'working', additions, deletions: 0, binary });
  }

  return stats;
}

