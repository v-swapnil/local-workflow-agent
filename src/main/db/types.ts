import {
  agents,
  approvals,
  memories,
  messages,
  notes,
  schedules,
  sessions,
  settings,
  skills,
  taskEvents,
  tasks,
  toolCalls,
  workflows,
  workspaces,
  worktrees,
} from './schema';

export type WorkspaceRecord = typeof workspaces.$inferSelect;
export type SessionRecord = typeof sessions.$inferSelect;
export type MessageRecord = typeof messages.$inferSelect;
export type TaskRecord = typeof tasks.$inferSelect;
export type ToolCallRecord = typeof toolCalls.$inferSelect;
export type ApprovalRecord = typeof approvals.$inferSelect;
export type TaskEventRecord = typeof taskEvents.$inferSelect;
export type NoteRecord = typeof notes.$inferSelect;
export type MemoryRecord = typeof memories.$inferSelect;
export type ScheduleRecord = typeof schedules.$inferSelect;
export type SettingRecord = typeof settings.$inferSelect;
export type SkillRecord = typeof skills.$inferSelect;
export type AgentRecord = typeof agents.$inferSelect;
export type WorkflowRecord = typeof workflows.$inferSelect;
export type WorktreeRecord = typeof worktrees.$inferSelect;
