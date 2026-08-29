import { ApprovalStatus, TaskStatus, ToolResultStatus } from './types';

export type {
  WorkspaceRecord,
  SessionRecord,
  MessageRecord,
  TaskRecord,
  ToolCallRecord,
  ApprovalRecord,
  NoteRecord,
  MemoryRecord,
  ScheduleRecord,
  SettingRecord,
  SkillRecord,
  AgentRecord,
  WorkflowRecord,
  WorktreeRecord,
} from '@main/db/types';

export type TaskEventRecord =
  | { type: 'task.started'; taskId: number; status: 'running' }
  | { type: 'task.finished'; taskId: number; status: TaskStatus }
  | { type: 'step.started'; taskId: number; agentId: string; status: 'running' }
  | { type: 'step.finished'; taskId: number; agentId: string; status: TaskStatus }
  | { type: 'tool_call.started'; taskId: number; toolCallId: string; status: 'pending' }
  | { type: 'tool_call.finished'; taskId: number; toolCallId: string; status: ToolResultStatus }
  | { type: 'log' | 'log.info' | 'log.error'; taskId: number; content: string }
  | { type: 'llm.prompt'; taskId: number; messageId: string; content: string }
  | { type: 'llm.delta'; taskId: number; content: string }
  | { type: 'llm.thinking_delta'; taskId: number; content: string }
  | { type: 'approval.requested'; taskId: number; approvalId: string; status: 'pending' }
  | { type: 'approval.decided'; taskId: number; approvalId: string; status: ApprovalStatus }
  | { type: 'user_input.requested'; taskId: number; content: string }
  | { type: 'user_input.responded'; taskId: number; content: string };
