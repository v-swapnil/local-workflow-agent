import { useEffect, useRef, useState } from 'react';
import { trpc } from '../../trpc';
import { StatusPill } from './StatusPill';
import { EventRow } from './EventStream';
import { ApprovalModal } from './ApprovalModal';
import { UserInputModal } from './UserInputModal';
import type { TaskEvent, ApprovalReq, UserInputReq } from './types';

const getEvents = (previousEvents: TaskEvent[], currentEvent: TaskEvent) => {
  const lastEvent = previousEvents[previousEvents.length - 1];
  if (
    lastEvent?.type === 'llm.delta' && currentEvent.type === 'llm.delta' ||
    lastEvent?.type === 'llm.thinking_delta' && currentEvent.type === 'llm.thinking_delta'
  ) {
    return previousEvents
      .slice(0, -1)
      .concat({ ...lastEvent, content: lastEvent.content + currentEvent.content } as TaskEvent);
  }
  return previousEvents.concat(currentEvent);
};

export function TaskView({ taskId }: { taskId: string }) {
  const utils = trpc.useUtils();
  const task = trpc.task.get.useQuery({ id: taskId }, { refetchInterval: 1500 });
  const cancel = trpc.task.cancel.useMutation({
    onSuccess: () => utils.task.get.invalidate({ id: taskId }),
  });
  const retry = trpc.task.retry.useMutation({
    onSuccess: (t) => utils.task.list.invalidate({ sessionId: t.sessionId }),
  });
  const exportReport = trpc.task.exportReport.useMutation();
  const decide = trpc.approval.decide.useMutation();
  const respondInput = trpc.approval.respondUserInput.useMutation();

  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalReq[]>([]);
  const [pendingUserInputs, setPendingUserInputs] = useState<UserInputReq[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  trpc.task.events.useSubscription(
    { taskId },
    {
      onData: (ev) => {
        const e = ev as TaskEvent;
        setEvents((prev) => getEvents(prev, e));
        if (e.type === 'approval.requested') {
          setPendingApprovals((prev) => [
            ...prev,
            { id: e.approvalId, tool: e.tool, args: e.args, ts: e.ts },
          ]);
        } else if (e.type === 'approval.decided') {
          setPendingApprovals((prev) => prev.filter((a) => a.id !== e.approvalId));
        } else if (e.type === 'user_input.requested') {
          setPendingUserInputs((prev) => [
            ...prev,
            { id: e.requestId, question: e.question, description: e.description, choices: e.choices, allowMultiple: e.allowMultiple, ts: e.ts },
          ]);
        } else if (e.type === 'user_input.responded') {
          setPendingUserInputs((prev) => prev.filter((r) => r.id !== e.requestId));
        } else if (e.type === 'task.finished') {
          setPendingApprovals([]);
          setPendingUserInputs([]);
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
      setPendingApprovals([]);
      setPendingUserInputs([]);
    }
  }, [finished]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col flex-1">
        {/* Header bar */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            <span className="font-mono text-ui-2xs text-ink-600 uppercase tracking-widest2">
              event stream
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {running && (
              <button
                onClick={() => cancel.mutate({ id: taskId })}
                className="btn-danger !py-0.5 !px-2 !text-ui-2xs"
              >
                cancel
              </button>
            )}
            {finished && (
              <>
                <button
                  onClick={() => exportReport.mutate({ id: taskId })}
                  disabled={exportReport.isPending}
                  className="btn-secondary !py-0.5 !px-2 !text-ui-2xs"
                >
                  {exportReport.isPending ? 'exporting…' : 'export'}
                </button>
                {status !== 'succeeded' && (
                  <button
                    onClick={() => retry.mutate({ id: taskId })}
                    disabled={retry.isPending}
                    className="btn-primary !py-0.5 !px-2 !text-ui-2xs"
                  >
                    retry
                  </button>
                )}
              </>
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
          {events.map((ev, i) => (
            <EventRow key={i} ev={ev} />
          ))}
        </div>
      </div>

      {pendingApprovals.length > 0 && pendingApprovals[0] && (
        <ApprovalModal
          req={pendingApprovals[0]}
          remaining={pendingApprovals.length - 1}
          onDecide={(d) => {
            const aid = pendingApprovals[0]!.id;
            decide.mutate(
              { id: aid, decision: d },
              {
                onSuccess: (res) => {
                  if (!res.ok) {
                    setPendingApprovals((prev) => prev.filter((a) => a.id !== aid));
                  }
                },
              },
            );
          }}
        />
      )}

      {pendingUserInputs.length > 0 && pendingUserInputs[0] && (
        <UserInputModal
          req={pendingUserInputs[0]}
          onSubmit={(answer) => {
            const rid = pendingUserInputs[0]!.id;
            respondInput.mutate(
              { id: rid, answer },
              {
                onSuccess: (res) => {
                  if (!res.ok) {
                    setPendingUserInputs((prev) => prev.filter((r) => r.id !== rid));
                  }
                },
              },
            );
          }}
          onDismiss={() => {
            const rid = pendingUserInputs[0]!.id;
            respondInput.mutate(
              { id: rid, answer: '' },
              {
                onSuccess: () => {
                  setPendingUserInputs((prev) => prev.filter((r) => r.id !== rid));
                },
              },
            );
          }}
        />
      )}
    </div>
  );
}
