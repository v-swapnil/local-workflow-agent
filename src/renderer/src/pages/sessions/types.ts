export interface ApprovalReq {
  id: string;
  tool: string;
  args: unknown;
  ts: number;
}

export interface UserInputReq {
  id: string;
  question: string;
  description?: string;
  choices?: string[];
  allowMultiple?: boolean;
  ts: number;
}
