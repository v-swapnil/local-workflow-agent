import { spawn } from 'node:child_process';
import treeKill from 'tree-kill';
import { resolveShell, buildShellArgs } from './env.js';
import { truncateOutput } from './truncate.js';
import { logger } from '../logger.js';

export interface ShellExecOptions {
  command: string;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (chunk: { stream: 'stdout' | 'stderr'; text: string }) => void;
}

export interface ShellResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  durationMs: number;
  timedOut: boolean;
  killedByUser: boolean;
  truncated: boolean;
  fullOutputPath: string | null;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b[()][AB012]|\x1b\[[\?]?[0-9;]*[hlmsr]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

function killGracefully(pid: number | undefined): void {
  if (pid === undefined) return;
  treeKill(pid, 'SIGTERM', () => {
    setTimeout(() => {
      treeKill(pid, 'SIGKILL', () => {
        /* swallow */
      });
    }, 2000);
  });
}

export async function runShell(opts: ShellExecOptions): Promise<ShellResult> {
  const { shellPath, shellName } = await resolveShell();
  const shellArgs = buildShellArgs(shellName, opts.command);
  const timeoutMs = Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const t0 = Date.now();

  return new Promise<ShellResult>((resolve, reject) => {
    let timedOut = false;
    let killedByUser = false;
    let settled = false;

    let child;
    try {
      child = spawn(shellPath, shellArgs, {
        cwd: opts.cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      reject(err);
      return;
    }

    const { pid } = child;
    logger.info({ cmd: opts.command, cwd: opts.cwd, pid }, 'shell start');

    const chunks: string[] = [];

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk: string) => {
      const text = stripAnsi(chunk);
      chunks.push(text);
      opts.onLog?.({ stream: 'stdout', text });
    });

    child.stderr?.on('data', (chunk: string) => {
      const text = stripAnsi(chunk);
      chunks.push(text);
      opts.onLog?.({ stream: 'stderr', text });
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killGracefully(pid);
    }, timeoutMs);

    const onAbort = () => {
      killedByUser = true;
      killGracefully(pid);
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    const finish = (exitCode: number | null, sig: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);

      const raw = chunks.join('');
      const { text, truncated, fullOutputPath } = truncateOutput(raw);

      logger.info(
        { cmd: opts.command, exitCode, sig, timedOut, killedByUser, ms: Date.now() - t0 },
        'shell done',
      );

      resolve({
        ok: exitCode === 0 && !timedOut && !killedByUser,
        exitCode,
        signal: sig,
        output: text,
        durationMs: Date.now() - t0,
        timedOut,
        killedByUser,
        truncated,
        fullOutputPath,
      });
    };

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });

    child.on('close', (code, sig) => finish(code, sig));
  });
}
