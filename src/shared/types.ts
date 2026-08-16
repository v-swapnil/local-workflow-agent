// Domain types shared across processes. Expanded in later phases.

import { ToolName } from './agent';
import { APPROVAL_DECISION, PROVIDERS } from './constants';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type ProviderId = (typeof PROVIDERS)[keyof typeof PROVIDERS];

export type KanbanLane = 'todo' | 'in_progress' | 'done' | 'need_help';

export interface KanbanCard {
  sessionId: string;
  title: string;
  workspaceId: string;
  lane: KanbanLane;
  manualLane: KanbanLane | null;
  taskSummary: {
    total: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    awaitingApproval: number;
    cancelled: number;
  };
  lastActivity: number;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

type ToolResultStatus = 'success' | 'error' | 'cancelled';

export interface ToolResultV2 {
  status: ToolResultStatus;
  truncated: boolean;
  content: string | Record<string, unknown>;
}

export interface ToolExecutionResult extends ToolResultV2 {
  toolCallId?: string | number;
  toolName: ToolName;
  arguments: Record<string, unknown>;
  content: string;
  duration: number;
}

export type ApprovalDecision = (typeof APPROVAL_DECISION)[keyof typeof APPROVAL_DECISION];

export interface FileNode {
  type: 'file' | 'directory';
  path: string; // workspace-relative, posix-style
  size?: number;
  children?: FileNode[];
}
