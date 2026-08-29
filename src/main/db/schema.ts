import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    title: text('title').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ wsIdx: index('idx_sessions_ws').on(t.workspaceId) }),
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    agentId: text('agent_id').references(() => agents.id),
    role: text('role').notNull(),
    content: text('content').notNull(),
    thinking: text('thinking'),
    toolCalls: text('tool_calls'),
    // Tool Results
    toolCallId: text('tool_call_id'),
    toolName: text('tool_name'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    tIdx: index('idx_messages_task').on(t.taskId),
  }),
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    agentId: text('agent_id').references(() => agents.id),
    workflowId: text('workflow_id').references(() => workflows.id),
    prompt: text('prompt').notNull(),
    result: text('result'),
    status: text('status').notNull().default('queued'),
    provider: text('provider'),
    model: text('model'),
    createdAt: integer('created_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => ({ sIdx: index('idx_tasks_session').on(t.sessionId) }),
);

export const toolCalls = sqliteTable(
  'tool_calls',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    messageId: text('message_id').references(() => messages.id),
    toolName: text('tool_name').notNull(),
    toolCallId: text('tool_call_id'),
    arguments: text('arguments'),
    result: text('result'),
    status: text('status').notNull().default('pending'),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => ({
    tIdx: index('idx_tool_calls_task').on(t.taskId),
    mIdx: index('idx_tool_calls_message').on(t.messageId),
  }),
);

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id),
  toolCallId: text('tool_call_id').references(() => toolCalls.id),
  toolName: text('tool_name').notNull(),
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
  updatedAt: integer('updated_at').notNull(),
});

export const worktrees = sqliteTable(
  'worktrees',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sessionId: text('session_id').references(() => sessions.id),
    branch: text('branch').notNull(),
    path: text('path').notNull(),
    baseBranch: text('base_branch').notNull(),
    baseCommit: text('base_commit').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    wsIdx: index('idx_worktrees_ws').on(t.workspaceId),
    sessIdx: index('idx_worktrees_session').on(t.sessionId),
  }),
);

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  role: text('role').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  tools: text('tools'),
  temperature: real('temperature').notNull().default(0.2),
});

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  nodes: text('nodes').notNull().default('[]'),
  edges: text('edges').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cron: text('cron').notNull(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  prompt: text('prompt').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at'),
  nextRunAt: integer('next_run_at'),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  tags: text('tags').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const taskEvents = sqliteTable(
  'task_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    type: text('type').notNull(),
    referenceId: text('reference_id'), // polymorphic FK: toolCalls.id | messages.id | approvals.id
    content: text('content'),
    status: text('status'),
    payloadJson: text('payload_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({ tIdx: index('idx_task_events_task').on(table.taskId) }),
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const memories = sqliteTable(
  'memories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    content: text('content').notNull(),
    sessionId: text('session_id').references(() => sessions.id),
    taskId: text('task_id').references(() => tasks.id),
    workspaceId: text('workspace_id').references(() => workspaces.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    sessionIdx: index('idx_memories_session').on(t.sessionId),
    taskIdx: index('idx_memories_task').on(t.taskId),
    typeIdx: index('idx_memories_type').on(t.type),
    wsIdx: index('idx_memories_workspace').on(t.workspaceId),
  }),
);
