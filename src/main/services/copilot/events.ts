import { SessionEvent } from '@github/copilot-sdk';
import {
  emitMessageDelta,
  emitThinkingDelta,
  emitToolCallFinished,
  emitToolCallStarted,
} from '@main/orchestrator/eventEmitter';
import { RunCtx } from '@main/orchestrator/runCtx';
import { ToolName } from '@shared/agent';
import { listToolCalls } from '../store';

export async function getToolCallById(taskId: string, toolCallId: string) {
  const taskToolCalls = await listToolCalls(taskId);
  const toolCall = taskToolCalls.find((c) => c.toolCallId === toolCallId);
  if (toolCall) {
    return {
      id: toolCall.id,
      tool: toolCall.tool,
      arguments: toolCall.arguments ? JSON.parse(toolCall.arguments) : null,
    };
  }
  return null;
}

/**
 * Map Copilot SDK events → ASE taskBus events for the live UI.
 */
export async function bridgeEvent(taskId: string, event: SessionEvent): Promise<void> {
  switch (event.type) {
    case 'assistant.message_delta':
      emitMessageDelta(taskId, 'copilot', event.data.deltaContent);
      break;

    case 'assistant.reasoning_delta':
      emitThinkingDelta(taskId, 'copilot', event.data.deltaContent);
      break;

    case 'tool.execution_start': {
      const tool = event.data.toolName as ToolName;
      emitToolCallStarted(taskId, 'copilot', tool, event.data.arguments, event.data.toolCallId);
      break;
    }

    case 'tool.execution_complete': {
      const toolCall = await getToolCallById(taskId, event.data.toolCallId);
      if (toolCall) {
        const ok = !event.data.error;
        const error = event.data.error?.message;
        emitToolCallFinished(taskId, toolCall.id, ok, toolCall.tool, {}, error);
      }
      break;
    }
  }
}
