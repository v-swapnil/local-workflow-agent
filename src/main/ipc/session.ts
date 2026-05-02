import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { shell } from 'electron';
import { router, publicProcedure } from './trpc.js';
import {
  createSession,
  listSessions,
  getSession,
  renameSession,
  deleteSession,
  addMessage,
  listMessages,
  createTask,
  getTask,
  listTasks,
  listSteps,
  updateTask,
  setSessionKanbanLane,
} from '../services/store.js';
import { enqueueTask, cancelQueuedOrRunning } from '../orchestrator/queue.js';
import { taskBus, type TaskEvent } from '../services/events.js';
import { exportTaskReport } from '../services/reports.js';
import { deriveKanbanLane, type KanbanCard, type KanbanLane, type TaskStatus } from '@shared/types';

const kanbanLaneSchema = z.enum(['todo', 'in_progress', 'done', 'need_help']);

export const sessionRouter = router({
  create: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1), title: z.string().min(1) }))
    .mutation(({ input }) => createSession(input.workspaceId, input.title)),

  list: publicProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(({ input }) => listSessions(input?.workspaceId)),

  get: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => getSession(input.id)),

  rename: publicProcedure
    .input(z.object({ id: z.string().min(1), title: z.string().min(1) }))
    .mutation(({ input }) => {
      renameSession(input.id, input.title);
      return { ok: true as const };
    }),

  delete: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    deleteSession(input.id);
    return { ok: true as const };
  }),

  addMessage: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    )
    .mutation(({ input }) => addMessage(input.sessionId, input.role, input.content)),

  messages: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(({ input }) => listMessages(input.sessionId)),

  kanban: publicProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(({ input }): KanbanCard[] => {
      const allSessions = listSessions(input?.workspaceId);
      return allSessions.map((s) => {
        const tasks = listTasks(s.id);
        const statuses = tasks.map((t) => t.status as TaskStatus);
        const autoLane = deriveKanbanLane(statuses);
        return {
          sessionId: s.id,
          title: s.title,
          workspaceId: s.workspaceId,
          lane: (s.kanbanLane as KanbanLane) ?? autoLane,
          manualLane: (s.kanbanLane as KanbanLane) ?? null,
          taskSummary: {
            total: tasks.length,
            queued: statuses.filter((st) => st === 'queued').length,
            running: statuses.filter((st) => st === 'running').length,
            succeeded: statuses.filter((st) => st === 'succeeded').length,
            failed: statuses.filter((st) => st === 'failed').length,
            awaitingApproval: statuses.filter((st) => st === 'awaiting_approval').length,
            cancelled: statuses.filter((st) => st === 'cancelled').length,
          },
          lastActivity: Math.max(
            s.updatedAt,
            ...tasks.map((t) => t.finishedAt ?? t.startedAt ?? t.createdAt),
          ),
          createdAt: s.createdAt,
        };
      });
    }),

  setLane: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        lane: kanbanLaneSchema.nullable(),
      }),
    )
    .mutation(({ input }) => {
      setSessionKanbanLane(input.sessionId, input.lane);
      return { ok: true as const };
    }),
});

export const taskRouter = router({
  create: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        prompt: z.string().min(1),
        maxIterations: z.number().int().min(1).max(20).optional(),
        autostart: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => {
      const task = createTask(input.sessionId, input.prompt, input.maxIterations);
      addMessage(input.sessionId, 'user', input.prompt);
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
      resultJson: null,
      iterations: 0,
      startedAt: null,
      finishedAt: null,
    });
    enqueueTask(orig.id);
    return orig;
  }),

  exportReport: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const out = await exportTaskReport(input.id);
      shell.showItemInFolder(out.markdownPath);
      return out;
    }),

  events: publicProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .subscription(({ input }) => {
      return observable<TaskEvent>((emit) => {
        // Replay persisted events so late subscribers see full history
        const past = taskBus.replayEvents(input.taskId);
        for (const e of past) emit.next(e);

        // Then attach live listener for new events
        const off = taskBus.on(input.taskId, (e) => emit.next(e));
        return () => off();
      });
    }),

  eventHistory: publicProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .query(({ input }) => taskBus.replayEvents(input.taskId)),

  fullHistory: publicProcedure.input(z.object({ taskId: z.string().min(1) })).query(({ input }) => {
    const task = getTask(input.taskId);
    const steps = listSteps(input.taskId);
    const events = taskBus.replayEvents(input.taskId);

    type HistoryEntry =
      | {
          kind: 'llm.call';
          ts: number;
          agent: string;
          model: string;
          messages: { role: string; content: string }[];
          response: string;
          durationMs: number;
        }
      | {
          kind: 'tool.call';
          ts: number;
          stepId: string;
          agent: string;
          tool: string;
          args: unknown;
          ok: boolean;
          output: unknown;
          error?: string;
          durationMs?: number;
        }
      | { kind: 'plan'; ts: number; plan: unknown }
      | {
          kind: 'critic';
          ts: number;
          verdict: { done: boolean; reason: string; nextHint?: string };
        }
      | {
          kind: 'approval';
          ts: number;
          approvalId: string;
          tool: string;
          args: unknown;
          decision?: string;
        }
      | { kind: 'task.status'; ts: number; status: string; error?: string };

    const history: HistoryEntry[] = [];

    for (const ev of events) {
      switch (ev.type) {
        case 'llm.call':
          history.push({
            kind: 'llm.call',
            ts: ev.ts,
            agent: ev.agent,
            model: ev.model,
            messages: ev.messages,
            response: ev.response,
            durationMs: ev.durationMs,
          });
          break;
        case 'plan':
          history.push({ kind: 'plan', ts: ev.ts, plan: ev.plan });
          break;
        case 'critic':
          history.push({ kind: 'critic', ts: ev.ts, verdict: ev.verdict });
          break;
        case 'task.started':
          history.push({ kind: 'task.status', ts: ev.ts, status: 'running' });
          break;
        case 'task.finished':
          history.push({
            kind: 'task.status',
            ts: ev.ts,
            status: ev.status,
            error: ev.error as string | undefined,
          });
          break;
        case 'approval.requested':
          history.push({
            kind: 'approval',
            ts: ev.ts,
            approvalId: ev.approvalId,
            tool: ev.tool,
            args: ev.args,
          });
          break;
        case 'approval.decided':
          // Attach decision to the last matching approval entry
          for (let i = history.length - 1; i >= 0; i--) {
            const h = history[i];
            if (h && h.kind === 'approval' && h.approvalId === ev.approvalId) {
              h.decision = ev.decision;
              break;
            }
          }
          break;
      }
    }

    // Merge step rows as tool.call entries (these have full input/output from DB)
    for (const step of steps) {
      if (!step.tool) continue;
      history.push({
        kind: 'tool.call',
        ts: step.startedAt ?? step.finishedAt ?? task.createdAt,
        stepId: step.id,
        agent: step.agent,
        tool: step.tool,
        args: step.inputJson ? tryParse(step.inputJson) : null,
        ok: step.status === 'succeeded' || step.status === 'ok',
        output: step.outputJson ? tryParse(step.outputJson) : null,
        error: step.status === 'failed' ? (step.outputJson ?? undefined) : undefined,
        durationMs:
          step.startedAt && step.finishedAt ? step.finishedAt - step.startedAt : undefined,
      });
    }

    // Sort everything by timestamp
    history.sort((a, b) => a.ts - b.ts);

    return {
      taskId: task.id,
      prompt: task.prompt,
      status: task.status,
      iterations: task.iterations,
      plan: task.planJson ? tryParse(task.planJson) : null,
      history,
    };
  }),
});

function tryParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}
