/** Mirrors ToolName in src/main/services/tools/types.ts. */
export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'apply_patch'
  | 'list_dir'
  | 'grep'
  | 'glob'
  | 'run_shell'
  | 'git_status'
  | 'git_diff'
  | 'git_branch'
  | 'git_commit'
  | 'ask_user'
  | 'read_memories'
  | 'add_memory'
  // ── codebase search ──
  | 'list_symbols'
  | 'list_imports'
  | 'find_symbol'
  | 'find_references';

/** ───────── Executor I/O ───────── */

export interface ExecutorAction {
  thought: string;
  /** null = nothing more to do for this step */
  action: { tool: ToolName; args: Record<string, unknown> } | null;
  /** When true, the executor declares the task complete. */
  done: boolean;
}

/** Observation appended to the executor's working memory after a tool call. */
export interface Observation {
  tool: ToolName;
  args: Record<string, unknown>;
  ok: boolean;
  /** Stringified output (truncated). */
  output: string;
  error?: string;
  durationMs: number;
}

/** ───────── Final task result ───────── */

export interface TaskResult {
  status: 'succeeded' | 'failed' | 'cancelled';
  iterations: number;
  plan: string | null;
  reason?: string;
}
