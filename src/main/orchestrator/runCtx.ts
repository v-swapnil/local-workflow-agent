import type { RunnableConfig } from '@langchain/core/runnables';

/* ───────── Run context (passed via RunnableConfig.configurable) ───────── */

export interface RunCtx {
  workspaceId: string;
  workspacePath: string;
  sessionId: string;
  taskId: string;
  model: string;
  signal: AbortSignal;
  stepIdx: { n: number };
  agentId: string | null;
  timeoutMs: number;
}

export function ctxOf(config?: RunnableConfig): RunCtx {
  const c = config?.configurable?.runCtx as RunCtx | undefined;
  if (!c) throw new Error('orchestrator: missing runCtx in config');
  return c;
}
