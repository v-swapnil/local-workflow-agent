import { ToolName } from '@shared/agent';
import { ToolResultV2 } from '@shared/types';

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
export function summarizeToolResult(toolName: ToolName): string {
  switch (toolName) {
    case 'read_file':
      return 'Read';
    case 'write_file':
      return 'written';
    case 'edit_file':
      return 'Edited';
    case 'list_dir':
      return 'Done';
    case 'grep':
      return 'Done';
    case 'glob':
      return 'Done';
    case 'run_shell':
      return 'Done';
    case 'ask_question':
      return 'Answered';
    case 'task_complete':
      return 'Complete';
    case 'apply_patch':
      return 'Done';
    case 'create_memory':
      return 'Done';
    case 'create_task':
      return 'Done';
    case 'outline_file':
      return 'Done';
    case 'find_symbol':
      return 'Done';
    case 'find_references':
      return 'Done';
    default:
      return 'Done';
  }
}
