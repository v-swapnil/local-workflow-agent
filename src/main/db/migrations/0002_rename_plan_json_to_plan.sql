-- Migration: Rename plan_json → plan on tasks table
-- Date: 2026-05-23

ALTER TABLE tasks RENAME COLUMN plan_json TO plan;
