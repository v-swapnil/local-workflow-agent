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
  | {
      type: 'task.started';
      taskId: number;
      status: 'running';
      referenceId?: number | null; // agentId | workflowId
    }
  | {
      type: 'task.finished';
      taskId: number;
      status: TaskStatus;
      referenceId?: number | null; // agentId | workflowId
    }
  | {
      type: 'step.started';
      taskId: number;
      status: 'running';
      referenceId: number | null; // agentId
    }
  | {
      type: 'step.finished';
      taskId: number;
      status: TaskStatus;
      referenceId: number | null; // agentId
    }
  | {
      type: 'tool_call.started';
      taskId: number;
      status: 'pending';
      referenceId: number; // toolCallId
    }
  | {
      type: 'tool_call.finished';
      taskId: number;
      status: ToolResultStatus;
      referenceId: number; // toolCallId
    }
  | { type: 'log' | 'log.info' | 'log.error'; taskId: number; content: string }
  | { type: 'llm.prompt'; taskId: number; content: string }
  | { type: 'llm.delta'; taskId: number; content: string }
  | { type: 'llm.thinking_delta'; taskId: number; content: string }
  | {
      type: 'approval.requested';
      taskId: number;
      status: 'pending';
      referenceId: number; // approvalId
    }
  | {
      type: 'approval.decided';
      taskId: number;
      status: ApprovalStatus;
      referenceId: number; // approvalId
    }
  | { type: 'user_input.requested'; taskId: number; content: string }
  | { type: 'user_input.responded'; taskId: number; content: string };
