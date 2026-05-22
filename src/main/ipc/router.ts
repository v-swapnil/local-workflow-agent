import { app } from 'electron';
import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { OLLAMA_URL, PROVIDERS } from '@shared/constants';
import type { AppHealth } from '@shared/types';
import { dbPath } from '../util/paths.js';
import { workspaceRouter, fileRouter } from './workspace.js';
import { llmRouter } from './llm.js';
import { toolRouter } from './tool.js';
import { sessionRouter, taskRouter } from './session.js';
import { approvalRouter } from './approval.js';
import { skillRouter } from './skill.js';
import { gitRouter } from './git.js';
import { getProvider } from '../services/llm/index.js';
import { settingsRouter } from './settings.js';
import { worktreeRouter } from './worktree.js';
import { agentRouter } from './agent.js';
import { workflowRouter } from './workflow.js';

async function checkOllama(): Promise<AppHealth['ollama']> {
  const provider = getProvider(PROVIDERS.OLLAMA);
  const ok = await provider.ping();
  if (!ok) return { ok: false, url: OLLAMA_URL };
  try {
    const models = await provider.listModels();
    return { ok: true, url: OLLAMA_URL, models: models.map((m) => m.name) };
  } catch {
    return { ok: true, url: OLLAMA_URL, models: [] };
  }
}

export const appRouter = router({
  ping: publicProcedure.input(z.string().optional()).query(({ input }) => ({
    pong: input ?? 'pong',
    at: Date.now(),
  })),
  health: publicProcedure.query(async (): Promise<AppHealth> => {
    return {
      app: { name: 'ASE', version: app.getVersion() },
      db: { ok: true, path: dbPath() },
      ollama: await checkOllama(),
    };
  }),
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
});

export type AppRouter = typeof appRouter;
