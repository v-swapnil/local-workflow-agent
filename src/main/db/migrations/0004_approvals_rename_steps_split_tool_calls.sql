-- Migration 0004: Approvals rename + Steps/ToolCalls split
-- Date: 2026-05-30
--
-- Approvals:
--   1. Rename kind → tool
--   2. Rename payload_json → arguments
--   3. Add description column
--
-- Steps:
--   1. Remove tool, input_json columns (now in tool_calls)
--   2. Rename output_json → result
--   3. Add prompt column
--
-- New table: tool_calls (extracted from steps)

-- === Approvals ===

ALTER TABLE approvals RENAME COLUMN kind TO tool;
ALTER TABLE approvals RENAME COLUMN payload_json TO arguments;
ALTER TABLE approvals ADD COLUMN description TEXT;

-- === Steps ===

-- SQLite doesn't support DROP COLUMN before 3.35.0, so we recreate the table.
-- Preserve data: tool/input_json rows become tool_calls, remaining fields stay in steps.

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_id TEXT,
  tool TEXT NOT NULL,
  arguments TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_step ON tool_calls(step_id);

-- Migrate existing tool rows from steps → tool_calls
INSERT INTO tool_calls (id, task_id, step_id, tool, arguments, result, status, started_at, finished_at)
SELECT id, task_id, NULL, tool, input_json, output_json, status, started_at, finished_at
FROM steps
WHERE tool IS NOT NULL;

-- Remove tool rows from steps (they now live in tool_calls)
DELETE FROM steps WHERE tool IS NOT NULL;

-- Recreate steps without tool/input_json, renaming output_json → result, adding prompt
CREATE TABLE steps_new (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  agent TEXT NOT NULL,
  prompt TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER,
  finished_at INTEGER
);

INSERT INTO steps_new (id, task_id, sequence, agent, prompt, result, status, started_at, finished_at)
SELECT id, task_id, idx, agent, NULL, output_json, status, started_at, finished_at
FROM steps;

DROP TABLE steps;
ALTER TABLE steps_new RENAME TO steps;
CREATE INDEX IF NOT EXISTS idx_steps_task ON steps(task_id);
