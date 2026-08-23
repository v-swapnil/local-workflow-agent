-- Migration 0006: Message store + tool/approval re-linking
-- Date: 2026-08-23
-- See docs/IMPL_DB_SCHEMA_SIMPLIFICATION.md for the full analysis.

-- Messages: durable conversation log now includes assistant turns
ALTER TABLE messages ADD COLUMN thinking TEXT;

-- Steps: dead table (never read back; step.* events are ephemeral only now)
DROP TABLE IF EXISTS steps;

-- Skills: builtin column was never read anywhere
ALTER TABLE skills DROP COLUMN builtin;

-- Tool calls: rename tool → tool_name; step_id (always null) → message_id
ALTER TABLE tool_calls RENAME COLUMN tool TO tool_name;
DROP INDEX IF EXISTS idx_tool_calls_step;
ALTER TABLE tool_calls RENAME COLUMN step_id TO message_id;
CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(message_id);

-- Approvals: link to tool_calls via tool_call_id instead of duplicating tool/arguments/description
ALTER TABLE approvals RENAME COLUMN tool TO tool_name;
ALTER TABLE approvals ADD COLUMN tool_call_id TEXT;
ALTER TABLE approvals DROP COLUMN step_id;
ALTER TABLE approvals DROP COLUMN arguments;
ALTER TABLE approvals DROP COLUMN description;
