import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  managed: integer('managed', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('active'),
    kanbanLane: text('kanban_lane'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ wsIdx: index('idx_sessions_ws').on(t.workspaceId) }),
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    ts: integer('ts').notNull(),
  },
  (t) => ({ sIdx: index('idx_messages_session').on(t.sessionId) }),
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    prompt: text('prompt').notNull(),
    status: text('status').notNull().default('queued'),
    planJson: text('plan_json'),
    resultJson: text('result_json'),
    iterations: integer('iterations').notNull().default(0),
    maxIterations: integer('max_iterations').notNull().default(6),
    createdAt: integer('created_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => ({ sIdx: index('idx_tasks_session').on(t.sessionId) }),
);

export const steps = sqliteTable(
  'steps',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(),
    idx: integer('idx').notNull(),
    agent: text('agent').notNull(),
    tool: text('tool'),
    inputJson: text('input_json'),
    outputJson: text('output_json'),
    status: text('status').notNull().default('pending'),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => ({ tIdx: index('idx_steps_task').on(t.taskId) }),
);

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  stepId: text('step_id'),
  kind: text('kind').notNull(),
  payloadJson: text('payload_json').notNull(),
  decision: text('decision').notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
  decidedAt: integer('decided_at'),
});

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  path: text('path').notNull(),
  description: text('description'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull(),
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  role: text('role').notNull(),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  toolsJson: text('tools_json'),
  temperature: real('temperature').notNull().default(0.2),
});

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cron: text('cron').notNull(),
  workspaceId: text('workspace_id').notNull(),
  prompt: text('prompt').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at'),
  nextRunAt: integer('next_run_at'),
});

export const taskEvents = sqliteTable(
  'task_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: text('task_id').notNull(),
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull(),
    ts: integer('ts').notNull(),
  },
  (t) => ({ tIdx: index('idx_task_events_task').on(t.taskId) }),
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
