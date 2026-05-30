import { EventEmitter } from 'node:events';
import { getDb } from '../db/index.js';
import { taskEvents } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import type { TaskEventRecord } from '@shared/schema.js';

class TaskBus {
  private bus = new EventEmitter();
  constructor() {
    this.bus.setMaxListeners(0);
  }

  emit(taskId: string, event: TaskEventRecord): void {
    // Persist to SQLite (fire-and-forget, sync via better-sqlite3)
    try {
      getDb()
        .insert(taskEvents)
        .values({
          taskId,
          type: event.type,
          payloadJson: JSON.stringify(event),
          createdAt: event.ts,
        })
        .run();
    } catch {
      // Persistence failure should never break the task pipeline
    }

    this.bus.emit(taskId, event);
    this.bus.emit('*', event);
  }

  on(taskId: string, listener: (e: TaskEventRecord) => void): () => void {
    this.bus.on(taskId, listener);
    return () => this.bus.off(taskId, listener);
  }

  onAny(listener: (e: TaskEventRecord) => void): () => void {
    this.bus.on('*', listener);
    return () => this.bus.off('*', listener);
  }

  /** Read all persisted events for a task from the database. */
  replayEvents(taskId: string): TaskEventRecord[] {
    try {
      const rows = getDb()
        .select({ payloadJson: taskEvents.payloadJson })
        .from(taskEvents)
        .where(eq(taskEvents.taskId, taskId))
        .orderBy(asc(taskEvents.id))
        .all();
      return rows.map((r) => JSON.parse(r.payloadJson) as TaskEventRecord);
    } catch {
      return [];
    }
  }
}

export const taskBus = new TaskBus();
