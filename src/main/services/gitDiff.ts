import { getWorkspace } from './workspaces';
import { gitFor, isRepo } from './gitCore.js';
import type { GitDiff } from './gitCore.js';

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
