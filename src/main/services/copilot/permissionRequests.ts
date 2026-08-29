import { PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk';
import { requestApproval } from '../approvals';
import { ToolName } from '@shared/agent';
import { getToolCallByToolCallId } from '../store';

export async function resolvePermissionRequest({
  taskId,
  request,
  signal,
}: {
  taskId: number;
  request: PermissionRequest;
  signal?: AbortSignal;
}): Promise<PermissionRequestResult> {
  const toolCall = request.toolCallId
    ? await getToolCallByToolCallId(taskId, request.toolCallId)
    : null;
  const toolName = (toolCall?.toolName ?? request.kind) as ToolName;
  const decision = await requestApproval(taskId, toolCall?.id, toolName, signal);

  if (decision === 'approved') {
    return { kind: 'approve-once' };
  } else if (decision === 'denied') {
    return { kind: 'reject' };
  }

  return { kind: 'no-result' };
}
