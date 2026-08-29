import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { router, publicProcedure } from './trpc.js';
import { taskQueue } from '../orchestrator/queue.js';
import { taskBus } from '../services/events.js';
import { createTask, getTask, listTasks, updateTask } from '@main/services/workspaces';
import { type TaskEventRecord } from '@shared/schema.js';

export const taskRouter = router({
  create: publicProcedure
    .input(
      z.object({
        sessionId: z.number(),
        prompt: z.string().min(1),
        autostart: z.boolean().optional(),
        model: z.string().optional(),
        agentId: z.number().optional(),
        workflowId: z.number().optional(),
      }),
    )
    .mutation(({ input }) => {
      const task = createTask(input.sessionId, input.prompt, {
        model: input.model,
        agentId: input.agentId,
        workflowId: input.workflowId,
      });
      if (input.autostart !== false) taskQueue.enqueue(task.id);
      return task;
    }),

  get: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => getTask(input.id)),

  list: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(({ input }) => listTasks(input.sessionId)),

  start: publicProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    taskQueue.enqueue(input.id);
    return { ok: true as const };
  }),

  cancel: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => ({ ok: taskQueue.cancel(input.id) })),

  retry: publicProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    const orig = getTask(input.id);
    // Reset the same task and re-enqueue instead of creating a new one
    updateTask(orig.id, {
      status: 'queued',
      result: null,
      startedAt: null,
      finishedAt: null,
    });
    taskQueue.enqueue(orig.id);
    return orig;
  }),

  events: publicProcedure.input(z.object({ taskId: z.number() })).subscription(({ input }) => {
    return observable<TaskEventRecord>((emit) => {
      // Replay persisted events so late subscribers see full history
      const past = taskBus.replayEvents(input.taskId);
      for (const e of past) emit.next(e as TaskEventRecord);

      // Then attach live listener for new events
      const off = taskBus.on(input.taskId, (e) => emit.next(e as TaskEventRecord));
      return () => off();
    });
  }),
});
