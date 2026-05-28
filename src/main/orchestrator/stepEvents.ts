import { addStep, updateStep } from '../services/store.js';
import { taskBus } from '../services/events.js';
import type { ToolName } from '../services/tools/types.js';
import type { RunCtx } from './runCtx.js';

export function emitStepStarted(
  ctx: RunCtx,
  agent: string,
  tool?: ToolName,
  input?: unknown,
): { stepId: string } {
  const idx = ctx.stepIdx.n++;
  const row = addStep({
    taskId: ctx.taskId,
    idx,
    agent,
    tool: tool ?? null,
    inputJson: input != null ? JSON.stringify(input) : null,
    outputJson: null,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
  });
  if (tool) {
    taskBus.emit(ctx.taskId, {
      type: 'tool_call.started',
      taskId: ctx.taskId,
      ts: Date.now(),
      stepId: row.id,
      agent,
      tool,
      input,
    });
  } else {
    taskBus.emit(ctx.taskId, {
      type: 'step.started',
      taskId: ctx.taskId,
      ts: Date.now(),
      stepId: row.id,
      agent,
    });
  }
  return { stepId: row.id };
}

export function emitStepFinished(
  ctx: RunCtx,
  stepId: string,
  ok: boolean,
  output: unknown,
  error?: string,
  tool?: string,
): void {
  updateStep(stepId, {
    outputJson: output != null ? JSON.stringify(output) : null,
    status: ok ? 'succeeded' : 'failed',
    finishedAt: Date.now(),
  });
  if (tool) {
    taskBus.emit(ctx.taskId, {
      type: 'tool_call.finished',
      taskId: ctx.taskId,
      ts: Date.now(),
      stepId,
      ok,
      tool,
      output,
      error,
    });
  } else {
    taskBus.emit(ctx.taskId, {
      type: 'step.finished',
      taskId: ctx.taskId,
      ts: Date.now(),
      stepId,
      ok,
      output,
      error,
    });
  }
}
