import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getWorkspace } from '../workspaces.js';
import { readFileTool, writeFileTool, listDirTool, grepTool, globTool, applyPatchTool, editTool } from './fs.js';
import { runShellTool, runTestsTool } from './shell.js';
import { gitStatusTool, gitDiffTool, gitBranchTool, gitCommitTool } from './git.js';
import { askUserTool } from './user.js';
import { readMemoriesTool, addMemoryTool } from './memory.js';
import {
  listSymbolsTool,
  listImportsTool,
  findSymbolTool,
  findReferencesTool,
} from './codesearch.js';
import { requestApproval } from '../approvals.js';
import type { Tool, ToolName, ToolResult, ToolContext } from './types.js';
import type { ChatToolDef } from '../llm/provider.js';

const REGISTRY: Record<ToolName, Tool<unknown, unknown>> = {
  read_file: readFileTool as Tool<unknown, unknown>,
  write_file: writeFileTool as Tool<unknown, unknown>,
  edit: editTool as Tool<unknown, unknown>,
  apply_patch: applyPatchTool as Tool<unknown, unknown>,
  list_dir: listDirTool as Tool<unknown, unknown>,
  grep: grepTool as Tool<unknown, unknown>,
  glob: globTool as Tool<unknown, unknown>,
  run_shell: runShellTool as Tool<unknown, unknown>,
  run_tests: runTestsTool as Tool<unknown, unknown>,
  git_status: gitStatusTool as Tool<unknown, unknown>,
  git_diff: gitDiffTool as Tool<unknown, unknown>,
  git_branch: gitBranchTool as Tool<unknown, unknown>,
  git_commit: gitCommitTool as Tool<unknown, unknown>,
  ask_user: askUserTool as Tool<unknown, unknown>,
  read_memories: readMemoriesTool as Tool<unknown, unknown>,
  add_memory: addMemoryTool as Tool<unknown, unknown>,
  // ── codebase search ──
  list_symbols:    listSymbolsTool    as Tool<unknown, unknown>,
  list_imports:    listImportsTool    as Tool<unknown, unknown>,
  find_symbol:     findSymbolTool     as Tool<unknown, unknown>,
  find_references: findReferencesTool as Tool<unknown, unknown>,
};

export function listTools(): {
  name: ToolName;
  description: string;
  needsApproval: boolean;
  argsSchema: Record<string, unknown>;
}[] {
  return Object.values(REGISTRY).map((t) => ({
    name: t.name,
    description: t.description,
    needsApproval: t.needsApproval,
    argsSchema: zodToJsonSchema(t.schema, { target: 'jsonSchema7' }) as Record<string, unknown>,
  }));
}

/**
 * Returns tool definitions in the format expected by the Ollama chat API
 * (and the ChatToolDef interface used by the provider).
 */
export function listToolsForLLM(): ChatToolDef[] {
  return Object.values(REGISTRY).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.schema, { target: 'jsonSchema7' }) as Record<string, unknown>,
    },
  }));
}

/** Read-only subset of tools safe for the planner to explore the workspace. */
const READ_ONLY_TOOLS: ToolName[] = [
  'read_file',
  'list_dir',
  'grep',
  'glob',
  'git_status',
  'git_diff',
  'read_memories',
  // ── codebase search ──
  'list_symbols',
  'list_imports',
  'find_symbol',
  'find_references',
];

/** Returns true if the given tool is read-only (safe to run in parallel). */
export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.includes(name as ToolName);
}

export function listReadOnlyToolsForLLM(): ChatToolDef[] {
  return Object.values(REGISTRY)
    .filter((tool) => READ_ONLY_TOOLS.includes(tool.name))
    .map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.schema, { target: 'jsonSchema7' }) as Record<
          string,
          unknown
        >,
      },
    }));
}

export function getTool(name: ToolName): Tool<unknown, unknown> {
  const tool = REGISTRY[name];
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool;
}

export interface InvokeOpts {
  workspaceId: string;
  /** Override the workspace path (e.g. when running in a worktree). Falls back to ws.path. */
  workspacePath?: string;
  /** When set, sensitive tools will require approval before execution. */
  taskId?: string;
  signal?: AbortSignal;
  onLog?: ToolContext['onLog'];
}

/**
 * Validate args against the tool schema, then run.
 * Catches errors and packages them into a uniform `ToolResult`.
 */
export async function invokeTool(
  name: ToolName,
  rawArgs: unknown,
  opts: InvokeOpts,
): Promise<ToolResult> {
  const tool = getTool(name);
  const t0 = Date.now();
  try {
    const parsed = tool.schema.parse(rawArgs);
    const ws = await getWorkspace(opts.workspaceId);

    if (tool.needsApproval && opts.taskId) {
      const decision = await requestApproval(opts.taskId, name, parsed, opts.signal);
      if (decision === 'deny') {
        return { ok: false, error: 'denied by user', durationMs: Date.now() - t0 };
      }
    }

    const ctx: ToolContext = {
      workspaceId: opts.workspaceId,
      workspacePath: opts.workspacePath ?? ws.path,
      taskId: opts.taskId,
      signal: opts.signal,
      onLog: opts.onLog,
    };
    const output = await tool.run(parsed, ctx);
    return { ok: true, output, durationMs: Date.now() - t0 };
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? `invalid args: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, error: msg, durationMs: Date.now() - t0 };
  }
}

export type { Tool, ToolName, ToolResult, ToolContext, InvokeOpts as ToolInvokeOpts };
