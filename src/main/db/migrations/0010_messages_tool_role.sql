-- Migration 0010: messages gains tool_call_id + tool_name
-- Date: 2026-08-29
--
-- Tool-result turns are now persisted as messages rows (role = 'tool'),
-- alongside the already-persisted user/assistant rows and the newly
-- persisted system-prompt row (role = 'system', no schema change needed
-- since role was always a plain TEXT column). tool_call_id/tool_name
-- correlate a tool-result row back to its originating tool call; both are
-- plain text columns (no FK — the tool_calls row's own id is not required
-- for this correlation, only the LLM-facing call id).

ALTER TABLE messages ADD COLUMN tool_call_id TEXT;
ALTER TABLE messages ADD COLUMN tool_name TEXT;
