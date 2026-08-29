import { ToolName } from '@shared/agent';

function str(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

/**
 * Produce a short human-readable label for a tool invocation.
 * Used by tool_call.started and approval.requested rows.
 */
export function summarizeToolCall(toolName: ToolName, args: Record<string, unknown> = {}): string {
  switch (toolName) {
    case 'read_file':
      return `Reading ${str(args.path)}`;
    case 'write_file':
      return `Writing ${str(args.path)}`;
    case 'edit_file':
      return `Editing ${str(args.path)}`;
    case 'apply_patch':
      return 'Applying patch';
    case 'list_dir':
      return `Listing ${args.path ? str(args.path) : '.'}`;
    case 'grep':
      return `Searching ${str(args.pattern)}`;
    case 'glob':
      return `Finding files ${str(args.pattern)}`;
    case 'run_shell':
      return `Running ${str(args.command)}`;
    case 'ask_question':
      return `Asking: ${str(args.question)}`;
    case 'create_memory':
      return `Creating memory`;
    case 'task_complete':
      return 'Task Complete!';
    case 'create_task':
      return `Creating Task`;
    case 'outline_file':
      return `Outlining ${str(args.path)}`;
    case 'find_symbol':
      return `Finding Symbol ${str(args.symbol)}`;
    case 'find_references':
      return `Finding References to ${str(args.symbol)}`;
    default:
      return toolName;
  }
}

/**
 * Produce a short human-readable label for a tool result.
 * Used by tool_call.finished rows.
 */
export function summarizeToolResult(
  toolName: ToolName,
  ok: boolean,
  output?: unknown,
  error?: string,
): string {
  if (!ok) return error ? error : 'unknown error';

  // Best-effort extraction from output
  const o = output as Record<string, unknown> | undefined;
  if (!o) return 'done';

  switch (toolName) {
    case 'read_file': {
      const lines = Array.isArray(o.lines) ? o.lines.length : null;
      return lines != null ? `${lines} lines` : 'done';
    }
    case 'write_file':
      return 'written';
    case 'edit_file':
      return typeof o.replacements === 'number' ? `${o.replacements} replacement(s)` : 'applied';
    case 'list_dir':
      return typeof o === 'string' ? o : 'done';
    case 'grep': {
      const matches = Array.isArray(o.matches) ? o.matches.length : null;
      return matches != null ? `${matches} match(es)` : 'done';
    }
    case 'glob': {
      const arr = o.files ?? o;
      const files = Array.isArray(arr) ? (arr as unknown[]).length : null;
      return files != null ? `${files} file(s)` : 'done';
    }
    case 'run_shell':
      return 'done';
    case 'ask_question':
      return 'answered';
    case 'task_complete':
      return 'complete';
    case 'apply_patch':
      return 'done';
    case 'create_memory':
      return 'done';
    case 'create_task':
      return 'done';
    case 'outline_file':
      return 'done';
    case 'find_symbol':
      return 'done';
    case 'find_references':
      return 'done';
    default:
      return 'done';
  }
}
