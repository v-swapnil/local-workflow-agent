import {
  getSession,
  getTask,
  getTaskTimeout,
  getWorkspace,
  setSessionKanbanLane,
  updateTask,
} from '../services/workspaces';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { PROVIDERS } from '@shared/constants';
import { emitTaskStarted, emitTaskFinished, emitLog } from './eventEmitter.js';
import { logger } from '../services/logger.js';
import { clearTaskApprovals } from '../services/approvals.js';
import { createBranch } from '../services/git';
import { getWorktreeForSession } from '../services/worktrees.js';
import { existsSync } from 'node:fs';
import { buildGraph } from './graph.js';
import type { AgentState } from './state.js';

import { runWorkflow } from './workflow-runner.js';
import type { TaskResult } from '@shared/agent';
import type { TaskRecord } from '@shared/schema';
import type { RunCtx } from './runCtx';

const log = logger.child({ mod: 'runner' });

interface RunHandle {
  taskId: string;
  ctrl: AbortController;
  promise: Promise<TaskResult>;
}

const inflight = new Map<string, RunHandle>();

export function isRunning(taskId: string): boolean {
  return inflight.has(taskId);
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
  const promise = doRunInner(taskId, ctrl).finally(() => {
    inflight.delete(taskId);
  });
  inflight.set(taskId, { taskId, ctrl, promise });
  return promise;
}

async function doRunInner(taskId: string, ctrl: AbortController): Promise<TaskResult> {
  const task = getTask(taskId);
  const session = await loadSessionWorkspace(task);

  try {
    const globalModel = await getSetting(SETTING_KEYS.PRIMARY_MODEL, '');
    const model = task.model ?? globalModel;

    if (!model) {
      return finish(task, {
        status: 'failed',
        plan: null,
        reason: 'no active model configured (Settings → Models)',
      });
    }

    emitTaskStarted(taskId);

    // Optional: auto-branch per task before any code is written.
    // Skip branching if session has an active worktree (it already has its own branch).
    const gitAutoEnabled = (await getSetting(SETTING_KEYS.GIT_AUTO_BRANCH)) === '1';
    const autoBranch = gitAutoEnabled && !session.hasWorktree;

    if (autoBranch) {
      try {
        const branchName = `ase/${taskId}`;
        await createBranch(session.workspaceId, branchName);
        emitLog(taskId, undefined, true, `[git] checked out branch ${branchName}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ taskId, err: msg }, 'auto-branch failed');
        emitLog(taskId, undefined, false, `[git] auto-branch failed: ${msg}`);
      }
    }

    const provider = await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA);
    updateTask(taskId, { provider });

    const taskTimeout = await getTaskTimeout();

    const ctx: RunCtx = {
      taskId,
      sessionId: task.sessionId,
      workspaceId: session.workspaceId,
      workspacePath: session.workspacePath,
      model,
      signal: ctrl.signal,
      stepIdx: { n: 0 },
      agentId: task.agentId ?? null,
      timeoutMs: taskTimeout,
    };

    let result: TaskResult;
    if (task.workflowId) {
      result = await runWorkflow(taskId, task.workflowId, ctx);
    } else {
      const graph = buildGraph(provider);
      const initial: Partial<AgentState> = { prompt: task.prompt };
      const final = (await graph.invoke(initial, {
        configurable: { runCtx: ctx },
        recursionLimit: 10,
        signal: ctrl.signal,
        timeout: taskTimeout,
      })) as AgentState;

      result = {
        status: 'succeeded',
        plan: final.plan,
      };
    }

    return finish(task, result);
  } catch (err) {
    const aborted = ctrl.signal.aborted;
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ taskId, err: msg }, 'task failed');
    return finish(task, {
      status: aborted ? 'cancelled' : 'failed',
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

async function loadSessionWorkspace(task: TaskRecord) {
  const session = getSession(task.sessionId);
  const ws = await getWorkspace(session.workspaceId);

  // Use worktree path if one exists and is valid on disk
  const worktree = getWorktreeForSession(task.sessionId);
  if (worktree && existsSync(worktree.path)) {
    return {
      workspaceId: ws.id,
      workspacePath: worktree.path,
      hasWorktree: true,
    };
  }

  return {
    workspaceId: ws.id,
    workspacePath: ws.path,
    hasWorktree: false,
  };
}
