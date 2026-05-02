import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import treeKill from 'tree-kill';
import { logger } from './logger.js';

export interface SandboxOptions {
  cmd: string;
  args?: string[];
  cwd: string;
  /** Per-line stream callback (stdout & stderr combined, tagged with stream). */
  onLog?: (chunk: { stream: 'stdout' | 'stderr'; text: string }) => void;
  timeoutMs?: number;
  /** Extra env vars to allow through (PATH/HOME/LANG/SHELL always allowed). */
  envAllow?: string[];
  /** Override the command allowlist. Default uses module-level DEFAULT_CMD_ALLOW. */
  cmdAllow?: string[];
  signal?: AbortSignal;
}

export interface SandboxResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  killedByUser: boolean;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const MAX_CAPTURE_BYTES = 1_000_000; // 1 MB cap per stream

const DEFAULT_CMD_ALLOW = [
  'node',
  'npm',
  'pnpm',
  'yarn',
  'npx',
  'tsc',
  'vitest',
  'jest',
  'git',
  'python',
  'python3',
  'pip',
  'pip3',
  'pytest',
  'echo',
  'ls',
  'cat',
  'grep',
  'rg',
  'find',
  'mkdir',
  'touch',
  'rm',
  'mv',
  'cp',
  'true',
  'false',
  'pwd',
  'env',
];

const ENV_ALWAYS_ALLOW = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'SHELL', 'TMPDIR', 'USER'];

function scrubbedEnv(extra: string[] = []): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  const allow = new Set([...ENV_ALWAYS_ALLOW, ...extra]);
  for (const k of allow) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
  }
  // Pin a sane PATH if missing.
  if (!out.PATH) out.PATH = '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin';
  return out;
}

/**
 * Spawn a command in a sandboxed environment.
 *
 * - cwd is required and must be an absolute path the caller has already
 *   validated as inside a workspace.
 * - command is checked against an allowlist.
 * - environment is scrubbed.
 * - process tree is killed on timeout / abort.
 */
export async function runSandboxed(opts: SandboxOptions): Promise<SandboxResult> {
  const allow = new Set(opts.cmdAllow ?? DEFAULT_CMD_ALLOW);
  const cmdName = basename(opts.cmd);
  if (!allow.has(cmdName)) {
    throw new Error(`command not allowed: ${cmdName}`);
  }

  const timeoutMs = Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const env = scrubbedEnv(opts.envAllow);
  const t0 = Date.now();

  return await new Promise<SandboxResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let killedByUser = false;
    let resolved = false;

    let child;
    try {
      child = spawn(opts.cmd, opts.args ?? [], {
        cwd: opts.cwd,
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(err);
      return;
    }

    const pid = child.pid;
    logger.info({ cmd: opts.cmd, args: opts.args, cwd: opts.cwd, pid }, 'sandbox start');

    const killTree = (sig: NodeJS.Signals = 'SIGTERM') => {
      if (pid !== undefined) {
        treeKill(pid, sig, () => {
          /* swallow */
        });
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree('SIGKILL');
    }, timeoutMs);

    const onAbort = () => {
      killedByUser = true;
      killTree('SIGTERM');
      // Force kill if still alive shortly after
      setTimeout(() => killTree('SIGKILL'), 1500);
    };
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk: string) => {
      if (stdoutBytes < MAX_CAPTURE_BYTES) {
        stdout += chunk;
        stdoutBytes += Buffer.byteLength(chunk);
      }
      opts.onLog?.({ stream: 'stdout', text: chunk });
    });
    child.stderr?.on('data', (chunk: string) => {
      if (stderrBytes < MAX_CAPTURE_BYTES) {
        stderr += chunk;
        stderrBytes += Buffer.byteLength(chunk);
      }
      opts.onLog?.({ stream: 'stderr', text: chunk });
    });

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      const result: SandboxResult = {
        ok: exitCode === 0 && !timedOut && !killedByUser,
        exitCode,
        signal,
        stdout: stdoutBytes >= MAX_CAPTURE_BYTES ? stdout + '\n…[truncated]' : stdout,
        stderr: stderrBytes >= MAX_CAPTURE_BYTES ? stderr + '\n…[truncated]' : stderr,
        durationMs: Date.now() - t0,
        timedOut,
        killedByUser,
      };
      logger.info(
        { cmd: opts.cmd, exitCode, signal, timedOut, killedByUser, ms: result.durationMs },
        'sandbox done',
      );
      resolve(result);
    };

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code, signal) => finish(code, signal));
  });
}
