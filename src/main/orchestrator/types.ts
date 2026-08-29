export interface TaskResult {
  status: 'succeeded' | 'failed' | 'cancelled';
  reason?: string;
}
