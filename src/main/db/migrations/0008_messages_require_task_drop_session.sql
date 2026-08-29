-- Migration 0008: messages hang off tasks (sessions → tasks → messages)
-- Date: 2026-08-23
--
-- Every message is now produced within a task, so task_id becomes required and
-- session_id (derivable via the message's task) is dropped. The old data model
-- allowed task-less messages (e.g. early user prompts stored before the task
-- linkage existed); those are backfilled to their originating task first.
--
-- Backfill: attach each task-less message to the task whose prompt matches the
-- message content in the same session, picking the closest one in time when a
-- session has several tasks with an identical prompt. The nearest-in-time pick
-- uses a NOT EXISTS anti-join rather than ORDER BY, because SQLite rejects outer
-- column references inside a subquery's ORDER BY clause.

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
WHERE task_id IS NULL;

-- Any message still without an owning task cannot be attributed — remove it.
DELETE FROM messages WHERE task_id IS NULL;

-- Rebuild the table: task_id NOT NULL, session_id removed.
-- (SQLite cannot tighten a column to NOT NULL or drop it in place with a single
-- ALTER, so the standard create/copy/drop/rename dance is used.)
CREATE TABLE messages_new (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  thinking TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO messages_new (id, task_id, role, content, thinking, created_at)
  SELECT id, task_id, role, content, thinking, created_at FROM messages;
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;
DROP INDEX IF EXISTS idx_messages_session;
CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id);
