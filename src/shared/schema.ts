import { ToolName } from './agent';

export interface WorkspaceRecord {
  id: string;
  name: string;
  path: string;
  managed: boolean;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  kanbanLane: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  taskId?: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

export interface TaskRecord {
  id: string;
  sessionId: string;
  prompt: string;
  status: string;
  provider: string | null;
  plan: string | null;
  result: string | null;
  model: string | null;
  agentId: string | null;
  workflowId: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface StepRecord {
  id: string;
  taskId: string;
  sequence: number;
  agent: string;
  prompt: string | null;
  result: string | null;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface ToolCallRecord {
  id: string;
  taskId: string;
  stepId: string | null;
  tool: string;
  toolCallId?: string;
  arguments: string | null;
  result: string | null;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface WorktreeRecord {
  id: string;
  workspaceId: string;
  sessionId: string | null;
  branch: string;
  path: string;
  baseBranch: string;
  baseCommit: string;
  status: string;
  createdAt: number;
}

export interface ApprovalRequestRecord {
  id: string;
  taskId: string;
  tool: ToolName;
  args: unknown;
  /** Unified diff preview for write_file / edit_file operations. */
  diff?: string;
  createdAt: number;
}

export interface SkillRecord {
  id: string;
  name: string;
  path: string; // absolute path to the skill folder
  description: string;
  whenToUse: string;
  tags: string[];
  body: string; // markdown body (without frontmatter)
  enabled: boolean;
  builtin: boolean;
  updatedAt: number;
}

export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  tools: string | null;
  temperature: number;
  description: string | null;
}

export type TaskEventRecord =
  | { type: 'task.started'; taskId: string; ts: number }
  | {
      type: 'task.finished';
      taskId: string;
      ts: number;
      status: 'succeeded' | 'failed' | 'cancelled';
      result?: unknown;
      error?: string;
    }
  | {
      type: 'step.started';
      taskId: string;
      ts: number;
      stepId: string;
      agent: string;
    }
  | {
      type: 'step.finished';
      taskId: string;
      ts: number;
      stepId: string;
      ok: boolean;
      output?: unknown;
      error?: string;
    }
  | {
      type: 'tool_call.started';
      taskId: string;
      ts: number;
      stepId: string;
      agent: string;
      tool: string;
      input?: unknown;
    }
  | {
      type: 'tool_call.finished';
      taskId: string;
      ts: number;
      stepId: string;
      ok: boolean;
      tool: string;
      output?: unknown;
      error?: string;
    }
  | {
      type: 'log';
      taskId: string;
      ts: number;
      stream: 'stdout' | 'stderr';
      text: string;
      stepId?: string;
    }
  | { type: 'llm.delta'; taskId: string; ts: number; agent: string; content: string }
  | { type: 'llm.thinking_delta'; taskId: string; ts: number; agent: string; content: string }
  | {
      type: 'approval.requested';
      taskId: string;
      ts: number;
      approvalId: string;
      tool: string;
      args: Record<string, unknown>;
    }
  | {
      type: 'approval.decided';
      taskId: string;
      ts: number;
      approvalId: string;
      decision: 'approve' | 'approve_session' | 'deny';
    }
  | {
      type: 'user_input.requested';
      taskId: string;
      ts: number;
      requestId: string;
      question: string;
      description?: string;
      choices?: string[];
      allowMultiple?: boolean;
    }
  | {
      type: 'user_input.responded';
      taskId: string;
      ts: number;
      requestId: string;
      answer: string;
    };
