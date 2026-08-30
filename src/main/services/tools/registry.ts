import { z } from 'zod';
import { getWorkspace } from '../workspaces';
import {
  readFileTool,
  writeFileTool,
  listDirTool,
  grepTool,
  globTool,
  applyPatchTool,
  editFileTool,
} from './fs.js';
import { runShellTool } from './shell.js';
import { askQuestionTool } from './user.js';
import { createMemoryTool } from './memory.js';
import { createTaskTool, taskCompleteTool } from './task.js';
import { outlineFileTool, findSymbolTool, findReferencesTool } from './codesearch.js';
import { requestApproval } from '../approvals/index.js';
import type { Tool, ToolContext } from './types.js';
import type { ChatToolDef } from '../llm/provider.js';
import { ToolResultV2 } from '@shared/types';
import { ToolName } from '@shared/agent';

const REGISTRY = {
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  apply_patch: applyPatchTool,
  list_dir: listDirTool,
  grep: grepTool,
  glob: globTool,
  run_shell: runShellTool,
  ask_question: askQuestionTool,
  create_memory: createMemoryTool,
  create_task: createTaskTool,
  task_complete: taskCompleteTool,
  // ── codebase search ──
  outline_file: outlineFileTool,
  find_symbol: findSymbolTool,
  find_references: findReferencesTool,
} as const;

export function listToolNames(): ToolName[] {
  return Object.keys(REGISTRY) as ToolName[];
}

export function listTools(): {
  name: ToolName;
  description: string;
  needsApproval: boolean;
  readOnly: boolean;
  argsSchema: Record<string, unknown>;
}[] {
  return Object.values(REGISTRY).map((t) => ({
    name: t.name,
    description: t.description,
    needsApproval: t.needsApproval,
    readOnly: READ_ONLY_TOOLS.includes(t.name),
    argsSchema: z.toJSONSchema(t.schema, { target: 'draft-7' }) as Record<string, unknown>,
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
      parameters: z.toJSONSchema(t.schema, { target: 'draft-7' }) as Record<string, unknown>,
    },
  }));
}

/** Read-only subset of tools safe for the planner to explore the workspace. */
const READ_ONLY_TOOLS: ToolName[] = [
  'read_file',
  'list_dir',
  'grep',
  'glob',
  'ask_question',
  // ── codebase search ──
  'outline_file',
  'find_symbol',
  'find_references',
];

/** Returns true if the given tool is read-only (safe to run in parallel). */
export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.includes(name as ToolName);
}

function getTool(name: ToolName): Tool<Record<string, unknown>, ToolResultV2> {
  const tool = REGISTRY[name];
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool as unknown as Tool<Record<string, unknown>, ToolResultV2>;
}

/**
 * Validate args against the tool schema, then run.
 * Catches errors and packages them into a uniform `ToolResult`.
 */
export async function invokeTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  opts: ToolContext,
): Promise<ToolResultV2> {
  const workspace = await getWorkspace(opts.workspaceId);

  try {
    const tool = getTool(name);
    const parsed = tool.schema.parse(rawArgs) as Record<string, unknown>;

    if (tool.needsApproval && opts.taskId) {
      const decision = await requestApproval(
        opts.taskId,
        opts.toolCallId ?? null,
        name,
        opts.signal,
      );
      if (decision === 'denied') {
        return {
          status: 'cancelled',
          content: 'Tool execution denied by user.',
          truncated: false,
        };
      }
    }

    const toolContext: ToolContext = {
      workspaceId: opts.workspaceId,
      workspacePath: opts.workspacePath ?? workspace.path,
      sessionId: opts.sessionId,
      taskId: opts.taskId,
      signal: opts.signal,
    };
    const output = await tool.run(parsed, toolContext);

    return output;
  } catch (err) {
    let errorMessage = err instanceof Error ? err.message : String(err);
    if (err instanceof z.ZodError) {
      errorMessage = `Invalid tool args: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }
    return {
      status: 'error',
      truncated: false,
      content: errorMessage,
    };
  }
}
