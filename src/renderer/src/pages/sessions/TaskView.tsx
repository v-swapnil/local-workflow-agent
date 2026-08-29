import { useEffect, useRef, useState } from 'react';
import { trpc } from '../../trpc';
import { StatusPill } from './StatusPill';
import { EventRow } from './EventStream';
import { ApprovalModal } from './ApprovalModal';
import { UserInputModal } from './UserInputModal';
import type { TaskEventRecord } from '@shared/schema';
import { Button } from '../../components/ui/button';

const getEvents = (previousEvents: TaskEventRecord[], currentEvent: TaskEventRecord) => {
  const lastEvent = previousEvents[previousEvents.length - 1];
  if (
    (lastEvent?.type === 'llm.delta' && currentEvent.type === 'llm.delta') ||
    (lastEvent?.type === 'llm.thinking_delta' && currentEvent.type === 'llm.thinking_delta')
  ) {
    return previousEvents.slice(0, -1).concat({
      ...lastEvent,
      content: lastEvent.content + currentEvent.content,
    } as TaskEventRecord);
  }
  return previousEvents.concat(currentEvent);
};

export function TaskView({ taskId }: { taskId: number }) {
  const utils = trpc.useUtils();
  const task = trpc.task.get.useQuery({ id: taskId }, { refetchInterval: 1500 });
  const cancel = trpc.task.cancel.useMutation({
    onSuccess: () => utils.task.get.invalidate({ id: taskId }),
  });
  const retry = trpc.task.retry.useMutation({
    onSuccess: (t) => utils.task.list.invalidate({ sessionId: t.sessionId }),
  });
  const decide = trpc.approval.decide.useMutation();
  const respondInput = trpc.approval.respondUserInput.useMutation();

  const [events, setEvents] = useState<TaskEventRecord[]>([]);
  const [pendingApprovalIds, setPendingApprovalIds] = useState<number[]>([]);
  const [pendingUserInputIds, setPendingUserInputIds] = useState<number[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  trpc.task.events.useSubscription(
    { taskId },
    {
      onData: (event) => {
        setEvents((prev) => getEvents(prev, { ...event, ts: Date.now() }));
        if (event.type === 'approval.requested') {
          setPendingApprovalIds((prev) => [...prev, event.referenceId]);
        } else if (event.type === 'approval.decided') {
          setPendingApprovalIds((prev) => prev.filter((id) => id !== event.referenceId));
        } else if (event.type === 'user_input.requested') {
          setPendingUserInputIds((prev) => [...prev, event.referenceId]);
        } else if (event.type === 'user_input.responded') {
          setPendingUserInputIds((prev) => prev.filter((id) => id !== event.referenceId));
        } else if (event.type === 'task.finished') {
          setPendingApprovalIds([]);
          setPendingUserInputIds([]);
        }
      },
    },
  );

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [events.length]);

  const status = task.data?.status ?? 'queued';
  const running = status === 'running' || status === 'queued';
  const finished = status === 'succeeded' || status === 'failed' || status === 'cancelled';

  useEffect(() => {
    if (finished) {
      setPendingApprovalIds([]);
      setPendingUserInputIds([]);
    }
  }, [finished]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col flex-1">
        {/* Header bar */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 justify-between w-full">
            <span className="font-mono text-ui-2xs text-ink-600 uppercase tracking-widest2">
              event stream
            </span>
            <StatusPill status={status} />
          </div>
          <div className="flex items-center gap-1.5">
            {running && (
              <Button variant="danger" size="xs" onClick={() => cancel.mutate({ id: taskId })}>
                cancel
              </Button>
            )}
            {finished && status !== 'succeeded' && (
              <Button
                variant="default"
                size="xs"
                onClick={() => retry.mutate({ id: taskId })}
                disabled={retry.isPending}
              >
                retry
              </Button>
            )}
          </div>
        </div>

        {/* Event log */}
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto rounded-lg border border-ink-800/60 bg-ink-950/80 p-3 font-mono text-ui-sm leading-relaxed"
        >
          {events.length === 0 && (
            <div className="flex items-center gap-2 text-ink-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-600 animate-pulse" />
              waiting for events…
            </div>
          )}
          {events.map((event, i) => (
            <EventRow key={`${event.type}_${i}`} event={event} />
          ))}
        </div>
      </div>

      {pendingApprovalIds.length > 0 && pendingApprovalIds[0] != null && (
        <ApprovalModal
          id={pendingApprovalIds[0]}
          onDecide={(decision) => {
            const approvalId = pendingApprovalIds[0]!;
            decide.mutate(
              { id: approvalId, decision },
              {
                onSuccess: (res) => {
                  if (!res.ok) {
                    setPendingApprovalIds((prev) => prev.filter((id) => id !== approvalId));
                  }
                },
              },
            );
          }}
        />
      )}

      {pendingUserInputIds.length > 0 && pendingUserInputIds[0] != null && (
        <UserInputModal
          id={pendingUserInputIds[0]}
          onSubmit={(answer) => {
            const inputId = pendingUserInputIds[0]!;
            respondInput.mutate(
              { id: inputId, answer },
              {
                onSuccess: (res) => {
                  if (!res.ok) {
                    setPendingUserInputIds((prev) => prev.filter((id) => id !== inputId));
                  }
                },
              },
            );
          }}
          onDismiss={() => {
            const inputId = pendingUserInputIds[0]!;
            respondInput.mutate(
              { id: inputId, answer: '' },
              {
                onSuccess: () => {
                  setPendingUserInputIds((prev) => prev.filter((id) => id !== inputId));
                },
              },
            );
          }}
        />
      )}
    </div>
  );
}
