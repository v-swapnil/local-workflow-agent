import { ToolName } from './agent';
import { ApprovalStatus, TaskStatus, ToolResultStatus } from './types';

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
  taskId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string | null;
  createdAt: number;
}

export interface TaskRecord {
  id: string;
  sessionId: string;
  prompt: string;
  status: string;
  provider: string | null;
  result: string | null;
  model: string | null;
  agentId: string | null;
  workflowId: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface ToolCallRecord {
  id: string;
  taskId: string;
  messageId: string | null;
  toolName: string;
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
  toolCallId?: string;
  createdAt: number;
}

export interface SkillRecord {
  id: string;
  name: string;
  path: string; // absolute path to the skill folder
  description: string;
  whenToUse: string;
  allowedTools: string[];
  body: string; // markdown body (without frontmatter)
  enabled: boolean;
  source: 'user' | 'workspace'; // where the skill was discovered
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
  | { type: 'task.started'; taskId: string; status: 'running' }
  | { type: 'task.finished'; taskId: string; status: TaskStatus }
  | { type: 'step.started'; taskId: string; agentId: string; status: 'running' }
  | { type: 'step.finished'; taskId: string; agentId: string; status: TaskStatus }
  | { type: 'tool_call.started'; taskId: string; toolCallId: string; status: 'pending' }
  | { type: 'tool_call.finished'; taskId: string; toolCallId: string; status: ToolResultStatus }
  | { type: 'log' | 'log.info' | 'log.error'; taskId: string; content: string }
  | { type: 'llm.prompt'; taskId: string; messageId: string; content: string }
  | { type: 'llm.delta'; taskId: string; content: string }
  | { type: 'llm.thinking_delta'; taskId: string; content: string }
  | { type: 'approval.requested'; taskId: string; approvalId: string; status: 'pending' }
  | { type: 'approval.decided'; taskId: string; approvalId: string; status: ApprovalStatus }
  | { type: 'user_input.requested'; taskId: string; content: string }
  | { type: 'user_input.responded'; taskId: string; content: string };
