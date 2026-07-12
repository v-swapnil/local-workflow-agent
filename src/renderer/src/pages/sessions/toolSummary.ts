/** Human-readable summaries for tool calls and results shown in the event stream. */

function str(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function truncPath(p: string, maxLen = 40): string {
  if (p.length <= maxLen) return p;
  const parts = p.split('/');
  if (parts.length <= 2) return '...' + p.slice(-maxLen);
  return parts[0] + '/.../' + parts.slice(-2).join('/');
}

function truncStr(s: string, maxLen = 60): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '...';
}

/**
 * Produce a short human-readable label for a tool invocation.
 * Used by tool_call.started and approval.requested rows.
 */
export function summarizeToolCall(tool: string, args?: Record<string, unknown>): string {
  const a = args ?? {};

  switch (tool) {
    case 'read_file': {
      const p = truncPath(str(a.path));
      const offset = a.offset ? ` from L${a.offset}` : '';
      return `Reading ${p}${offset}`;
    }
    case 'write_file':
      return `Writing ${truncPath(str(a.path))}`;
    case 'edit_file': {
      const p = truncPath(str(a.path));
      const old = truncStr(str(a.oldString), 30);
      return a.oldString ? `Editing ${p} — replacing "${old}"` : `Appending to ${p}`;
    }
    case 'apply_patch':
      return 'Applying patch';
    case 'list_dir': {
      const p = a.path ? truncPath(str(a.path)) : '.';
      return `Listing ${p}`;
    }
    case 'grep': {
      const pat = truncStr(str(a.pattern), 30);
      const scope = a.path ? ` in ${truncPath(str(a.path))}` : '';
      const inc = a.include ? ` (${a.include})` : '';
      return `Searching /${pat}/${scope}${inc}`;
    }
    case 'glob': {
      const pat = truncStr(str(a.pattern), 40);
      return `Finding files ${pat}`;
    }
    case 'run_shell': {
      const cmd = str(a.command);
      const argv = Array.isArray(a.args) ? ' ' + (a.args as string[]).join(' ') : '';
      return `Running \`${truncStr(cmd + argv, 50)}\``;
    }
    case 'ask_question':
      return `Asking: ${truncStr(str(a.question), 50)}`;
    case 'create_memory':
      return `Adding ${a.type ?? 'memory'}`;
    case 'task_complete':
      return 'Marking task complete';
    default:
      return tool;
  }
}

/**
 * Produce a short human-readable label for a tool result.
 * Used by tool_call.finished rows.
 */
export function summarizeToolResult(
  tool: string,
  ok: boolean,
  output?: unknown,
  error?: string,
): string {
  if (!ok) return error ? truncStr(error, 120) : 'unknown error';

  // Best-effort extraction from output
  const o = output as Record<string, unknown> | undefined;
  if (!o) return 'done';

  switch (tool) {
    case 'read_file': {
      const lines = Array.isArray(o.lines) ? o.lines.length : null;
      return lines != null ? `${lines} lines` : 'done';
    }
    case 'write_file':
      return 'written';
    case 'edit_file':
      return typeof o.replacements === 'number' ? `${o.replacements} replacement(s)` : 'applied';
    case 'list_dir':
      return typeof o === 'string' ? truncStr(o, 60) : 'done';
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
    default:
      return 'done';
  }
}
