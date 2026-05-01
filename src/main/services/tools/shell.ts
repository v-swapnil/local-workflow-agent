import { z } from 'zod';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runSandboxed, type SandboxResult } from '../sandbox.js';
import { getWorkspace } from '../workspaces.js';
import type { Tool } from './types.js';

export const runShellTool: Tool<
  { cmd: string; args?: string[]; timeoutMs?: number },
  SandboxResult
> = {
  name: 'run_shell',
  description:
    'Run a shell command inside the workspace sandbox. Command must be in the allowlist.',
  schema: z.object({
    cmd: z.string().min(1),
    args: z.array(z.string()).optional(),
    timeoutMs: z.number().int().min(100).max(600_000).optional(),
  }),
  needsApproval: true,
  run: async ({ cmd, args, timeoutMs }, ctx) =>
    runSandboxed({
      cmd,
      args,
      cwd: ctx.workspacePath,
      timeoutMs,
      onLog: ctx.onLog,
      signal: ctx.signal,
    }),
};

interface RunTestsResult extends SandboxResult {
  detected: string;
}

interface TestRunnerChoice {
  cmd: string;
  args: string[];
}

export const runTestsTool: Tool<
  { cmd?: string; args?: string[]; timeoutMs?: number },
  RunTestsResult
> = {
  name: 'run_tests',
  description:
    'Detect and run the project test suite (vitest/jest/npm test/pytest). Pass `cmd` to override.',
  schema: z.object({
    cmd: z.string().optional(),
    args: z.array(z.string()).optional(),
    timeoutMs: z.number().int().min(100).max(600_000).optional(),
  }),
  needsApproval: true,
  run: async ({ cmd, args, timeoutMs }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    let chosen: TestRunnerChoice;
    let detected: string;
    if (cmd) {
      chosen = { cmd, args: args ?? [] };
      detected = 'override';
    } else {
      chosen = await detectTestRunner(ws.path);
      detected = `${chosen.cmd} ${chosen.args.join(' ')}`.trim();
    }
    const result = await runSandboxed({
      cmd: chosen.cmd,
      args: chosen.args,
      cwd: ws.path,
      timeoutMs: timeoutMs ?? 120_000,
      onLog: ctx.onLog,
      signal: ctx.signal,
    });
    return { ...result, detected };
  },
};

export async function hasTestsConfigured(root: string): Promise<boolean> {
  return (await detectConfiguredTestRunner(root)) != null;
}

async function detectTestRunner(root: string): Promise<TestRunnerChoice> {
  const configured = await detectConfiguredTestRunner(root);
  if (configured) return configured;
  // Last resort
  return { cmd: 'npm', args: ['test'] };
}

async function detectConfiguredTestRunner(root: string): Promise<TestRunnerChoice | null> {
  const pkgPath = join(root, 'package.json');
  if (await exists(pkgPath)) {
    try {
      const raw = await import('node:fs/promises').then((m) => m.readFile(pkgPath, 'utf8'));
      const pkg = JSON.parse(raw) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      if (pkg.scripts?.test) return { cmd: 'npm', args: ['test', '--silent'] };
      const deps = { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
      if (deps['vitest']) return { cmd: 'npx', args: ['vitest', 'run'] };
      if (deps['jest']) return { cmd: 'npx', args: ['jest'] };
    } catch {
      /* fall through */
    }
  }
  if (await exists(join(root, 'pyproject.toml')) || await exists(join(root, 'pytest.ini'))) {
    return { cmd: 'pytest', args: [] };
  }
  return null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
