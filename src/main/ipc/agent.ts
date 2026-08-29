import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { listAgents, getAgent, deleteAgent, createAgent, updateAgent } from '../services/agents.js';

const agentSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1).max(100),
  role: z.string().min(1),
  systemPrompt: z.string().default(''),
  tools: z.string().nullable(),
  temperature: z.number().min(0).max(2).default(0.2),
  description: z.string(),
});

export const agentRouter = router({
  list: publicProcedure.query(() => listAgents()),

  get: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => getAgent(input.id)),

  create: publicProcedure.input(agentSchema).mutation(({ input }) => createAgent(input)),

  update: publicProcedure.input(agentSchema.partial()).mutation(({ input }) => {
    if (!input.id) return;
    updateAgent(input.id, input);
  }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteAgent(input.id)),
});
