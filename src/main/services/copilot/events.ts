import { SessionEvent } from '@github/copilot-sdk';
import {
  emitMessageDelta,
  emitThinkingDelta,
  emitToolCallFinished,
  emitToolCallStarted,
} from '@main/orchestrator/eventEmitter';
import { ToolName } from '@shared/agent';

/**
 * Map Copilot SDK events → ASE taskBus events for the live UI.
 */
export async function bridgeEvent(taskId: number, event: SessionEvent): Promise<void> {
  switch (event.type) {
    case 'assistant.message_delta':
      emitMessageDelta(taskId, event.data.deltaContent);
      break;

    case 'assistant.reasoning_delta':
      emitThinkingDelta(taskId, event.data.deltaContent);
      break;

    case 'tool.execution_start': {
      const tool = event.data.toolName as ToolName;
      const toolArguments =
        event.data.arguments &&
        typeof event.data.arguments === 'object' &&
        !Array.isArray(event.data.arguments)
          ? (event.data.arguments as Record<string, unknown>)
          : {};
      emitToolCallStarted(taskId, null, event.data.toolCallId, tool, toolArguments);
      break;
    }

    case 'tool.execution_complete': {
      emitToolCallFinished(taskId, event.data.toolCallId, {
        status: event.data.success ? 'success' : 'error',
        content: event.data.result?.content || event.data.error?.message || '',
        truncated: false,
      });
      break;
    }
  }
}
