import type { RunnableConfig } from '@langchain/core/runnables';

/* ───────── Run context (passed via RunnableConfig.configurable) ───────── */

export interface RunCtx {
  workspaceId: number;
  workspacePath: string;
  sessionId: number;
  taskId: number;
  model: string;
  signal: AbortSignal;
  agentId: number | null;
  timeoutMs: number;
}

export function ctxOf(config?: RunnableConfig): RunCtx {
  const c = config?.configurable?.runCtx as RunCtx | undefined;
  if (!c) throw new Error('orchestrator: missing runCtx in config');
  return c;
}
