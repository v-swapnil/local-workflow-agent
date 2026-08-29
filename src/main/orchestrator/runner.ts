import {
  getTask,
  getTaskTimeout,
  resolveSessionWorkspace,
  updateTask,
} from '../services/workspaces';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { PROVIDERS } from '@shared/constants';
import { emitTaskStarted, emitTaskFinished, emitLog } from './eventEmitter.js';
import { logger } from '../services/logger.js';
import { createBranch } from '../services/git';
import { buildGraph } from './graph.js';
import type { AgentState } from './state.js';

import { runWorkflow } from './workflow-runner.js';
import type { TaskResult } from '@shared/agent';
import type { TaskRecord } from '@shared/schema';
import type { RunCtx } from './runCtx';
import { pendingRegistry } from '@main/services/approvals/state';

const log = logger.child({ mod: 'runner' });

interface RunHandle {
  taskId: number;
  ctrl: AbortController;
  promise: Promise<TaskResult>;
}

class TaskRunner {
  private inflight = new Map<number, RunHandle>();

  private async execute(taskId: number, ctrl: AbortController): Promise<TaskResult> {
    const task = getTask(taskId);
    const session = await resolveSessionWorkspace(task.sessionId);

    try {
      const globalModel = await getSetting(SETTING_KEYS.PRIMARY_MODEL, '');
      const model = task.model ?? globalModel;

      if (!model) {
        return this.finish(task, {
          status: 'failed',
          reason: 'no active model configured (Settings → Models)',
        });
      }

      emitTaskStarted(taskId, task.workflowId ?? task.agentId ?? null);

      // Optional: auto-branch per task before any code is written.
      // Skip branching if session has an active worktree (it already has its own branch).
      const gitAutoEnabled = (await getSetting(SETTING_KEYS.GIT_AUTO_BRANCH)) === '1';
      const autoBranch = gitAutoEnabled && !session.hasWorktree;

      if (autoBranch) {
        try {
          const branchName = `ase/${taskId}`;
          await createBranch(session.workspaceId, branchName);
          emitLog(taskId, 'info', `[git] checked out branch ${branchName}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn({ taskId, err: message }, 'auto-branch failed');
          emitLog(taskId, 'error', `[git] auto-branch failed: ${message}`);
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
        agentId: task.agentId ?? null,
        timeoutMs: taskTimeout,
      };

      let result: TaskResult;
      if (task.workflowId) {
        result = await runWorkflow(taskId, task.workflowId, ctx);
      } else {
        const graph = buildGraph(provider);
        const initial: Partial<AgentState> = { prompt: task.prompt };
        await graph.invoke(initial, {
          configurable: { runCtx: ctx },
          signal: ctrl.signal,
          timeout: taskTimeout,
        });

        result = {
          status: 'succeeded',
        };
      }

      return this.finish(task, result);
    } catch (err) {
      const aborted = ctrl.signal.aborted;
      const message = err instanceof Error ? err.message : String(err);
      log.error({ taskId, err: message }, 'task failed');
      return this.finish(task, {
        status: aborted ? 'cancelled' : 'failed',
        reason: message,
      });
    }
  }

  private finish(task: TaskRecord, result: TaskResult): TaskResult {
    pendingRegistry.clearForTask(task.id);
    emitTaskFinished(task.id, result.status, result, task.workflowId ?? task.agentId ?? null);
    return result;
  }

  isRunning(taskId: number): boolean {
    return this.inflight.has(taskId);
  }

  cancel(taskId: number): boolean {
    const handle = this.inflight.get(taskId);
    if (!handle) return false;
    handle.ctrl.abort();
    return true;
  }

  run(taskId: number): Promise<TaskResult> {
    const existing = this.inflight.get(taskId);
    if (existing) return existing.promise;

    const ctrl = new AbortController();
    const promise = this.execute(taskId, ctrl).finally(() => {
      this.inflight.delete(taskId);
    });
    this.inflight.set(taskId, { taskId, ctrl, promise });
    return promise;
  }
}

export const taskRunner = new TaskRunner();
