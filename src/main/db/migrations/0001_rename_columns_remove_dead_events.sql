-- Migration: Rename columns + remove dead event types
-- Date: 2026-05-23
--
-- Changes:
-- 1. Rename tasks.model_override → tasks.model
-- 2. Rename agents.tools_json → agents.tools (storage format: JSON array → CSV)
-- 3. Remove dead event types from task_events: task.iteration, task.retry, llm.call

-- Step 1: Rename model_override to model on tasks table
ALTER TABLE tasks RENAME COLUMN model_override TO model;

-- Step 2: Rename tools_json to tools on agents table
ALTER TABLE agents RENAME COLUMN tools_json TO tools;

-- Step 3: Convert existing JSON arrays in agents.tools to CSV format
-- e.g. ["read_file","write_file","grep"] → "read_file,write_file,grep"
-- NOTE: This must be done programmatically (see db/index.ts initDb)

-- Step 4: Delete dead event types from task_events (optional cleanup)
DELETE FROM task_events WHERE type IN ('task.iteration', 'task.retry', 'llm.call');
