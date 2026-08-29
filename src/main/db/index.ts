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
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, thinking TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT,
  plan_json TEXT, result_json TEXT,
  model TEXT, agent_id TEXT, workflow_id TEXT,
  created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, message_id TEXT,
  tool_name TEXT NOT NULL, arguments TEXT, result TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(message_id);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, tool_call_id TEXT,
  tool_name TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL, decided_at INTEGER
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, path TEXT NOT NULL,
  description TEXT, enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
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
  agent_id TEXT,
  tool_call_id TEXT,
  approval_id TEXT,
  message_id TEXT,
  status TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
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
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
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
  // Additive migration: Phase A — agents v2 columns (graph_mode removed, column kept for compat)
  try { _sqlite.exec(`ALTER TABLE agents ADD COLUMN graph_mode TEXT NOT NULL DEFAULT 'full'`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE agents ADD COLUMN description TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE agents ADD COLUMN provider TEXT NOT NULL DEFAULT 'ollama'`); } catch { /* exists */ }
  // Drop migration: remove unused agent columns (model, provider, graph_mode)
  try { _sqlite.exec(`ALTER TABLE agents DROP COLUMN graph_mode`); } catch { /* already dropped */ }
  try { _sqlite.exec(`ALTER TABLE agents DROP COLUMN model`); } catch { /* already dropped */ }
  try { _sqlite.exec(`ALTER TABLE agents DROP COLUMN provider`); } catch { /* already dropped */ }
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
      nodes TEXT NOT NULL DEFAULT '[]',
      edges TEXT NOT NULL DEFAULT '[]',
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
  // Remove NOT NULL constraint from legacy graph_json by giving it a default
  try { _sqlite.exec(`ALTER TABLE workflows RENAME COLUMN graph_json TO _graph_json_old`); } catch { /* already renamed or doesn't exist */ }
  // Drop the legacy column entirely (SQLite 3.35+)
  try { _sqlite.exec(`ALTER TABLE workflows DROP COLUMN _graph_json_old`); } catch { /* already dropped */ }
  try { _sqlite.exec(`ALTER TABLE workflows DROP COLUMN graph_json`); } catch { /* already dropped */ }
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
  // Additive migration: agent kind (planner+executor | executor | planner)
  try { _sqlite.exec(`ALTER TABLE agents ADD COLUMN kind TEXT NOT NULL DEFAULT 'planner+executor'`); } catch { /* exists */ }
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
  // Additive migration: approvals rename kind→tool, payload_json→arguments, add description
  try { _sqlite.exec(`ALTER TABLE approvals RENAME COLUMN kind TO tool`); } catch { /* already renamed */ }
  try { _sqlite.exec(`ALTER TABLE approvals RENAME COLUMN payload_json TO arguments`); } catch { /* already renamed */ }
  try { _sqlite.exec(`ALTER TABLE approvals ADD COLUMN description TEXT`); } catch { /* exists */ }
  // Additive migration: add task_id to messages
  try { _sqlite.exec(`ALTER TABLE messages ADD COLUMN task_id TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id)`); } catch { /* exists */ }
  // Additive migration: rename ts → created_at on messages
  try { _sqlite.exec(`ALTER TABLE messages RENAME COLUMN ts TO created_at`); } catch { /* already renamed or doesn't exist */ }
  // Additive migration: rename ts → created_at on task_events
  try { _sqlite.exec(`ALTER TABLE task_events RENAME COLUMN ts TO created_at`); } catch { /* already renamed or doesn't exist */ }
  try { _sqlite.exec(`ALTER TABLE tool_calls ADD COLUMN tool_call_id TEXT`); } catch { /* already renamed or doesn't exist */ }
  // Additive migration: create tool_calls table
  try {
    _sqlite.exec(`CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, step_id TEXT,
      tool TEXT NOT NULL, arguments TEXT, result TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER, finished_at INTEGER
    )`);
    _sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id)`);
    _sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tool_calls_step ON tool_calls(step_id)`);
  } catch { /* exists */ }
  // Additive migration: migrate tool rows from steps → tool_calls, restructure steps
  try {
    // Move tool rows to tool_calls if not already done
    const hasToolCol = _sqlite.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('steps') WHERE name = 'tool'`).get() as { c: number };
    if (hasToolCol.c > 0) {
      _sqlite.exec(`
        INSERT OR IGNORE INTO tool_calls (id, task_id, step_id, tool, arguments, result, status, started_at, finished_at)
        SELECT id, task_id, NULL, tool, input_json, output_json, status, started_at, finished_at
        FROM steps WHERE tool IS NOT NULL
      `);
      _sqlite.exec(`DELETE FROM steps WHERE tool IS NOT NULL`);
      // Recreate steps without tool/input_json, renaming output_json→result, adding prompt
      _sqlite.exec(`CREATE TABLE IF NOT EXISTS steps_new (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        agent TEXT NOT NULL, prompt TEXT, result TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at INTEGER, finished_at INTEGER
      )`);
      _sqlite.exec(`INSERT INTO steps_new (id, task_id, sequence, agent, prompt, result, status, started_at, finished_at)
        SELECT id, task_id, idx, agent, NULL, output_json, status, started_at, finished_at FROM steps`);
      _sqlite.exec(`DROP TABLE steps`);
      _sqlite.exec(`ALTER TABLE steps_new RENAME TO steps`);
      _sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_steps_task ON steps(task_id)`);
    }
  } catch { /* already migrated */ }
  // Additive migration: add prompt column to steps if missing (fresh DBs already have it)
  try { _sqlite.exec(`ALTER TABLE steps ADD COLUMN prompt TEXT`); } catch { /* exists */ }
  // Additive migration: rename output_json → result on steps if still present
  try { _sqlite.exec(`ALTER TABLE steps RENAME COLUMN output_json TO result`); } catch { /* already renamed */ }
  // Drop migration: remove notes collections concept (drop collection_id, index, table)
  try { _sqlite.exec(`DROP INDEX IF EXISTS idx_notes_collection`); } catch { /* ignore */ }
  try { _sqlite.exec(`ALTER TABLE notes DROP COLUMN collection_id`); } catch { /* already dropped */ }
  try { _sqlite.exec(`DROP TABLE IF EXISTS note_collections`); } catch { /* ignore */ }
  // Drop migration: remove planner concept (agents.kind) and unused plan channel (tasks.plan)
  try { _sqlite.exec(`ALTER TABLE agents DROP COLUMN kind`); } catch { /* already dropped */ }
  try { _sqlite.exec(`ALTER TABLE tasks DROP COLUMN plan`); } catch { /* already dropped */ }
  // Additive migration: messages become the durable conversation log — add thinking column
  try { _sqlite.exec(`ALTER TABLE messages ADD COLUMN thinking TEXT`); } catch { /* exists */ }
  // Drop migration: remove dead steps table (superseded by ephemeral step.* events only)
  try { _sqlite.exec(`DROP TABLE IF EXISTS steps`); } catch { /* already dropped */ }
  // Drop migration: remove unused skills.builtin column
  try { _sqlite.exec(`ALTER TABLE skills DROP COLUMN builtin`); } catch { /* already dropped */ }
  // Rename migration: tool_calls.tool → tool_name (clearer, mirrors approvals.tool_name)
  try { _sqlite.exec(`ALTER TABLE tool_calls RENAME COLUMN tool TO tool_name`); } catch { /* already renamed */ }
  // Rename migration: tool_calls.step_id → message_id (tool calls now link to the assistant
  // message that issued them, not the removed steps table)
  try { _sqlite.exec(`DROP INDEX IF EXISTS idx_tool_calls_step`); } catch { /* ignore */ }
  try { _sqlite.exec(`ALTER TABLE tool_calls RENAME COLUMN step_id TO message_id`); } catch { /* already renamed */ }
  try { _sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(message_id)`); } catch { /* exists */ }
  // Slim migration: approvals link to tool_calls via tool_call_id instead of duplicating
  // tool/arguments/description; step_id was always null
  try { _sqlite.exec(`ALTER TABLE approvals RENAME COLUMN tool TO tool_name`); } catch { /* already renamed */ }
  try { _sqlite.exec(`ALTER TABLE approvals ADD COLUMN tool_call_id TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE approvals DROP COLUMN step_id`); } catch { /* already dropped */ }
  try { _sqlite.exec(`ALTER TABLE approvals DROP COLUMN arguments`); } catch { /* already dropped */ }
  try { _sqlite.exec(`ALTER TABLE approvals DROP COLUMN description`); } catch { /* already dropped */ }
  // Additive migration: task_events gains typed foreign-key columns + status
  // (agent_id, tool_call_id, approval_id, message_id reference their owning rows;
  // status holds TaskStatus | ToolResultStatus | ApprovalStatus per event type)
  try { _sqlite.exec(`ALTER TABLE task_events ADD COLUMN agent_id TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE task_events ADD COLUMN tool_call_id TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE task_events ADD COLUMN approval_id TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE task_events ADD COLUMN message_id TEXT`); } catch { /* exists */ }
  try { _sqlite.exec(`ALTER TABLE task_events ADD COLUMN status TEXT`); } catch { /* exists */ }
  // Migration: messages now hang off tasks (sessions → tasks → messages).
  // Backfill task_id from the owning task, then rebuild the table to make
  // task_id NOT NULL and drop the now-redundant session_id column.
  try {
    const hasSessionId = _sqlite.prepare(
      `SELECT COUNT(*) as c FROM pragma_table_info('messages') WHERE name = 'session_id'`,
    ).get() as { c: number };
    if (hasSessionId.c > 0) {
      // Link each task-less message to the task with a matching prompt in the
      // same session, choosing the closest one in time when several match.
      // (Correlated refs live in WHERE, not ORDER BY — SQLite rejects outer
      // column references inside a subquery's ORDER BY.)
      _sqlite.exec(`
        UPDATE messages
        SET task_id = (
          SELECT t.id FROM tasks t
          WHERE t.session_id = messages.session_id AND t.prompt = messages.content
            AND NOT EXISTS (
              SELECT 1 FROM tasks t2
              WHERE t2.session_id = messages.session_id AND t2.prompt = messages.content
                AND ( ABS(t2.created_at - messages.created_at) < ABS(t.created_at - messages.created_at)
                   OR (ABS(t2.created_at - messages.created_at) = ABS(t.created_at - messages.created_at) AND t2.id < t.id) )
            )
          LIMIT 1
        )
        WHERE task_id IS NULL
      `);
      // Drop any message that still has no owning task (nothing to attach to)
      _sqlite.exec(`DELETE FROM messages WHERE task_id IS NULL`);
      // Rebuild: task_id NOT NULL, session_id removed
      _sqlite.exec(`CREATE TABLE messages_new (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        thinking TEXT,
        created_at INTEGER NOT NULL
      )`);
      _sqlite.exec(`INSERT INTO messages_new (id, task_id, role, content, thinking, created_at)
        SELECT id, task_id, role, content, thinking, created_at FROM messages`);
      _sqlite.exec(`DROP TABLE messages`);
      _sqlite.exec(`ALTER TABLE messages_new RENAME TO messages`);
      _sqlite.exec(`DROP INDEX IF EXISTS idx_messages_session`);
      _sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id)`);
    }
  } catch { /* already migrated */ }
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
