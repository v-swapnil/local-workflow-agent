export type TaskEvent =
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
      type: 'plan';
      taskId: string;
      ts: number;
      plan: string;
    }
  | {
      type: 'step.started';
      taskId: string;
      ts: number;
      stepId: string;
      agent: string;
      tool?: string;
      input?: unknown;
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
      args: unknown;
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
      context?: string;
      choices?: string[];
    }
  | {
      type: 'user_input.responded';
      taskId: string;
      ts: number;
      requestId: string;
      answer: string;
    };

export interface ApprovalReq {
  id: string;
  tool: string;
  args: unknown;
  ts: number;
}

export interface UserInputReq {
  id: string;
  question: string;
  context?: string;
  choices?: string[];
  ts: number;
}
