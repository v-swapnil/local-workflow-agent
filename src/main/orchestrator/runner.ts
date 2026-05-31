import { getWorkspace } from '../services/workspaces';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { PROVIDERS } from '@shared/constants';
import { taskBus } from '../services/events.js';
import { emitTaskStarted, emitTaskFinished } from './eventEmitter.js';
import { getTask, updateTask, setSessionKanbanLane } from '../services/store.js';
import { getAgentOrNull } from '../services/agents.js';
import { getDb } from '../db/index.js';
import { sessions, tasks as tasksTable } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { logger } from '../services/logger.js';
import { clearTaskApprovals } from '../services/approvals.js';
import { createBranch, commitAll } from '../services/git';
import { getWorktreeForSession } from '../services/worktrees.js';
import { listSessionMemories } from '../services/memories.js';
import { existsSync } from 'node:fs';
import { buildGraph } from './graph.js';
import type { AgentState } from './state.js';
import { runTaskViaCopilot } from './copilot-runner.js';

import { runWorkflow } from './workflow-runner.js';
import type { TaskResult } from '@shared/agent';
import type { TaskRecord } from '@shared/schema';
import type { RunCtx } from './runCtx';

const log = logger.child({ mod: 'runner' });

/** Maximum wall-clock time for a single task run (default 10 minutes). */
const TASK_TIMEOUT_MS = 10 * 60 * 1000;

interface RunHandle {
  taskId: string;
  ctrl: AbortController;
  promise: Promise<TaskResult>;
}

const inflight = new Map<string, RunHandle>();

export function isRunning(taskId: string): boolean {
  return inflight.has(taskId);
}

/**
 * On startup no task can genuinely be running.  Mark any 'running' or 'queued'
 * tasks as 'failed' so stale approval events are never treated as pending.
 */
export function markOrphanedTasksFailed(): void {
  const now = Date.now();
  const result = getDb()
    .update(tasksTable)
    .set({ status: 'failed', finishedAt: now })
    .where(inArray(tasksTable.status, ['running', 'queued']))
    .run();
  if (result.changes > 0) {
    log.info({ count: result.changes }, 'marked orphaned tasks as failed');
  }
}

export function cancelTask(taskId: string): boolean {
  const h = inflight.get(taskId);
  if (!h) return false;
  h.ctrl.abort();
  return true;
}

export async function runTask(taskId: string): Promise<TaskResult> {
  const existing = inflight.get(taskId);
  if (existing) return existing.promise;

  const ctrl = new AbortController();
  const promise = doRun(taskId, ctrl).finally(() => {
    inflight.delete(taskId);
  });
  inflight.set(taskId, { taskId, ctrl, promise });
  return promise;
}

async function doRun(taskId: string, ctrl: AbortController): Promise<TaskResult> {
  // Wall-clock timeout: abort the task if it runs too long
  const timer = setTimeout(() => ctrl.abort(), TASK_TIMEOUT_MS);
  try {
    return await doRunInner(taskId, ctrl);
  } finally {
    clearTimeout(timer);
  }
}

async function doRunInner(taskId: string, ctrl: AbortController): Promise<TaskResult> {
  const task = getTask(taskId);
  const session = await loadSessionWorkspace(task);

  const agent = task.agentId ? getAgentOrNull(task.agentId) : null;
  const globalModel = await getSetting(SETTING_KEYS.PRIMARY_MODEL, '');
  const model = task.model ?? globalModel;

  if (!model) {
    return finish(task, {
      status: 'failed',
      iterations: 0,
      plan: null,
      reason: 'no active model configured (Settings → Models)',
    });
  }

  emitTaskStarted(taskId);

  // Optional: auto-branch per task before any code is written.
  // Skip branching if session has an active worktree (it already has its own branch).
  const gitAutoEnabled = (await getSetting(SETTING_KEYS.GIT_AUTO_BRANCH)) === '1';
  const autoBranch = gitAutoEnabled && !session.hasWorktree;
  const autoCommit = gitAutoEnabled && !session.hasWorktree;
  let branchName: string | null = null;
  if (autoBranch) {
    branchName = `ase/${taskId}`;
    try {
      await createBranch(session.workspaceId, branchName);
      taskBus.emit(taskId, {
        type: 'log',
        taskId,
        ts: Date.now(),
        stream: 'stdout',
        text: `[git] checked out branch ${branchName}\n`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ taskId, err: msg }, 'auto-branch failed');
      taskBus.emit(taskId, {
        type: 'log',
        taskId,
        ts: Date.now(),
        stream: 'stderr',
        text: `[git] auto-branch failed: ${msg}\n`,
      });
      branchName = null;
    }
  }

  const ctx: RunCtx = {
    taskId,
    workspaceId: session.workspaceId,
    workspacePath: session.workspacePath,
    model,
    sessionMemory: session.memoryText,
    signal: ctrl.signal,
    stepIdx: { n: 0 },
  };

  try {
    // Dispatch based on active provider and task/agent configuration
    const provider = await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA);
    updateTask(taskId, { provider });

    let result: TaskResult;
    if (task.workflowId) {
      result = await runWorkflow(taskId, task.workflowId, ctx);
    } else if (provider === PROVIDERS.COPILOT) {
      result = await runTaskViaCopilot(taskId, session, ctrl.signal, agent, ctx);
    } else {
      const graph = buildGraph(agent);
      const initial: Partial<AgentState> = {
        prompt: task.prompt,
      };
      const recursionLimit = 10;
      const final = (await graph.invoke(initial, {
        configurable: { runCtx: ctx },
        recursionLimit,
        signal: ctrl.signal,
      })) as AgentState;

      result = {
        status: 'succeeded',
        iterations: 1,
        plan: final.plan,
      };
    }

    if (result.status === 'succeeded' && autoCommit) {
      try {
        const r = await commitAll(
          session.workspaceId,
          `ase: ${task.prompt.slice(0, 72)}\n\ntask: ${task.id}`,
        );
        if (r.committed) {
          const commitBranch = branchName ?? (session.hasWorktree ? 'worktree' : 'current');
          taskBus.emit(taskId, {
            type: 'log',
            taskId,
            ts: Date.now(),
            stream: 'stdout',
            text: `[git] committed ${r.sha} on ${commitBranch}\n`,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ taskId, err: msg }, 'auto-commit failed');
      }
    }

    return finish(task, result);
  } catch (err) {
    const aborted = ctrl.signal.aborted;
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ taskId, err: msg }, 'task failed');
    return finish(task, {
      status: aborted ? 'cancelled' : 'failed',
      iterations: 0,
      plan: null,
      reason: msg,
    });
  }
}

function finish(task: TaskRecord, result: TaskResult): TaskResult {
  // Reset manual kanban lane so card auto-derives from new task status
  // Respects kanban.autoClearOverride setting (default: true)
  getSetting(SETTING_KEYS.KANBAN_AUTO_CLEAR).then((v) => {
    if (v !== 'false') setSessionKanbanLane(task.sessionId, null);
  });
  clearTaskApprovals(task.id);
  emitTaskFinished(
    task.id,
    result.status,
    result,
    result.status !== 'succeeded' ? result.reason : undefined,
  );
  return result;
}

async function loadSessionWorkspace(task: TaskRecord): Promise<{
  workspaceId: string;
  workspacePath: string;
  hasWorktree: boolean;
  memoryText: string | null;
}> {
  const sess = getDb().select().from(sessions).where(eq(sessions.id, task.sessionId)).get();
  if (!sess) throw new Error(`session not found for task ${task.id}`);
  const ws = await getWorkspace(sess.workspaceId);

  const sessionMemories = listSessionMemories(task.sessionId);
  const memoryText =
    sessionMemories.length > 0
      ? sessionMemories
          .slice(0, 40)
          .reverse()
          .map((m) => `[${m.type}] ${m.content}`)
          .join('\n')
      : null;

  // Use worktree path if one exists and is valid on disk
  const worktree = getWorktreeForSession(task.sessionId);
  if (worktree && existsSync(worktree.path)) {
    return {
      workspaceId: ws.id,
      workspacePath: worktree.path,
      hasWorktree: true,
      memoryText,
    };
  }

  return {
    workspaceId: ws.id,
    workspacePath: ws.path,
    hasWorktree: false,
    memoryText,
  };
}
