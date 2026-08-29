-- Migration 0009: task_events reference_id + content, drop typed FK columns
-- Date: 2026-08-29
--
-- The four typed foreign-key columns added in 0007 (agent_id, tool_call_id,
-- approval_id, message_id) are collapsed into a single polymorphic
-- reference_id column that points at whichever entity (tool_calls, messages,
-- or approvals) the event relates to. A content column is added for freeform
-- event text.
--
-- SQLite cannot add REFERENCES constraints to an existing table via ALTER
-- TABLE, so reference_id is untyped at the DB layer (no FK declared in
-- src/main/db/schema.ts either, since it's polymorphic).

ALTER TABLE task_events ADD COLUMN reference_id TEXT;
ALTER TABLE task_events ADD COLUMN content TEXT;
ALTER TABLE task_events DROP COLUMN agent_id;
ALTER TABLE task_events DROP COLUMN tool_call_id;
ALTER TABLE task_events DROP COLUMN approval_id;
ALTER TABLE task_events DROP COLUMN message_id;
