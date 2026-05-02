import pino from 'pino';
import { existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { logsDir } from '../util/paths.js';

const MAX_MAIN_LOG_BYTES = 5 * 1024 * 1024;

function destinationPath(): string | number {
  try {
    const dir = logsDir();
    const file = join(dir, 'main.log');
    rotateIfNeeded(file);
    return file;
  } catch {
    return 1;
  }
}

function rotateIfNeeded(file: string): void {
  if (!existsSync(file)) return;
  const stat = statSync(file);
  if (stat.size < MAX_MAIN_LOG_BYTES) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  renameSync(file, `${file}.${stamp}`);
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  pino.destination({ dest: destinationPath(), sync: false, minLength: 4096 }),
);
