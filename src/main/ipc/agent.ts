import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { listAgents, getAgent, upsertAgent, deleteAgent } from '../services/agents.js';
import { getProvider } from '../services/llm/index.js';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';

const agentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  role: z.string().min(1),
  model: z.string().min(1),
  systemPrompt: z.string().min(1),
  toolsJson: z.string().nullable().optional(),
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
      toolsJson: input.toolsJson ?? null,
      graphMode: input.graphMode as 'full' | 'direct',
    }),
  ),

  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    deleteAgent(input.id);
    return { ok: true as const };
  }),

  test: publicProcedure
    .input(z.object({ id: z.string(), prompt: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const agent = getAgent(input.id);
      const primaryModel = await getSetting(SETTING_KEYS.PRIMARY_MODEL, '');
      const model = agent.model || primaryModel;
      if (!model) throw new Error('no model configured');
      const provider = getProvider((agent.provider as ProviderId) || PROVIDERS.OLLAMA);
      const chunks: string[] = [];
      await provider.chat({
        model,
        temperature: agent.temperature,
        messages: [
          { role: 'system', content: agent.systemPrompt },
          { role: 'user', content: input.prompt },
        ],
        onDelta: (d) => chunks.push(d),
      });
      return { response: chunks.join('') };
    }),
});
