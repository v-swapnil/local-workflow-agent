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
  UserInputRecord,
} from '@main/db/types';
export type { SkillDetails } from '@main/services/skills/types';

export type TaskEventRecord =
  | {
      timestamp: number;
      type: 'task.started';
      taskId: number;
      status: 'running';
      referenceId?: number | null; // agentId | workflowId
    }
  | {
      timestamp: number;
      type: 'task.finished';
      taskId: number;
      status: TaskStatus;
      referenceId?: number | null; // agentId | workflowId
    }
  | {
      timestamp: number;
      type: 'step.started';
      taskId: number;
      status: 'running';
      referenceId: number | null; // agentId
    }
  | {
      timestamp: number;
      type: 'step.finished';
      taskId: number;
      status: TaskStatus;
      referenceId: number | null; // agentId
    }
  | {
      timestamp: number;
      type: 'tool_call.started';
      taskId: number;
      status: 'pending';
      referenceId: number; // toolCallId
      content: string;
    }
  | {
      timestamp: number;
      type: 'tool_call.finished';
      taskId: number;
      status: ToolResultStatus;
      referenceId: number; // toolCallId
      content: string;
    }
  | {
      timestamp: number;
      type: 'log' | 'log.info' | 'log.error';
      taskId: number;
      content: string;
      referenceId: null;
    }
  | {
      timestamp: number;
      type: 'llm.prompt';
      taskId: number;
      content: string;
      referenceId: null;
    }
  | {
      timestamp: number;
      type: 'llm.delta';
      taskId: number;
      content: string;
      referenceId: null;
    }
  | {
      timestamp: number;
      type: 'llm.thinking_delta';
      taskId: number;
      content: string;
      referenceId: null;
    }
  | {
      timestamp: number;
      type: 'approval.requested';
      taskId: number;
      status: 'pending';
      referenceId: number; // approvalId
    }
  | {
      timestamp: number;
      type: 'approval.decided';
      taskId: number;
      status: ApprovalStatus;
      referenceId: number; // approvalId
    }
  | {
      timestamp: number;
      type: 'user_input.requested';
      taskId: number;
      content: string;
      referenceId: number; // userInputId
    }
  | {
      timestamp: number;
      type: 'user_input.responded';
      taskId: number;
      content: string;
      referenceId: number; // userInputId
    };
