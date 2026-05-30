import { platform } from 'node:os';
import { nanoid } from 'nanoid';
import { getProvider } from '../services/llm/index.js';
import { PROVIDERS } from '@shared/constants';
import { listToolsForLLM } from '../services/tools/registry.js';
import { workspaceStatus, getWorktreeRoot } from '../services/git.js';
import { resolveShell } from '../services/shell/env.js';
import { extractJson } from '../util/json.js';
import { taskBus } from '../services/events.js';
import type { ChatMessage, ChatToolDef, ToolCall } from '../services/llm/provider.js';
import type { EnvironmentContext } from './prompts.js';
import type { RunCtx } from './runCtx.js';

export interface ToolCallResponse {
  toolCalls: ToolCall[];
  /** Text content of the assistant message (may be empty string). */
  text: string;
  done: false;
}

export interface DoneResponse {
  toolCalls?: undefined;
  done: true;
  /** Text content from the final LLM response (used by planner to extract the plan). */
  text: string;
}

/**
 * Send the current conversation messages to the LLM and return either
 * tool calls (with IDs for correlation) or a "done" signal.
 */
export async function llmChat(
  ctx: RunCtx,
  agent: string,
  messages: ChatMessage[],
  temperature = 0.2,
  toolsDef?: ChatToolDef[],
): Promise<ToolCallResponse | DoneResponse> {
  const provider = getProvider(PROVIDERS.OLLAMA);
  const tools = toolsDef ?? listToolsForLLM();
  const buf: string[] = [];
  const result = await provider.chat({
    model: ctx.model,
    temperature,
    signal: ctx.signal,
    messages,
    tools,
    onDelta: (d) => {
      buf.push(d);
      taskBus.emit(ctx.taskId, {
        type: 'llm.delta',
        taskId: ctx.taskId,
        ts: Date.now(),
        agent,
        content: d,
      });
    },
    onThinkingDelta: (d) => {
      taskBus.emit(ctx.taskId, {
        type: 'llm.thinking_delta',
        taskId: ctx.taskId,
        ts: Date.now(),
        agent,
        content: d,
      });
    },
  });
  const text = result.content || buf.join('');

  if (result.toolCalls?.length) {
    return { toolCalls: result.toolCalls, text, done: false };
  }

  try {
    const parsed = extractJson<{
      done?: boolean;
      action?: { tool: string; args: Record<string, unknown> };
    }>(text);
    if (parsed.done) return { done: true, text };
    if (parsed.action) {
      return {
        toolCalls: [
          { id: `call_${nanoid(8)}`, name: parsed.action.tool, arguments: parsed.action.args },
        ],
        text,
        done: false,
      };
    }
  } catch {
    /* not valid JSON, treat as done */
  }

  return { done: true, text };
}

export async function gatherEnvContext(ctx: RunCtx): Promise<EnvironmentContext> {
  let isGitRepo = false;
  let worktree = ctx.workspacePath;
  let branch: string | null = null;
  let changedFiles: string[] = [];
  try {
    const status = await workspaceStatus(ctx.workspaceId);
    isGitRepo = status.isRepo;
    if (isGitRepo) {
      const root = await getWorktreeRoot(ctx.workspacePath);
      if (root) worktree = root;
      branch = status.branch;
      changedFiles = [
        ...status.staged.map((f) => `staged: ${f}`),
        ...status.modified.map((f) => `modified: ${f}`),
        ...status.not_added.map((f) => `untracked: ${f}`),
      ];
    }
  } catch {
    // git info is best-effort; swallow errors
  }
  return {
    directory: ctx.workspacePath,
    worktree,
    isGitRepo,
    platform: platform(),
    shell: await resolveShell()
      .then((config) => config.shellPath)
      .catch(() => process.env.SHELL ?? null),
    model: ctx.model,
    git: { branch, changedFiles },
  };
}
