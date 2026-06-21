import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { settings } from '../db/schema.js';

export async function getSetting(key: string): Promise<string | undefined>;
export async function getSetting<D extends string>(key: string, defaultValue: D): Promise<string>;
export async function getSetting(key: string, defaultValue?: string): Promise<string | undefined> {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    db.update(settings).set({ value }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value }).run();
  }
}

export async function deleteSetting(key: string): Promise<void> {
  getDb().delete(settings).where(eq(settings.key, key)).run();
}

export const SETTING_KEYS = {
  ACTIVE_WORKSPACE: 'activeWorkspaceId',
  ACTIVE_PROVIDER: 'activeProvider',
  PRIMARY_MODEL: 'primaryModel',
  SECONDARY_MODEL: 'secondaryModel',
  OLLAMA_URL: 'ollamaUrl',
  COPILOT_CLI_URL: 'copilotCliUrl',
  GIT_AUTO_BRANCH: 'gitAutoBranch',
  UI_THEME: 'uiTheme',
  QUEUE_CONCURRENCY: 'queueConcurrency',
  UI_TEXT_SIZE: 'uiTextSize',
  KANBAN_AUTO_CLEAR: 'kanban.autoClearOverride',
  KANBAN_DEFAULT_VIEW: 'kanban.defaultView',
  USE_WORKTREES: 'use_worktrees',
  SHELL_PATH: 'shell.path',
  LINEAR_API_KEY: 'linear.apiKey',
  TASK_TIMEOUT: 'task.timeout',
} as const;
