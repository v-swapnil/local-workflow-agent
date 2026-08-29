import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  path: text('path').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workspaceId: integer('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
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
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    agentId: integer('agent_id').references(() => agents.id, { onDelete: 'set null' }),
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
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    agentId: integer('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    workflowId: integer('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
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
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    messageId: integer('message_id').references(() => messages.id, { onDelete: 'set null' }),
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

export const approvals = sqliteTable(
  'approvals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    toolCallId: integer('tool_call_id').references(() => toolCalls.id, { onDelete: 'set null' }),
    toolName: text('tool_name').notNull(),
    decision: text('decision').notNull().default('pending'),
    createdAt: integer('created_at').notNull(),
    decidedAt: integer('decided_at'),
  },
  (t) => ({
    taskIdx: index('idx_approvals_task').on(t.taskId),
    toolCallIdx: index('idx_approvals_tool_call').on(t.toolCallId),
  }),
);

export const userInputs = sqliteTable(
  'user_inputs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    toolCallId: integer('tool_call_id').references(() => toolCalls.id, { onDelete: 'set null' }),
    question: text('question').notNull(),
    description: text('description'),
    choices: text('choices'), // comma separated values
    decision: text('decision'),
    createdAt: integer('created_at').notNull(),
    decidedAt: integer('decided_at'),
  },
  (t) => ({ taskIdx: index('idx_approvals_task').on(t.taskId) }),
);

export const skills = sqliteTable('skills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  path: text('path').notNull(),
  description: text('description'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at').notNull(),
});

export const worktrees = sqliteTable(
  'worktrees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workspaceId: integer('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: integer('session_id').references(() => sessions.id, { onDelete: 'set null' }),
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
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  role: text('role').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  tools: text('tools'),
  temperature: real('temperature').notNull().default(0.2),
});

export const workflows = sqliteTable('workflows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  nodes: text('nodes').notNull().default('[]'),
  edges: text('edges').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const schedules = sqliteTable('schedules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  cron: text('cron').notNull(),
  workspaceId: integer('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at'),
  nextRunAt: integer('next_run_at'),
});

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    referenceId: integer('reference_id'), // polymorphic FK: toolCalls.id | messages.id | approvals.id
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
    sessionId: integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    workspaceId: integer('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    sessionIdx: index('idx_memories_session').on(t.sessionId),
    taskIdx: index('idx_memories_task').on(t.taskId),
    typeIdx: index('idx_memories_type').on(t.type),
    wsIdx: index('idx_memories_workspace').on(t.workspaceId),
  }),
);
