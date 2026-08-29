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
  | 'ask_question'
  | 'create_memory'
  | 'create_task'
  | 'task_complete'
  // ── codebase search ──
  | 'outline_file'
  | 'find_symbol'
  | 'find_references';



/** ───────── Final task result ───────── */

export interface TaskResult {
  status: 'succeeded' | 'failed' | 'cancelled';
  reason?: string;
}
