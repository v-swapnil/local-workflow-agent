import { app } from 'electron';
import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { dbPath } from '../util/paths.js';
import { workspaceRouter, fileRouter } from './workspace.js';
import { llmRouter } from './llm.js';
import { toolRouter } from './tool.js';
import { sessionRouter, taskRouter } from './session.js';
import { approvalRouter } from './approval.js';
import { skillRouter } from './skill.js';
import { gitRouter } from './git.js';
import { settingsRouter } from './settings.js';
import { worktreeRouter } from './worktree.js';
import { agentRouter } from './agent.js';
import { workflowRouter } from './workflow.js';
import { kanbanRouter } from './kanban.js';

export const appRouter = router({
  ping: publicProcedure
    .input(z.string().optional())
    .query(({ input }) => ({ pong: input ?? 'pong', at: Date.now() })),
  health: publicProcedure.query(() => ({
    app: { name: 'ASE', version: app.getVersion() },
    db: { ok: true, path: dbPath() },
  })),
  workspace: workspaceRouter,
  llm: llmRouter,
  file: fileRouter,
  tool: toolRouter,
  session: sessionRouter,
  task: taskRouter,
  approval: approvalRouter,
  skill: skillRouter,
  git: gitRouter,
  settings: settingsRouter,
  worktree: worktreeRouter,
  agent: agentRouter,
  workflow: workflowRouter,
  kanban: kanbanRouter,
});

export type AppRouter = typeof appRouter;
