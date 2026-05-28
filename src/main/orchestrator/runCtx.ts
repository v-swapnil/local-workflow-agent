import type { RunnableConfig } from '@langchain/core/runnables';

/* ───────── Run context (passed via RunnableConfig.configurable) ───────── */

export interface RunCtx {
  taskId: string;
  workspaceId: string;
  workspacePath: string;
  model: string;
  signal: AbortSignal;
  /** Monotonic step index counter, mutated as we add steps. */
  stepIdx: { n: number };
  /** Persisted session memory included in all task prompts. */
  sessionMemory?: string | null;
}

export function ctxOf(config?: RunnableConfig): RunCtx {
  const c = config?.configurable?.runCtx as RunCtx | undefined;
  if (!c) throw new Error('orchestrator: missing runCtx in config');
  return c;
}
