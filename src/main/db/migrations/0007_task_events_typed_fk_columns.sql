-- Migration 0007: task_events typed foreign-key columns + status
-- Date: 2026-08-23
--
-- task_events previously carried only task_id plus an opaque payload_json blob.
-- To make events queryable and relationally consistent, we promote the entities
-- an event refers to into first-class foreign-key columns and add a status field.
--
-- New columns (all nullable — a given event only populates the ones it relates to):
--   agent_id      → references agents.id      (null = system-originated event)
--   tool_call_id  → references tool_calls.id  (tool_call.* and user_input.* events)
--   approval_id   → references approvals.id    (approval.* events)
--   message_id    → references messages.id     (llm.prompt events)
--   status        → TaskStatus | ToolResultStatus | ApprovalStatus per event type
--
-- SQLite cannot add REFERENCES constraints to an existing table via ALTER TABLE,
-- so the foreign keys are declared at the ORM layer (src/main/db/schema.ts) and
-- enforced on freshly created databases. Existing databases gain the columns only.

ALTER TABLE task_events ADD COLUMN agent_id TEXT;
ALTER TABLE task_events ADD COLUMN tool_call_id TEXT;
ALTER TABLE task_events ADD COLUMN approval_id TEXT;
ALTER TABLE task_events ADD COLUMN message_id TEXT;
ALTER TABLE task_events ADD COLUMN status TEXT;
