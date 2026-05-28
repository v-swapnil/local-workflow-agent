-- Migration 0003: Split step.started/step.finished into tool_call.started/tool_call.finished
--
-- Previously step.started/step.finished were used for both planner LLM steps and tool executions.
-- Now tool executions use tool_call.started/tool_call.finished.
-- Planner steps (where payload has no "tool" key) keep step.started/step.finished.

-- Step 1: Rename type column for tool-bearing step.started events
UPDATE task_events
SET type = 'tool_call.started',
    payload_json = REPLACE(payload_json, '"type":"step.started"', '"type":"tool_call.started"')
WHERE type = 'step.started'
  AND json_extract(payload_json, '$.tool') IS NOT NULL;

-- Step 2: Rename type column for tool-bearing step.finished events
UPDATE task_events
SET type = 'tool_call.finished',
    payload_json = REPLACE(payload_json, '"type":"step.finished"', '"type":"tool_call.finished"')
WHERE type = 'step.finished'
  AND json_extract(payload_json, '$.tool') IS NOT NULL;
