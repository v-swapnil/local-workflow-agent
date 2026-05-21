import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { simpleGit, StatusResultRenamed, type SimpleGit, type StatusResult } from 'simple-git';
import { getWorkspace } from './workspaces.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const log = logger.child({ mod: 'git' });

export interface GitFileStatus {
  path: string;
  index: string;
  working_dir: string;
  from?: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  not_added: string[];
  created: string[];
  modified: string[];
  renamed: StatusResultRenamed[];
  deleted: string[];
  conflicted: string[];
  files: GitFileStatus[];
  clean: boolean;
}

export interface GitDiff {
  isRepo: boolean;
  unifiedDiff: string;
  staged: boolean;
}

function gitFor(cwd: string): SimpleGit {
  return simpleGit({ baseDir: cwd, binary: 'git', maxConcurrentProcesses: 2, trimmed: true });
}

async function isRepo(cwd: string): Promise<boolean> {
  if (!existsSync(join(cwd, '.git'))) {
    // simpleGit().checkIsRepo() handles worktrees / parent-dir cases too.
    try {
      return await gitFor(cwd).checkIsRepo();
    } catch {
      return false;
    }
  }
  return true;
}

export async function ensureRepo(cwd: string): Promise<SimpleGit> {
  const g = gitFor(cwd);
  if (!(await g.checkIsRepo())) {
    await g.init();
    log.info({ cwd }, 'initialised new git repo');
  }
  return g;
}

/** Return the git worktree root (rev-parse --show-toplevel), or null if not a repo. */
export async function getWorktreeRoot(cwd: string): Promise<string | null> {
  try {
    if (!(await isRepo(cwd))) return null;
    return (await gitFor(cwd).revparse(['--show-toplevel'])).trim() || null;
  } catch {
    return null;
  }
}

export async function workspaceStatus(workspaceId: string): Promise<GitStatus> {
  return workspaceStatusAtPath((await getWorkspace(workspaceId)).path);
}

export async function workspaceStatusAtPath(path: string): Promise<GitStatus> {
  if (!(await isRepo(path))) {
    return {
      isRepo: false,
      branch: null,
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      not_added: [],
      created: [],
      renamed: [],
      deleted: [],
      conflicted: [],
      files: [],
      clean: true,
    };
  }
  const s: StatusResult = await gitFor(path).status();
  return {
    isRepo: true,
    branch: s.current,
    ahead: s.ahead,
    behind: s.behind,
    staged: s.staged,
    created: s.created,
    renamed: s.renamed,
    modified: s.modified,
    not_added: s.not_added,
    deleted: s.deleted,
    conflicted: s.conflicted,
    files: s.files.map((f) => ({
      path: f.path,
      index: f.index,
      working_dir: f.working_dir,
      from: f.from,
    })),
    clean: s.isClean(),
  };
}

export async function workspaceDiff(workspaceId: string, staged = false): Promise<GitDiff> {
  return workspaceDiffAtPath((await getWorkspace(workspaceId)).path, staged);
}

export async function workspaceDiffAtPath(path: string, staged = false): Promise<GitDiff> {
  if (!(await isRepo(path))) {
    return { isRepo: false, unifiedDiff: '', staged };
  }
  const g = gitFor(path);
  const args = staged ? ['--cached'] : [];
  // Include untracked files in working diff via no-index trick.
  const tracked = await g.diff(args);
  let untracked = '';
  if (!staged) {
    const status = await g.status();
    for (const file of status.not_added) {
      try {
        const out = await g.raw(['diff', '--no-index', '--', '/dev/null', file]);
        untracked += out;
      } catch (err) {
        // git diff --no-index returns exit 1 when files differ; simple-git treats as throw.
        const e = err as { git?: string; message?: string };
        if (e?.git) untracked += e.git;
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

export async function showFileAtHeadAtPath(basePath: string, filePath: string): Promise<string | null> {
  if (!(await isRepo(basePath))) return null;
  const g = gitFor(basePath);
  try {
    return await g.show([`HEAD:${filePath}`]);
    // return await g.raw(['show', '--no-patch', '--pretty=', `HEAD:${filePath}`]);
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

export async function fileDiffAtPath(basePath: string, filePath: string, staged = false): Promise<string> {
  if (!(await isRepo(basePath))) return '';
  const g = gitFor(basePath);
  if (staged) {
    return g.diff(['--cached', '--', filePath]);
  }

  const status = await g.status();
  const f = status.files.find((entry) => entry.path === filePath);
  const isUntracked = f?.working_dir === '?' || status.not_added.includes(filePath);
  if (isUntracked) {
    try {
      return await g.raw(['diff', '--no-index', '--', '/dev/null', filePath]);
    } catch (err) {
      // Exit code 1 for differences is expected for --no-index.
      const e = err as { git?: string; message?: string };
      return e.git ?? e.message ?? '';
    }
  }

  return g.diff(['--', filePath]);
}

export async function createBranch(workspaceId: string, name: string): Promise<{ branch: string }> {
  const ws = await getWorkspace(workspaceId);
  const g = await ensureRepo(ws.path);
  // If repo has no commits, create an empty initial commit so checkout -b works.
  const log0 = await g.log().catch(() => null);
  if (!log0 || log0.total === 0) {
    await g.raw(['commit', '--allow-empty', '-m', 'ase: initial commit']);
  }
  await g.checkoutLocalBranch(name);
  return { branch: name };
}

export async function commitAll(
  workspaceId: string,
  message: string,
): Promise<{ committed: boolean; sha?: string; reason?: string }> {
  const ws = await getWorkspace(workspaceId);
  const g = await ensureRepo(ws.path);
  await g.add(['-A']);
  const status = await g.status();
  if (status.isClean()) {
    return { committed: false, reason: 'nothing to commit' };
  }
  const res = await g.commit(message);
  return { committed: true, sha: res.commit };
}

export async function currentBranch(workspaceId: string): Promise<string | null> {
  const ws = await getWorkspace(workspaceId);
  if (!(await isRepo(ws.path))) return null;
  const s = await gitFor(ws.path).status();
  return s.current;
}

// ───────── Stage / Unstage ─────────

export async function stageFiles(cwd: string, paths: string[]): Promise<void> {
  await gitFor(cwd).add(paths);
}

export async function unstageFiles(cwd: string, paths: string[]): Promise<void> {
  await gitFor(cwd).reset(['--', ...paths]);
}

export async function stageAll(cwd: string): Promise<void> {
  await gitFor(cwd).add(['.']);
}

export async function unstageAll(cwd: string): Promise<void> {
  await gitFor(cwd).reset([]);
}

// ───────── Commit / Push ─────────

export async function commitStaged(
  cwd: string,
  message: string,
): Promise<{ ok: boolean; hash?: string; error?: string }> {
  try {
    const result = await gitFor(cwd).commit(message);
    return { ok: true, hash: result.commit };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pushBranch(
  cwd: string,
  setUpstream = false,
): Promise<{ ok: boolean; error?: string }> {
  const g = gitFor(cwd);
  try {
    if (setUpstream) {
      const branch = (await g.branchLocal()).current;
      await g.push(['--set-upstream', 'origin', branch]);
    } else {
      await g.push();
    }
    return { ok: true };
  } catch (err: unknown) {
    // If the push failed because there is no upstream, retry with --set-upstream
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no upstream') || msg.includes('has no upstream') || msg.includes('set-upstream')) {
      try {
        const branch = (await g.branchLocal()).current;
        await g.push(['--set-upstream', 'origin', branch]);
        return { ok: true };
      } catch (err2: unknown) {
        return { ok: false, error: err2 instanceof Error ? err2.message : String(err2) };
      }
    }
    return { ok: false, error: msg };
  }
}

// ───────── gh CLI helpers ─────────

export async function checkGhAuth(cwd: string): Promise<{
  authenticated: boolean;
  installed: boolean;
  user?: string;
  error?: string;
}> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'status', '--hostname', 'github.com'], { cwd });
    const match = stdout.match(/Logged in to .+ as ([^\s]+)/);
    return { authenticated: true, installed: true, user: match?.[1]?.trim() };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stderr?: string; message?: string };
    if (e.code === 'ENOENT') return { authenticated: false, installed: false, error: 'gh CLI not installed' };
    // gh auth status exits 1 when not authenticated
    const stderr = e.stderr ?? '';
    if (stderr.includes('not logged') || stderr.includes('not authenticated')) {
      return { authenticated: false, installed: true, error: 'not authenticated — run: gh auth login' };
    }
    return { authenticated: false, installed: true, error: stderr || e.message };
  }
}

export async function createPullRequest(
  cwd: string,
  opts: { title: string; body?: string; baseBranch?: string; draft?: boolean },
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const args = ['pr', 'create', '--title', opts.title];
  if (opts.body) args.push('--body', opts.body);
  if (opts.baseBranch) args.push('--base', opts.baseBranch);
  if (opts.draft) args.push('--draft');
  try {
    const { stdout } = await execFileAsync('gh', args, { cwd });
    return { ok: true, url: stdout.trim() };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return { ok: false, error: e.stderr || e.message };
  }
}

export async function getPrStatus(cwd: string): Promise<{
  hasPr: boolean;
  url?: string;
  state?: string;
  title?: string;
}> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', '--json', 'url,state,title'],
      { cwd },
    );
    const data = JSON.parse(stdout) as { url: string; state: string; title: string };
    return { hasPr: true, url: data.url, state: data.state, title: data.title };
  } catch {
    return { hasPr: false };
  }
}
