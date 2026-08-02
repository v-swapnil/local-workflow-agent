import { ApprovalRequestRecord } from '@shared/schema';
import { ApprovalDecision } from '@shared/types';

export interface PendingApproval {
  request: ApprovalRequestRecord;
  resolve: (d: ApprovalDecision) => void;
}

export interface PendingUserInput {
  taskId: string;
  resolve: (answer: string) => void;
}

export interface UserInputRequest {
  question: string;
  description?: string;
  choices?: string[];
}
