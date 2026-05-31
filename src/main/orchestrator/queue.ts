import { runTask, cancelTask, isRunning } from './runner.js';
import { updateTask } from '../services/store.js';
import { emitTaskFinished } from './eventEmitter.js';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { logger } from '../services/logger.js';

const log = logger.child({ mod: 'queue' });

const DEFAULT_CONCURRENCY = 1;
const MAX_CONCURRENCY = 8;

const queue: string[] = [];
let running = false;

async function getConcurrency(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.QUEUE_CONCURRENCY);
  if (!raw) return DEFAULT_CONCURRENCY;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1) return DEFAULT_CONCURRENCY;
  return Math.min(n, MAX_CONCURRENCY);
}

export function enqueueTask(taskId: string): void {
  if (queue.includes(taskId) || isRunning(taskId)) return;
  queue.push(taskId);
  drain().catch((err) => log.error({ err }, 'queue drain failed'));
}

export function cancelQueuedOrRunning(taskId: string): boolean {
  const idx = queue.indexOf(taskId);
  if (idx >= 0) {
    queue.splice(idx, 1);
    emitTaskFinished(taskId, 'cancelled');
    return true;
  }
  return cancelTask(taskId);
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const concurrency = await getConcurrency();
      const batch = queue.splice(0, concurrency);
      await Promise.all(
        batch.map((id) =>
          runTask(id).catch((err) => {
            log.error({ taskId: id, err }, 'task crashed');
          }),
        ),
      );
    }
  } finally {
    running = false;
  }
}
