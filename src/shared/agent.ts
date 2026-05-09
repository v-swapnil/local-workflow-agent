/** Mirrors ToolName in src/main/services/tools/types.ts. */
export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'apply_patch'
  | 'list_dir'
  | 'grep'
  | 'run_shell'
  | 'run_tests'
  | 'git_status'
  | 'git_diff'
  | 'git_branch'
  | 'git_commit'
  | 'ask_user';

/** ───────── Plan ───────── */

export interface PlanStep {
  id: string;
  goal: string;
  rationale: string;
}

export interface Plan {
  summary: string;
  steps: PlanStep[];
  /** Skill names the planner judged useful for this task. */
  selectedSkills?: string[];
}

/** ───────── Executor I/O ───────── */

export interface ExecutorAction {
  thought: string;
  /** null = nothing more to do for this step */
  action: { tool: ToolName; args: Record<string, unknown> } | null;
  /** When true, the executor declares the current plan step complete. */
  done: boolean;
}

/** Observation appended to the executor's working memory after a tool call. */
export interface Observation {
  stepId: string;
  tool: ToolName;
  args: Record<string, unknown>;
  ok: boolean;
  /** Stringified output (truncated). */
  output: string;
  error?: string;
  durationMs: number;
}

/** ───────── Tester / Critic ───────── */

export interface TestReport {
  ran: boolean;
  ok: boolean;
  detected?: string;
  exitCode?: number;
  durationMs?: number;
  /** Tail of stdout/stderr. */
  log: string;
  error?: string;
}

export interface Verdict {
  done: boolean;
  reason: string;
  /** Hint to feed back into the next executor pass when not done. */
  nextHint?: string;
}

/** ───────── Final task result ───────── */

export interface TaskResult {
  status: 'succeeded' | 'failed' | 'cancelled';
  iterations: number;
  plan: Plan | null;
  testReport: TestReport | null;
  verdict: Verdict | null;
  reason?: string;
}
