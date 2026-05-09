import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export function userDataDir(): string {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function dbPath(): string {
  return join(userDataDir(), 'ase.db');
}

export function workspacesRoot(): string {
  const dir = join(userDataDir(), 'workspaces');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function logsDir(): string {
  const dir = join(userDataDir(), 'logs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function reportsDir(): string {
  const dir = join(logsDir(), 'reports');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function worktreesRoot(): string {
  const dir = join(userDataDir(), 'worktrees');
  mkdirSync(dir, { recursive: true });
  return dir;
}
