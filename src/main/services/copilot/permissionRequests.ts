import { PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk';
import { requestApproval } from '../approvals';
import { ToolName } from '@shared/agent';
import { getToolCallByToolCallId } from '../store';

export async function resolvePermissionRequest({
  taskId,
  request,
  signal,
}: {
  taskId: string;
  request: PermissionRequest;
  signal?: AbortSignal;
}): Promise<PermissionRequestResult> {
  const toolCall = request.toolCallId
    ? await getToolCallByToolCallId(taskId, request.toolCallId)
    : null;
  const toolName = (toolCall?.toolName ?? request.kind) as ToolName;
  const decision = await requestApproval(
    taskId,
    toolName,
    toolCall?.arguments ? JSON.parse(toolCall.arguments) : null,
    signal,
    toolCall?.id,
  );

  if (decision === 'approved') {
    return { kind: 'approve-once' };
  } else if (decision === 'denied') {
    return { kind: 'reject' };
  }

  return { kind: 'no-result' };
}
