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
        payloadJson: JSON.stringify(event), // TODO: Remove this
        status: 'status' in event ? event.status : null,
        content: 'content' in event ? event.content : null,
        referenceId: event.referenceId,
        createdAt: event.timestamp,
      })
      .run();
  }

  listTaskEvents(taskId: number): TaskEventRecord[] {
    return getDb()
      .select()
      .from(taskEvents)
      .where(eq(taskEvents.taskId, taskId))
      .orderBy(asc(taskEvents.id))
      .all()
      .map((item) => ({ ...item, timestamp: item.createdAt }) as TaskEventRecord);
  }

  emit(event: TaskEventRecord): void {
    this.createEvent(event);

    this.bus.emit(String(event.taskId), event);
    this.bus.emit('*', event);
  }

  on(taskId: number, listener: (e: TaskEventRecord) => void): () => void {
    this.bus.on(String(taskId), listener);
    return () => this.bus.off(String(taskId), listener);
  }

  onAny(listener: (e: TaskEventRecord) => void): () => void {
    this.bus.on('*', listener);
    return () => this.bus.off('*', listener);
  }

  // TODO: drop this and use listTaskEvents instead
  /** Read all persisted events for a task from the database. */
  replayEvents(taskId: number): TaskEventRecord[] {
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
