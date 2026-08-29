type PendingType = 'approval' | 'user_input';

interface PendingWaiter {
  type: PendingType;
  taskId: number;
  referenceId: number; // id of the approval / user_input DB row
  resolve: (value: string | null) => void;
}

class PendingRegistry {
  private waiters: PendingWaiter[] = [];

  add(waiter: PendingWaiter): void {
    this.waiters.push(waiter);
  }

  resolve(type: PendingType, referenceId: number, value: string | null): boolean {
    const index = this.waiters.findIndex(
      (waiter) => waiter.type === type && waiter.referenceId === referenceId,
    );
    if (index === -1) return false;
    const [waiter] = this.waiters.splice(index, 1);
    if (!waiter) return false;
    waiter.resolve(value);
    return true;
  }

  remove(type: PendingType, referenceId: number): void {
    this.waiters = this.waiters.filter(
      (waiter) => !(waiter.type === type && waiter.referenceId === referenceId),
    );
  }

  // Resolve every waiter of a finished task with `null` (cleared, never answered).
  clearForTask(taskId: number): void {
    const remaining: PendingWaiter[] = [];
    for (const waiter of this.waiters) {
      if (waiter.taskId === taskId) waiter.resolve(null);
      else remaining.push(waiter);
    }
    this.waiters = remaining;
  }
}

export const pendingRegistry = new PendingRegistry();
