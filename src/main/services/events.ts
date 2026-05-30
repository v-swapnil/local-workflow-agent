import { EventEmitter } from 'node:events';
import { getDb } from '../db/index.js';
import { taskEvents } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';

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

class TaskBus {
  private bus = new EventEmitter();
  constructor() {
    this.bus.setMaxListeners(0);
  }

  emit(taskId: string, event: TaskEvent): void {
    // Persist to SQLite (fire-and-forget, sync via better-sqlite3)
    try {
      getDb()
        .insert(taskEvents)
        .values({
          taskId,
          type: event.type,
          payloadJson: JSON.stringify(event),
          ts: event.ts,
        })
        .run();
    } catch {
      // Persistence failure should never break the task pipeline
    }

    this.bus.emit(taskId, event);
    this.bus.emit('*', event);
  }

  on(taskId: string, listener: (e: TaskEvent) => void): () => void {
    this.bus.on(taskId, listener);
    return () => this.bus.off(taskId, listener);
  }

  onAny(listener: (e: TaskEvent) => void): () => void {
    this.bus.on('*', listener);
    return () => this.bus.off('*', listener);
  }

  /** Read all persisted events for a task from the database. */
  replayEvents(taskId: string): TaskEvent[] {
    try {
      const rows = getDb()
        .select({ payloadJson: taskEvents.payloadJson })
        .from(taskEvents)
        .where(eq(taskEvents.taskId, taskId))
        .orderBy(asc(taskEvents.id))
        .all();
      return rows.map((r) => JSON.parse(r.payloadJson) as TaskEvent);
    } catch {
      return [];
    }
  }
}

export const taskBus = new TaskBus();
