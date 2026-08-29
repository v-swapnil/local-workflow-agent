import { ApprovalRecord } from '@shared/schema';
import { ApprovalStatus } from '@shared/types';

export interface PendingApproval {
  request: ApprovalRecord;
  resolve: (d: ApprovalStatus) => void;
}

export interface PendingUserInput {
  taskId: number;
  resolve: (answer: string) => void;
}

export interface UserInputRequest {
  question: string;
  description?: string;
  choices?: string[];
}
