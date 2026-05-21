import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  listWorkflows,
  getWorkflow,
  upsertWorkflow,
  deleteWorkflow,
  validateWorkflowDefinition,
  type WorkflowDefinition,
} from '../services/workflows.js';

const workflowSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  graphJson: z.string().min(1),
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
    .input(z.object({ graphJson: z.string() }))
    .query(({ input }) => {
      try {
        const def = JSON.parse(input.graphJson) as WorkflowDefinition;
        return validateWorkflowDefinition(def);
      } catch {
        return { valid: false, errors: ['Invalid JSON'] };
      }
    }),
});
