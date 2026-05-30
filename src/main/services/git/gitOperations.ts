import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gitFor, ensureRepo } from './gitCore.js';
import { getWorkspace } from '../workspaces';

const execFileAsync = promisify(execFile);

// ───────── Branch ─────────

export async function createBranch(
  workspaceId: string,
  name: string,
): Promise<{ branch: string }> {
  const workspace = await getWorkspace(workspaceId);
  const git = await ensureRepo(workspace.path);
  // If repo has no commits, create an empty initial commit so checkout -b works.
  const gitLog = await git.log().catch(() => null);
  if (!gitLog || gitLog.total === 0) {
    await git.raw(['commit', '--allow-empty', '-m', 'ase: initial commit']);
  }
  await git.checkoutLocalBranch(name);
  return { branch: name };
}

export async function commitAll(
  workspaceId: string,
  message: string,
): Promise<{ committed: boolean; sha?: string; reason?: string }> {
  const workspace = await getWorkspace(workspaceId);
  const git = await ensureRepo(workspace.path);
  await git.add(['-A']);
  const status = await git.status();
  if (status.isClean()) return { committed: false, reason: 'nothing to commit' };
  const commitResult = await git.commit(message);
  return { committed: true, sha: commitResult.commit };
}

export async function currentBranch(workspaceId: string): Promise<string | null> {
  const workspace = await getWorkspace(workspaceId);
  const git = gitFor(workspace.path);
  try {
    const status = await git.status();
    return status.current;
  } catch {
    return null;
  }
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
  const git = gitFor(cwd);
  try {
    if (setUpstream) {
      const currentBranchName = (await git.branchLocal()).current;
      await git.push(['--set-upstream', 'origin', currentBranchName]);
    } else {
      await git.push();
    }
    return { ok: true };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (
      errMsg.includes('no upstream') ||
      errMsg.includes('has no upstream') ||
      errMsg.includes('set-upstream')
    ) {
      try {
        const currentBranchName = (await git.branchLocal()).current;
        await git.push(['--set-upstream', 'origin', currentBranchName]);
        return { ok: true };
      } catch (retryErr: unknown) {
        return { ok: false, error: retryErr instanceof Error ? retryErr.message : String(retryErr) };
      }
    }
    return { ok: false, error: errMsg };
  }
}

// ───────── GitHub CLI ─────────

export async function checkGhAuth(cwd: string): Promise<{
  authenticated: boolean;
  installed: boolean;
  user?: string;
  error?: string;
}> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['auth', 'status', '--hostname', 'github.com'],
      { cwd },
    );
    const match = stdout.match(/Logged in to .+ as ([^\s]+)/);
    return { authenticated: true, installed: true, user: match?.[1]?.trim() };
  } catch (err: unknown) {
    const cliErr = err as NodeJS.ErrnoException & { stderr?: string; message?: string };
    if (cliErr.code === 'ENOENT') {
      return { authenticated: false, installed: false, error: 'gh CLI not installed' };
    }
    const stderr = cliErr.stderr ?? '';
    if (stderr.includes('not logged') || stderr.includes('not authenticated')) {
      return {
        authenticated: false,
        installed: true,
        error: 'not authenticated — run: gh auth login',
      };
    }
    return { authenticated: false, installed: true, error: stderr || cliErr.message };
  }
}

export async function createPullRequest(
  cwd: string,
  opts: { title: string; body?: string; baseBranch?: string; draft?: boolean },
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const ghArgs = ['pr', 'create', '--title', opts.title];
  if (opts.body) ghArgs.push('--body', opts.body);
  if (opts.baseBranch) ghArgs.push('--base', opts.baseBranch);
  if (opts.draft) ghArgs.push('--draft');
  try {
    const { stdout } = await execFileAsync('gh', ghArgs, { cwd });
    return { ok: true, url: stdout.trim() };
  } catch (err: unknown) {
    const cliErr = err as { stderr?: string; message?: string };
    return { ok: false, error: cliErr.stderr || cliErr.message };
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
