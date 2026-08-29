-- Migration 0011: messages gains agent_id + tool_calls
-- Date: 2026-08-29
--
-- agent_id tracks which agent produced a given message (null = no agent /
-- default executor). tool_calls stores the JSON-serialized ToolCall[] for
-- assistant messages that returned native tool calls, mirroring the shape
-- already carried in-memory by Conversation.addAssistantMessage() so a
-- persisted row can fully reconstruct that ChatMessage.

ALTER TABLE messages ADD COLUMN agent_id TEXT;
ALTER TABLE messages ADD COLUMN tool_calls TEXT;
