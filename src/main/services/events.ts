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

  createEvent(event: TaskEventRecord) {
    return getDb()
      .insert(taskEvents)
      .values({
        taskId: event.taskId,
        type: event.type,
        payloadJson: JSON.stringify(event),
        createdAt: Date.now(),
      })
      .run();
  }

  listTaskEvents(taskId: string): TaskEventRecord[] {
    // @ts-expect-error - Fix this
    return getDb()
      .select()
      .from(taskEvents)
      .where(eq(taskEvents.taskId, taskId))
      .orderBy(asc(taskEvents.id))
      .all();
  }

  emit(event: TaskEventRecord): void {
    this.createEvent(event);

    this.bus.emit(event.taskId, event);
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
