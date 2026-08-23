-- Migration 0005: Remove planner concept
-- Date: 2026-08-23
--
-- The dedicated planner agent/node was removed (see docs/IMPL_REMOVE_PLANNER.md).
-- Every custom agent is now a single autonomous executor, so the columns that
-- only existed to support planner+executor branching and the planner's
-- plan hand-off are no longer read or written anywhere in the app.
--
-- Agents:
--   1. Drop kind column (was: 'planner+executor' | 'executor' | 'planner')
--
-- Tasks:
--   1. Drop plan column (was: the planner's markdown output, never rendered)

ALTER TABLE agents DROP COLUMN kind;
ALTER TABLE tasks DROP COLUMN plan;
