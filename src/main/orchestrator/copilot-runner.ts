/**
 * Run a task using GitHub Copilot CLI as the agentic runtime,
 * bypassing the local LangGraph loop entirely.
 */
import { getCopilotService } from '../services/llm/copilot.js';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { requestApproval, requestUserInput } from '../services/approvals.js';
import {
  emitToolCallStarted,
  emitToolCallFinished,
  emitMessageDelta,
  emitThinkingDelta,
} from './eventEmitter.js';
import { logger } from '../services/logger.js';
import { DEFAULT_COPILOT_MODEL } from '@shared/constants';
import type { TaskResult, ToolName } from '@shared/agent';
import type { SessionEvent, PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk';
import type { RunCtx } from './runCtx.js';
import type { AgentRecord } from '@shared/schema.js';
import { getTask } from '@main/services/workspaces';

/** Mirrors UserInputRequest / UserInputResponse from @github/copilot-sdk */
interface UserInputRequest {
  question: string;
  choices?: string[];
  allowFreeform?: boolean;
}

interface UserInputResponse {
  answer: string;
  wasFreeform: boolean;
}

const log = logger.child({ mod: 'copilot-runner' });
const toolCallMap = new Map<string, { stepId: string; tool: string }>();

export async function runTaskViaCopilot(
  taskId: string,
  workspace: { workspaceId: string; workspacePath: string; memoryText?: string | null },
  signal: AbortSignal,
  agent: AgentRecord | null,
  ctx: RunCtx,
): Promise<TaskResult> {
  const service = getCopilotService();
  const client = await service.getClient();

  const primaryModel = await getSetting(SETTING_KEYS.PRIMARY_MODEL, DEFAULT_COPILOT_MODEL);
  const model = primaryModel;

  let iterationCount = 0;

  // Bridge Copilot permission requests → ASE approval system
  const handlePermissionRequest = async (
    request: PermissionRequest,
  ): Promise<PermissionRequestResult> => {
    const toolName = describePermission(request);
    const decision = await requestApproval(taskId, toolName as ToolName, request, signal);
    if (decision === 'approve' || decision === 'approve_session') {
      return { kind: 'approve-once' };
    }
    return { kind: 'no-result' };
  };

  const handlerUserInputRequest = async (req: UserInputRequest): Promise<UserInputResponse> => {
    try {
      const answer = await requestUserInput(taskId, req.question, { choices: req.choices }, signal);
      return { answer, wasFreeform: !req.choices?.includes(answer) };
    } catch {
      return { answer: '', wasFreeform: true };
    }
  };

  const handleSessionEvent = (event: SessionEvent) => {
    bridgeEvent(taskId, event, ctx);
    if (event.type === 'tool.execution_complete') {
      iterationCount++;
    }
  };

  const agentInstruction = agent?.systemPrompt?.trim();
  const session = await client.createSession({
    model,
    systemMessage: { mode: 'append', content: agentInstruction },
    workingDirectory: workspace.workspacePath,
    streaming: true,
    onPermissionRequest: handlePermissionRequest,
    onUserInputRequest: handlerUserInputRequest,
    onEvent: handleSessionEvent,
  });

  try {
    const task = await getTask(taskId);
    const memory = workspace.memoryText?.trim();
    const promptParts = [task.prompt, memory ? `Session memory:\n${memory}` : ''].filter(Boolean);
    const prompt = promptParts.join('\n\n');
    const result = await session.sendAndWait({ prompt }, 10 * 60 * 1000);

    const succeeded = !!result;
    return {
      status: succeeded ? 'succeeded' : 'failed',
      iterations: iterationCount,
      plan: null,
      reason: succeeded ? undefined : 'Copilot session ended without response',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const aborted = signal.aborted;
    log.error({ taskId, err: msg }, 'copilot task failed');
    return {
      status: aborted ? 'cancelled' : 'failed',
      iterations: iterationCount,
      plan: null,
      reason: msg,
    };
  } finally {
    await session.disconnect();
  }
}

/**
 * Map Copilot SDK events → ASE taskBus events for the live UI.
 */
function bridgeEvent(taskId: string, event: SessionEvent, ctx: RunCtx): void {
  switch (event.type) {
    case 'assistant.message_delta':
      emitMessageDelta(taskId, 'copilot', event.data.deltaContent);
      break;

    case 'assistant.reasoning_delta':
      emitThinkingDelta(taskId, 'copilot', event.data.deltaContent);
      break;

    case 'tool.execution_start': {
      const tool = event.data.toolName as ToolName;
      const result = emitToolCallStarted(ctx.taskId, 'copilot', tool, event.data.arguments);
      toolCallMap.set(event.data.toolCallId, { stepId: result.stepId, tool });
      break;
    }

    case 'tool.execution_complete': {
      const ok = !event.data.error;
      const result = toolCallMap.get(event.data.toolCallId);
      if (result) {
        emitToolCallFinished(
          ctx.taskId,
          result.stepId,
          ok,
          result.tool,
          {},
          event.data.error?.message,
        );
      }
      break;
    }
  }
}

/**
 * Convert a Copilot PermissionRequest into a human-readable tool name for the ASE UI.
 */
function describePermission(req: PermissionRequest): string {
  const r = req as any;
  switch (r.kind) {
    case 'shell':
      return `shell: ${r.fullCommandText ?? 'command'}`;
    case 'write':
      return `write: ${r.fileName ?? 'file'}`;
    case 'read':
      return `read: ${r.fileName ?? 'file'}`;
    case 'mcp':
      return `mcp: ${r.serverName ?? 'server'}`;
    default:
      return r.kind ?? 'unknown';
  }
}
