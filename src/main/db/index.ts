import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { dbPath } from '../util/paths.js';
import { logger } from '../services/logger.js';
import * as schema from './schema.js';

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _sqlite: Database.Database | null = null;

// Phase 1: bootstrap tables inline (idempotent). Switching to drizzle-kit
// generated migrations in a later phase.
const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL,
  managed INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  kanban_lane TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_ws ON sessions(workspace_id);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT,
  plan_json TEXT, result_json TEXT,
  iterations INTEGER NOT NULL DEFAULT 0,
  max_iterations INTEGER NOT NULL DEFAULT 6,
  model TEXT, agent_id TEXT, workflow_id TEXT,
  created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, idx INTEGER NOT NULL,
  agent TEXT NOT NULL, tool TEXT, input_json TEXT, output_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_steps_task ON steps(task_id);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, step_id TEXT,
  kind TEXT NOT NULL, payload_json TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL, decided_at INTEGER
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, path TEXT NOT NULL,
  description TEXT, enabled INTEGER NOT NULL DEFAULT 1,
  builtin INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
  model TEXT NOT NULL, system_prompt TEXT NOT NULL,
  tools TEXT, temperature REAL NOT NULL DEFAULT 0.2
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, cron TEXT NOT NULL,
  workspace_id TEXT NOT NULL, prompt TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER, next_run_at INTEGER
);
CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  session_id TEXT NOT NULL,
  task_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_task ON memories(task_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE TABLE IF NOT EXISTS worktrees (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  session_id TEXT,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  base_commit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_worktrees_ws ON worktrees(workspace_id);
CREATE INDEX IF NOT EXISTS idx_worktrees_session ON worktrees(session_id);
`;

export function initDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;
  const path = dbPath();
  _sqlite = new Database(path);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');
  _sqlite.exec(BOOTSTRAP_SQL);
  // Additive migration: add kanban_lane to sessions if missing
  try {
    _sqlite.exec(`ALTER TABLE sessions ADD COLUMN kanban_lane TEXT DEFAULT NULL`);
  } catch {
    // Column already exists — ignore
  }
  // Additive migration: add provider to tasks if missing
  try {
    _sqlite.exec(`ALTER TABLE tasks ADD COLUMN provider TEXT`);
  } catch {
    // Column already exists — ignore
  }
  // Additive migration: Phase A — agents v2 columns
  try { _sqlite.exec(`ALTER TABLE agents ADD COLUMN graph_mode TEXT NOT NULL DEFAULT 'full'`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE agents ADD COLUMN max_iterations INTEGER NOT NULL DEFAULT 10`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE agents ADD COLUMN description TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE agents ADD COLUMN provider TEXT NOT NULL DEFAULT 'ollama'`); } catch { /* exists */ }
  // Additive migration: Phase B — tasks v2 columns
  try { _sqlite.exec(`ALTER TABLE tasks ADD COLUMN model TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE tasks ADD COLUMN agent_id TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE tasks ADD COLUMN workflow_id TEXT`); } catch { /* exists */ }
  // Additive migration: Phase D — workflows table
  try {
    _sqlite.exec(`CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      graph_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  } catch { /* exists */ }
  // Additive migration: split graph_json → nodes + edges columns on workflows
  try { _sqlite.exec(`ALTER TABLE workflows ADD COLUMN nodes TEXT NOT NULL DEFAULT '[]'`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE workflows ADD COLUMN edges TEXT NOT NULL DEFAULT '[]'`); } catch { /* exists */ }
  try {
    // Backfill nodes/edges from graph_json for existing rows that still have the default '[]'
    _sqlite.exec(`
      UPDATE workflows
      SET
        nodes = COALESCE(json_extract(graph_json, '$.nodes'), '[]'),
        edges = COALESCE(json_extract(graph_json, '$.edges'), '[]')
      WHERE nodes = '[]' AND edges = '[]' AND graph_json != '{}'
    `);
  } catch { /* ignore — graph_json may already be gone */ }
  // Additive migration: rename model_override → model on tasks
  try { _sqlite.exec(`ALTER TABLE tasks RENAME COLUMN model_override TO model`); } catch { /* already renamed or doesn't exist */ }
  // Additive migration: rename tools_json → tools on agents + convert data from JSON to CSV
  try { _sqlite.exec(`ALTER TABLE agents RENAME COLUMN tools_json TO tools`); } catch { /* already renamed or doesn't exist */ }
  try {
    // Convert existing JSON arrays to CSV format: ["a","b"] → "a,b"
    const rows = _sqlite.prepare(`SELECT id, tools FROM agents WHERE tools IS NOT NULL AND tools LIKE '[%'`).all() as { id: string; tools: string }[];
    for (const row of rows) {
      try {
        const arr = JSON.parse(row.tools) as string[];
        const csv = arr.filter(Boolean).join(',');
        _sqlite.prepare(`UPDATE agents SET tools = ? WHERE id = ?`).run(csv, row.id);
      } catch { /* skip unparseable rows */ }
    }
  } catch { /* no rows to convert */ }
  // Cleanup: remove dead event types
  try { _sqlite.exec(`DELETE FROM task_events WHERE type IN ('task.iteration', 'task.retry', 'llm.call')`); } catch { /* ignore */ }
  // Additive migration: rename plan_json → plan on tasks
  try { _sqlite.exec(`ALTER TABLE tasks RENAME COLUMN plan_json TO plan`); } catch { /* already renamed or doesn't exist */ }
  try { _sqlite.exec(`ALTER TABLE tasks RENAME COLUMN result_json TO result`); } catch { /* ignore */ }
  // Additive migration: split step.started/step.finished → tool_call.started/tool_call.finished for tool events
  try {
    _sqlite.exec(`
      UPDATE task_events
      SET type = 'tool_call.started',
          payload_json = REPLACE(payload_json, '"type":"step.started"', '"type":"tool_call.started"')
      WHERE type = 'step.started'
        AND json_extract(payload_json, '$.tool') IS NOT NULL
    `);
    _sqlite.exec(`
      UPDATE task_events
      SET type = 'tool_call.finished',
          payload_json = REPLACE(payload_json, '"type":"step.finished"', '"type":"tool_call.finished"')
      WHERE type = 'step.finished'
        AND json_extract(payload_json, '$.tool') IS NOT NULL
    `);
  } catch { /* ignore */ }
  // Additive migration: add workspace_id to memories, make session_id nullable
  try { _sqlite.exec(`ALTER TABLE memories ADD COLUMN workspace_id TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id)`); } catch { /* exists */ }
  // Migrate data from workspace_memories into memories (if workspace_memories exists)
  try {
    _sqlite.exec(`
      INSERT INTO memories (type, content, workspace_id, created_at)
      SELECT type, content, workspace_id, created_at
      FROM workspace_memories
    `);
    _sqlite.exec(`DROP TABLE IF EXISTS workspace_memories`);
  } catch { /* table doesn't exist or already migrated */ }
  _db = drizzle(_sqlite, { schema });
  logger.info({ path }, 'db ready');
  return _db;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) throw new Error('db not initialized');
  return _db;
}

export function closeDb(): void {
  _sqlite?.close();
  _sqlite = null;
  _db = null;
}
