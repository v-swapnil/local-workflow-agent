import { taskRunner } from './runner.js';
import { emitTaskFinished } from './eventEmitter.js';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { logger } from '../services/logger.js';

const log = logger.child({ mod: 'queue' });

const DEFAULT_CONCURRENCY = 1;
const MAX_CONCURRENCY = 8;

async function getConcurrency(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.QUEUE_CONCURRENCY);
  if (!raw) return DEFAULT_CONCURRENCY;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1) return DEFAULT_CONCURRENCY;
  return Math.min(parsed, MAX_CONCURRENCY);
}

class TaskQueue {
  private pending: number[] = [];
  private isDraining = false;

  enqueue(taskId: number): void {
    if (this.pending.includes(taskId) || taskRunner.isRunning(taskId)) return;
    this.pending.push(taskId);
    this.drain().catch((err) => log.error({ err }, 'queue drain failed'));
  }

  cancel(taskId: number): boolean {
    const index = this.pending.indexOf(taskId);
    if (index >= 0) {
      this.pending.splice(index, 1);
      emitTaskFinished(taskId, 'cancelled');
      return true;
    }
    return taskRunner.cancel(taskId);
  }

  private async drain(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;
    try {
      while (this.pending.length > 0) {
        const concurrency = await getConcurrency();
        const batch = this.pending.splice(0, concurrency);
        await Promise.all(
          batch.map((taskId) =>
            taskRunner.run(taskId).catch((err) => {
              log.error({ taskId, err }, 'task crashed');
            }),
          ),
        );
      }
    } finally {
      this.isDraining = false;
    }
  }
}

export const taskQueue = new TaskQueue();
