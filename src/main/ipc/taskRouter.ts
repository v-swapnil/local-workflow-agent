import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { router, publicProcedure } from './trpc.js';
import { addMessage, listSteps } from '../services/store.js';
import { enqueueTask, cancelQueuedOrRunning } from '../orchestrator/queue.js';
import { taskBus } from '../services/events.js';
import type { TaskEventRecord } from '@shared/schema.js';
import { createTask, getTask, listTasks, updateTask } from '@main/services/workspaces';

export const taskRouter = router({
  create: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        prompt: z.string().min(1),
        maxIterations: z.number().int().min(1).max(20).optional(),
        autostart: z.boolean().optional(),
        model: z.string().optional(),
        agentId: z.string().optional(),
        workflowId: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      const task = createTask(input.sessionId, input.prompt, input.maxIterations, {
        model: input.model,
        agentId: input.agentId,
        workflowId: input.workflowId,
      });
      addMessage(input.sessionId, 'user', input.prompt, task.id);
      if (input.autostart !== false) enqueueTask(task.id);
      return task;
    }),

  get: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => getTask(input.id)),

  list: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(({ input }) => listTasks(input.sessionId)),

  steps: publicProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .query(({ input }) => listSteps(input.taskId)),

  start: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    enqueueTask(input.id);
    return { ok: true as const };
  }),

  cancel: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => ({ ok: cancelQueuedOrRunning(input.id) })),

  retry: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    const orig = getTask(input.id);
    // Reset the same task and re-enqueue instead of creating a new one
    updateTask(orig.id, {
      status: 'queued',
      result: null,
      iterations: 0,
      startedAt: null,
      finishedAt: null,
    });
    enqueueTask(orig.id);
    return orig;
  }),

  events: publicProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .subscription(({ input }) => {
      return observable<TaskEventRecord>((emit) => {
        // Replay persisted events so late subscribers see full history
        const past = taskBus.replayEvents(input.taskId);
        for (const e of past) emit.next(e);

        // Then attach live listener for new events
        const off = taskBus.on(input.taskId, (e) => emit.next(e));
        return () => off();
      });
    }),
});
