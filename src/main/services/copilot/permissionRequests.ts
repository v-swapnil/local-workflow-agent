import { PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk';
import { requestApproval } from '../approvals';
import { ToolName } from '@shared/agent';
import { getToolCallById } from './events';
import { APPROVAL_DECISION } from '@shared/constants';

export async function resolvePermissionRequest({
  taskId,
  request,
  signal,
}: {
  taskId: string;
  request: PermissionRequest;
  signal?: AbortSignal;
}): Promise<PermissionRequestResult> {
  const toolCall = request.toolCallId ? await getToolCallById(taskId, request.toolCallId) : null;
  const toolName = (toolCall?.toolName ?? request.kind) as ToolName;
  const decision = await requestApproval(taskId, toolName, toolCall?.arguments, signal, toolCall?.id);

  if (decision === APPROVAL_DECISION.APPROVE) {
    return { kind: 'approve-once' };
  } else if (decision === APPROVAL_DECISION.DENY) {
    return { kind: 'reject' };
  }

  return { kind: 'no-result' };
}
