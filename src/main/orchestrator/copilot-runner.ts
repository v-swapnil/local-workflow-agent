/**
 * Run a task using GitHub Copilot CLI as the agentic runtime,
 * bypassing the local LangGraph loop entirely.
 */
import { getCopilotService } from '../services/llm/copilot.js';
import { taskBus } from '../services/events.js';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { requestApproval, requestUserInput } from '../services/approvals.js';
import { logger } from '../services/logger.js';
import { DEFAULT_COPILOT_MODEL, PROVIDERS } from '@shared/constants';
import type { TaskResult } from '@shared/agent';
import type { SessionEvent, PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk';
import { getTask } from '../services/store.js';
import type { AgentRecord } from '../services/agents.js';

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

export async function runTaskViaCopilot(
  taskId: string,
  workspace: { workspaceId: string; workspacePath: string; memoryText?: string | null },
  signal: AbortSignal,
  agent?: AgentRecord | null,
): Promise<TaskResult> {
  const service = getCopilotService();
  const client = await service.getClient();

  const primaryModel = await getSetting(SETTING_KEYS.PRIMARY_MODEL, DEFAULT_COPILOT_MODEL);
  const model = agent?.model || primaryModel;

  let iterationCount = 0;

  // Bridge Copilot permission requests → ASE approval system
  const onPermissionRequest = async (
    request: PermissionRequest,
  ): Promise<PermissionRequestResult> => {
    const toolName = describePermission(request);
    const decision = await requestApproval(taskId, toolName as any, request, signal);
    if (decision === 'approve' || decision === 'approve_session') {
      return { kind: 'approve-once' };
    }
    return { kind: 'no-result' };
  };

  const onUserInputRequest = async (req: UserInputRequest): Promise<UserInputResponse> => {
    try {
      const answer = await requestUserInput(taskId, req.question, { choices: req.choices }, signal);
      return { answer, wasFreeform: !req.choices?.includes(answer) };
    } catch {
      return { answer: '', wasFreeform: true };
    }
  };

  const session = await client.createSession({
    model,
    workingDirectory: workspace.workspacePath,
    streaming: true,
    onPermissionRequest,
    onUserInputRequest,
    onEvent: (event: SessionEvent) => {
      bridgeEvent(taskId, event);
      if (event.type === 'tool.execution_complete') {
        iterationCount++;
      }
    },
  });

  const sessionId = session.sessionId;

  try {
    const task = await getTask(taskId);
    const memory = workspace.memoryText?.trim();
    const agentInstruction = agent?.systemPrompt?.trim();
    const promptParts = [
      agentInstruction ? `Agent instructions:\n${agentInstruction}` : '',
      task.prompt,
      memory ? `Session memory:\n${memory}` : '',
    ].filter(Boolean);
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
    try {
      if (sessionId) await session.disconnect();
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Map Copilot SDK events → ASE taskBus events for the live UI.
 */
function bridgeEvent(taskId: string, event: SessionEvent): void {
  const ts = Date.now();

  switch (event.type) {
    case 'assistant.message_delta':
      taskBus.emit(taskId, {
        type: 'llm.delta',
        taskId,
        ts,
        agent: 'copilot',
        content: event.data.deltaContent,
      });
      break;

    case 'assistant.reasoning_delta':
      taskBus.emit(taskId, {
        type: 'llm.thinking_delta',
        taskId,
        ts,
        agent: 'copilot',
        content: event.data.deltaContent,
      });
      break;

    case 'tool.execution_start':
      taskBus.emit(taskId, {
        type: 'tool_call.started',
        taskId,
        ts,
        stepId: event.data.toolCallId,
        agent: 'copilot',
        tool: event.data.toolName,
        input: event.data.arguments,
      });
      break;

    case 'tool.execution_complete':
      taskBus.emit(taskId, {
        type: 'tool_call.finished',
        taskId,
        ts,
        stepId: event.data.toolCallId,
        ok: !event.data.error,
        tool: 'unknown', // TODO: fix it
        error: event.data.error?.message,
      });
      break;

    case 'session.error':
      taskBus.emit(taskId, {
        type: 'log',
        taskId,
        ts,
        stream: 'stderr',
        text: `[copilot] error: ${event.data?.message ?? 'unknown'}\n`,
      });
      break;
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
