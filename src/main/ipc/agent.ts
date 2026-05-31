import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { listAgents, getAgent, upsertAgent, deleteAgent } from '../services/agents.js';
import { PROVIDERS } from '@shared/constants';

const agentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  role: z.string().min(1),
  model: z.string().min(1),
  systemPrompt: z.string().min(1),
  tools: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2),
  graphMode: z.enum(['full', 'direct']),
  maxIterations: z.number().int().min(1).max(50).optional(),
  description: z.string().optional(),
  provider: z.enum([PROVIDERS.OLLAMA, PROVIDERS.COPILOT]).optional(),
});

export const agentRouter = router({
  list: publicProcedure.query(() => listAgents()),

  get: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) => getAgent(input.id)),

  upsert: publicProcedure.input(agentSchema).mutation(({ input }) =>
    upsertAgent({
      ...input,
      tools: input.tools ?? null,
      graphMode: input.graphMode as 'full' | 'direct',
    }),
  ),

  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    deleteAgent(input.id);
    return { ok: true as const };
  }),
});
