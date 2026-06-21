import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  listWorkflows,
  getWorkflow,
  upsertWorkflow,
  deleteWorkflow,
  validateWorkflowDefinition,
} from '../services/workflows.js';

const nodeSchema = z.object({
  id: z.string(),
  type: z.enum(['start', 'end', 'agent', 'condition', 'approval']),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
});

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  label: z.string().optional(),
});

const workflowSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

export const workflowRouter = router({
  list: publicProcedure.query(() => listWorkflows()),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => getWorkflow(input.id)),

  upsert: publicProcedure
    .input(workflowSchema)
    .mutation(({ input }) => upsertWorkflow(input)),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      deleteWorkflow(input.id);
      return { ok: true as const };
    }),

  validate: publicProcedure
    .input(z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) }))
    .query(({ input }) => validateWorkflowDefinition(input)),
});
