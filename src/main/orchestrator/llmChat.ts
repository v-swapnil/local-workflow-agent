import { platform } from 'node:os';
import { getProvider } from '../services/llm/index.js';
import { PROVIDERS } from '@shared/constants';
import { listToolsForLLM } from '../services/tools/registry.js';
import { workspaceStatus, getWorktreeRoot } from '../services/git';
import { resolveShell } from '../services/shell/env.js';
import { emitMessageDelta, emitThinkingDelta } from './eventEmitter.js';
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
  availableTools?: ChatToolDef[],
): Promise<ToolCallResponse | DoneResponse> {
  const provider = getProvider(PROVIDERS.OLLAMA);
  const tools = availableTools ?? listToolsForLLM();

  const result = await provider.chat({
    taskId: ctx.taskId,
    workingDirectory: ctx.workspacePath,
    model: ctx.model,
    temperature,
    signal: ctx.signal,
    messages,
    tools,
    onDelta: (d) => emitMessageDelta(ctx.taskId, agent, d),
    onThinkingDelta: (d) => emitThinkingDelta(ctx.taskId, agent, d),
  });

  if (result.toolCalls?.length) {
    return { toolCalls: result.toolCalls, text: result.content, done: false };
  }

  return { done: true, text: result.content };
}

export async function gatherEnvContext(ctx: RunCtx): Promise<EnvironmentContext> {
  let isGitRepo = false;
  let worktree = ctx.workspacePath;
  let branch: string | null = null;
  let changedFiles: string[] = [];
  let shell = process.env.SHELL ?? null;

  try {
    const resolvedShell = await resolveShell();
    if (resolvedShell.shellPath) shell = resolvedShell.shellPath;

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
    shell,
    model: ctx.model,
    git: { branch, changedFiles },
  };
}
