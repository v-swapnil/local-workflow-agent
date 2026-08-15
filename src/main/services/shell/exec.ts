import { spawn } from 'node:child_process';
import treeKill from 'tree-kill';
import { resolveShell, buildShellArgs } from './env.js';
import { truncateOutput } from './truncate.js';
import { logger } from '../logger.js';
import { ToolResultV2 } from '@shared/types.js';

export interface ShellExecOptions {
  command: string;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
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

export async function runShell(opts: ShellExecOptions): Promise<ToolResultV2> {
  const { shellPath, shellName } = await resolveShell();
  const shellArgs = buildShellArgs(shellName, opts.command);
  const timeoutMs = Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

  return new Promise<ToolResultV2>((resolve, reject) => {
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
      logger.error({ command: opts.command, cwd: opts.cwd, err }, 'Failed to spawn shell process');
      reject(
        'ERROR: failed to spawn shell process - ' +
          (err instanceof Error ? err.message : String(err)),
      );
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
    });

    child.stderr?.on('data', (chunk: string) => {
      const text = stripAnsi(chunk);
      chunks.push(text);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      chunks.push(`ETIMEDOUT: Command timed out after ${timeoutMs}ms`);
      killGracefully(pid);
    }, timeoutMs);

    const onAbort = () => {
      killedByUser = true;
      chunks.push('ECANCELED: Command killed by user (abort signal received)');
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

      const commandOutput = [
        chunks.join(''),
        sig
          ? `Command terminated by signal: ${sig}`
          : `Command finished with exit code: ${exitCode}`,
      ].join('\n\n');

      const { content, truncated } = truncateOutput(commandOutput);

      logger.info({ cmd: opts.command, exitCode, sig, timedOut, killedByUser }, 'shell done');

      const isErrored = timedOut || exitCode !== 0;
      const status = killedByUser ? 'cancelled' : isErrored ? 'error' : 'success';

      resolve({ status, content, truncated });
    };

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      reject('ERROR: shell process error - ' + (err instanceof Error ? err.message : String(err)));
    });

    child.on('close', (code, signal) => finish(code, signal));
  });
}
