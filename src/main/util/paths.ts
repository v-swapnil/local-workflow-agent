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

export function migrationsDir(): string {
  // Packaged: migrations are copied into the app's resources (see electron-builder.yml).
  // Dev: they live in source next to the schema.
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(app.getAppPath(), 'src/main/db/migrations');
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

export function worktreesRoot(): string {
  const dir = join(userDataDir(), 'worktrees');
  mkdirSync(dir, { recursive: true });
  return dir;
}
