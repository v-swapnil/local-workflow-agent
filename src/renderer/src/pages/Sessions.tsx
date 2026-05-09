import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { cn } from '../lib/utils';

type TaskEvent =
  | { type: 'task.started'; taskId: string; ts: number }
  | {
      type: 'task.finished';
      taskId: string;
      ts: number;
      status: 'succeeded' | 'failed' | 'cancelled';
      result?: unknown;
      error?: string;
    }
  | { type: 'task.iteration'; taskId: string; ts: number; iteration: number }
  | {
      type: 'plan';
      taskId: string;
      ts: number;
      plan: { summary: string; steps: { id: string; goal: string }[]; selectedSkills?: string[] };
    }
  | {
      type: 'step.started';
      taskId: string;
      ts: number;
      stepId: string;
      agent: string;
      tool?: string;
      input?: unknown;
    }
  | {
      type: 'step.finished';
      taskId: string;
      ts: number;
      stepId: string;
      ok: boolean;
      output?: unknown;
      error?: string;
    }
  | {
      type: 'log';
      taskId: string;
      ts: number;
      stream: 'stdout' | 'stderr';
      text: string;
      stepId?: string;
    }
  | { type: 'llm.delta'; taskId: string; ts: number; agent: string; content: string }
  | { type: 'llm.thinking_delta'; taskId: string; ts: number; agent: string; content: string }
  | {
      type: 'critic';
      taskId: string;
      ts: number;
      verdict: { done: boolean; reason: string; nextHint?: string };
    }
  | {
      type: 'approval.requested';
      taskId: string;
      ts: number;
      approvalId: string;
      tool: string;
      args: unknown;
    }
  | {
      type: 'approval.decided';
      taskId: string;
      ts: number;
      approvalId: string;
      decision: 'approve' | 'approve_session' | 'deny';
    }
  | {
      type: 'user_input.requested';
      taskId: string;
      ts: number;
      requestId: string;
      question: string;
      context?: string;
      choices?: string[];
    }
  | {
      type: 'user_input.responded';
      taskId: string;
      ts: number;
      requestId: string;
      answer: string;
    };

export function Sessions() {
  const { workspaceId } = useActiveWorkspace();
  const utils = trpc.useUtils();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionsQ = trpc.session.list.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );
  const [sessionId, setSessionId] = useState<string | null>(searchParams.get('id'));
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const create = trpc.session.create.useMutation({
    onSuccess: async (s) => {
      await utils.session.list.invalidate();
      setSessionId(s.id);
      setExpandedSessions((prev) => new Set(prev).add(s.id));
    },
  });
  const del = trpc.session.delete.useMutation({
    onSuccess: async () => {
      await utils.session.list.invalidate();
      setSessionId(null);
      setFocusedTaskId(null);
    },
  });

  useEffect(() => {
    if (searchParams.has('id')) {
      searchParams.delete('id');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionId && sessionsQ.data?.length) {
      const first = sessionsQ.data[0]!;
      setSessionId(first.id);
      setExpandedSessions((prev) => new Set(prev).add(first.id));
    }
  }, [sessionId, sessionsQ.data]);

  // Auto-expand selected session
  useEffect(() => {
    if (sessionId) setExpandedSessions((prev) => new Set(prev).add(sessionId));
  }, [sessionId]);

  const toggleExpand = (id: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="grid h-full grid-cols-[320px_1fr] gap-6 p-6">
      <aside className="flex flex-col">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
            sessions
          </div>
          <button
            className="rounded border border-ink-700 px-2 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-200 hover:border-amber-500 hover:text-amber-400 disabled:opacity-40"
            disabled={!workspaceId || create.isPending}
            onClick={() =>
              create.mutate({
                workspaceId: workspaceId!,
                title: `session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              })
            }
          >
            + new
          </button>
        </div>

        {!workspaceId && (
          <div className="font-mono text-ui-sm text-ink-500">no active workspace</div>
        )}

        <div className="flex-1 space-y-0.5 overflow-y-auto">
          {sessionsQ.data?.map((s) => (
            <SessionTreeNode
              key={s.id}
              session={s}
              isActive={sessionId === s.id}
              isExpanded={expandedSessions.has(s.id)}
              focusedTaskId={focusedTaskId}
              onSelect={() => {
                setSessionId(s.id);
                setFocusedTaskId(null);
              }}
              onToggle={() => toggleExpand(s.id)}
              onDelete={() => {
                if (confirm(`Delete session "${s.title}"?`)) del.mutate({ id: s.id });
              }}
              onTaskSelect={(taskId) => {
                setSessionId(s.id);
                setFocusedTaskId(taskId);
              }}
            />
          ))}
          {sessionsQ.data?.length === 0 && (
            <div className="font-mono text-ui-sm text-ink-500">no sessions yet</div>
          )}
        </div>
      </aside>

      <main className="min-w-0">
        {sessionId ? (
          <SessionDetail
            sessionId={sessionId}
            key={sessionId}
            focusedTaskId={focusedTaskId}
            onTaskFocus={setFocusedTaskId}
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
            select or create a session
          </div>
        )}
      </main>
    </div>
  );
}

function SessionTreeNode({
  session,
  isActive,
  isExpanded,
  focusedTaskId,
  onSelect,
  onToggle,
  onDelete,
  onTaskSelect,
}: {
  session: { id: string; title: string; updatedAt: number };
  isActive: boolean;
  isExpanded: boolean;
  focusedTaskId: string | null;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onTaskSelect: (taskId: string) => void;
}) {
  const tasks = trpc.task.list.useQuery(
    { sessionId: session.id },
    { refetchInterval: isActive ? 2000 : false },
  );

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-center gap-1 rounded border px-2 py-1.5 text-left transition-colors',
          isActive
            ? 'border-amber-700/60 bg-amber-950/20'
            : 'border-transparent hover:border-ink-800',
        )}
      >
        <button
          className="shrink-0 font-mono text-ui-xs text-ink-500 hover:text-ink-300"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isExpanded ? '▾' : '▸'}
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="truncate font-serif text-ui-base text-ink-50">{session.title}</div>
          <div className="font-mono text-ui-xs text-ink-500">
            {new Date(session.updatedAt).toLocaleString()}
            {tasks.data ? ` · ${tasks.data.length} tasks` : ''}
          </div>
        </button>
        <span
          className="invisible shrink-0 cursor-pointer font-mono text-ui-xs text-ink-500 hover:text-rose-400 group-hover:visible"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          del
        </span>
      </div>

      {isExpanded && tasks.data && tasks.data.length > 0 && (
        <div className="ml-4 border-l border-ink-800 pl-2">
          {tasks.data.map((t, i) => (
            <button
              key={t.id}
              onClick={() => onTaskSelect(t.id)}
              className={cn(
                'mt-0.5 flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors',
                focusedTaskId === t.id
                  ? 'bg-amber-950/30 border border-amber-800/40'
                  : 'border border-transparent hover:bg-ink-900/40',
              )}
            >
              <div className="flex w-full items-center gap-2">
                <span className="shrink-0 font-mono text-ui-xs text-ink-600">
                  #{tasks.data!.length - i}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-ui-xs text-ink-200">
                  {t.prompt}
                </span>
              </div>
              <div className="flex w-full items-center gap-2 pl-5">
                <StatusPill status={t.status} compact />
                <span className="font-mono text-ui-2xs text-ink-600">
                  {t.finishedAt
                    ? new Date(t.finishedAt).toLocaleTimeString([], { hour12: false })
                    : t.startedAt
                      ? 'running…'
                      : 'queued'}
                </span>
                {t.iterations > 0 && (
                  <span className="font-mono text-ui-2xs text-ink-600">
                    {t.iterations}/{t.maxIterations} iter
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SessionDetail({
  sessionId,
  focusedTaskId,
  onTaskFocus,
}: {
  sessionId: string;
  focusedTaskId: string | null;
  onTaskFocus: (id: string | null) => void;
}) {
  const utils = trpc.useUtils();
  const session = trpc.session.get.useQuery({ id: sessionId });
  const tasks = trpc.task.list.useQuery({ sessionId }, { refetchInterval: 2000 });
  const worktree = trpc.worktree.getForSession.useQuery({ sessionId });
  const openPath = trpc.worktree.openPath.useMutation();
  const [prompt, setPrompt] = useState('');
  const create = trpc.task.create.useMutation({
    onSuccess: async (t) => {
      await utils.task.list.invalidate({ sessionId });
      onTaskFocus(t.id);
      setPrompt('');
    },
  });

  useEffect(() => {
    if (!focusedTaskId && tasks.data?.length) onTaskFocus(tasks.data[0]!.id);
  }, [focusedTaskId, tasks.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 border-b border-ink-800 pb-3">
        <div className="font-serif text-2xl text-ink-50">{session.data?.title ?? '…'}</div>
        <div className="mt-1 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
          {session.data?.id} · {tasks.data?.length ?? 0} tasks
        </div>
        {worktree.data && (
          <div className="mt-2 flex items-center gap-3 font-mono text-ui-xs">
            <span className="text-ink-500">⎇</span>
            <span className="text-amber-400">{worktree.data.branch}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-ui-xs uppercase tracking-widest2 ${
                worktree.data.status === 'active'
                  ? 'bg-emerald-950/50 text-emerald-400'
                  : 'bg-ink-800 text-ink-500'
              }`}
            >
              {worktree.data.status}
            </span>
            <button
              className="max-w-xs truncate text-ink-500 hover:text-ink-300 hover:underline"
              title={`${worktree.data.path} (click to open)`}
              onClick={() => openPath.mutate({ path: worktree.data!.path })}
            >
              {worktree.data.path}
            </button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {focusedTaskId ? (
          <TaskView taskId={focusedTaskId} key={focusedTaskId} />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
            submit a prompt to begin
          </div>
        )}
      </div>

      <form
        className="mt-3 border-t border-ink-800 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!prompt.trim()) return;
          create.mutate({ sessionId, prompt: prompt.trim() });
        }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="describe the task… (⌘↩ to submit)"
          rows={3}
          className="w-full resize-none rounded border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-ui-base text-ink-100 placeholder:text-ink-600 focus:border-amber-700/60 focus:outline-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (prompt.trim()) create.mutate({ sessionId, prompt: prompt.trim() });
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
            planner → executor → tester → critic
          </span>
          <button
            type="submit"
            disabled={!prompt.trim() || create.isPending}
            className="rounded border border-amber-700/60 bg-amber-950/30 px-4 py-1.5 font-mono text-ui-sm uppercase tracking-widest2 text-amber-300 hover:bg-amber-950/60 disabled:opacity-40"
          >
            {create.isPending ? 'submitting…' : 'submit task'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface ApprovalReq {
  id: string;
  tool: string;
  args: unknown;
  ts: number;
}

interface UserInputReq {
  id: string;
  question: string;
  context?: string;
  choices?: string[];
  ts: number;
}

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

function TaskView({ taskId }: { taskId: string }) {
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
            { id: e.requestId, question: e.question, context: e.context, choices: e.choices, ts: e.ts },
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

  // If the DB already shows the task is done (e.g. app crashed without emitting
  // task.finished), clear any stale approval requests from the replay.
  useEffect(() => {
    if (finished) {
      setPendingApprovals([]);
      setPendingUserInputs([]);
    }
  }, [finished]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col flex-1">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
            event stream
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            {running && (
              <button
                onClick={() => cancel.mutate({ id: taskId })}
                className="rounded border border-rose-800/60 px-2 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 text-rose-300 hover:bg-rose-950/40"
              >
                cancel
              </button>
            )}
            {finished && (
              <>
                <button
                  onClick={() => exportReport.mutate({ id: taskId })}
                  disabled={exportReport.isPending}
                  className="rounded border border-ink-700 px-2 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-200 hover:border-ink-600 disabled:opacity-40"
                >
                  {exportReport.isPending ? 'exporting…' : 'export report'}
                </button>
                {status !== 'succeeded' && (
                  <button
                    onClick={() => retry.mutate({ id: taskId })}
                    disabled={retry.isPending}
                    className="rounded border border-amber-700/60 px-2 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 text-amber-300 hover:bg-amber-950/40 disabled:opacity-40"
                  >
                    retry
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div
          ref={logRef}
          className="flex-1 overflow-y-auto rounded border border-ink-800 bg-ink-950 p-3 font-mono text-ui-sm leading-snug"
        >
          {events.length === 0 && <div className="text-ink-500">waiting for events…</div>}
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
                    // Backend can't resolve (stale) — just remove from UI
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

function ApprovalModal({
  req,
  remaining,
  onDecide,
}: {
  req: ApprovalReq;
  remaining: number;
  onDecide: (d: 'approve' | 'approve_session' | 'deny') => void;
}) {
  const argsPretty = useMemo(() => {
    try {
      return JSON.stringify(req.args, null, 2);
    } catch {
      return String(req.args);
    }
  }, [req.args]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[560px] max-w-[90vw] rounded border border-amber-700/60 bg-ink-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <div>
            <div className="font-mono text-ui-xs uppercase tracking-widest2 text-amber-400">
              approval required{remaining > 0 ? ` · ${remaining} more queued` : ''}
            </div>
            <div className="font-serif text-lg text-ink-50">{req.tool}</div>
          </div>
          <div className="font-mono text-ui-xs text-ink-500">
            {new Date(req.ts).toLocaleTimeString([], { hour12: false })}
          </div>
        </div>
        <pre className="max-h-[40vh] overflow-y-auto px-4 py-3 font-mono text-ui-sm leading-snug text-ink-100">
          {argsPretty}
        </pre>
        <div className="flex items-center justify-end gap-2 border-t border-ink-800 px-4 py-3">
          <button
            onClick={() => onDecide('deny')}
            className="rounded border border-rose-800/60 px-3 py-1 font-mono text-ui-sm uppercase tracking-widest2 text-rose-300 hover:bg-rose-950/40"
          >
            deny
          </button>
          <button
            onClick={() => onDecide('approve_session')}
            className="rounded border border-ink-700 px-3 py-1 font-mono text-ui-sm uppercase tracking-widest2 text-ink-200 hover:bg-ink-900"
          >
            allow this task
          </button>
          <button
            onClick={() => onDecide('approve')}
            className="rounded border border-amber-700/60 bg-amber-950/30 px-3 py-1 font-mono text-ui-sm uppercase tracking-widest2 text-amber-300 hover:bg-amber-950/60"
          >
            approve once
          </button>
        </div>
      </div>
    </div>
  );
}

function UserInputModal({
  req,
  onSubmit,
  onDismiss,
}: {
  req: UserInputReq;
  onSubmit: (answer: string) => void;
  onDismiss: () => void;
}) {
  const [answer, setAnswer] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[560px] max-w-[90vw] rounded border border-sky-700/60 bg-ink-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <div>
            <div className="font-mono text-ui-xs uppercase tracking-widest2 text-sky-400">
              input requested
            </div>
            <div className="mt-1 font-serif text-lg text-ink-50">{req.question}</div>
          </div>
          <div className="font-mono text-ui-xs text-ink-500">
            {new Date(req.ts).toLocaleTimeString([], { hour12: false })}
          </div>
        </div>
        {req.context && (
          <div className="border-b border-ink-800 px-4 py-2 font-mono text-ui-sm text-ink-400">
            {req.context}
          </div>
        )}
        <form
          className="px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(answer);
          }}
        >
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="type your response…"
            rows={3}
            autoFocus
            className="w-full resize-none rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-ui-sm text-ink-100 placeholder:text-ink-600 focus:border-sky-700/60 focus:outline-none"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onSubmit(answer);
              }
            }}
          />
        </form>
        <div className="flex items-center justify-end gap-2 border-t border-ink-800 px-4 py-3">
          <button
            onClick={onDismiss}
            className="rounded border border-ink-700 px-3 py-1 font-mono text-ui-sm uppercase tracking-widest2 text-ink-300 hover:bg-ink-900"
          >
            skip
          </button>
          <button
            onClick={() => onSubmit(answer)}
            disabled={!answer.trim()}
            className="rounded border border-sky-700/60 bg-sky-950/30 px-3 py-1 font-mono text-ui-sm uppercase tracking-widest2 text-sky-300 hover:bg-sky-950/60 disabled:opacity-40"
          >
            send
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status, compact }: { status: string; compact?: boolean }) {
  const palette: Record<string, string> = {
    queued: 'border-ink-700 text-ink-300',
    running: 'border-amber-700/60 text-amber-300',
    succeeded: 'border-emerald-700/60 text-emerald-300',
    failed: 'border-rose-800/60 text-rose-300',
    cancelled: 'border-ink-700 text-ink-400',
  };
  return (
    <span
      className={cn(
        'rounded border font-mono !text-ui-xs uppercase tracking-widest2',
        compact ? 'px-1.5 py-0' : 'px-2 py-0.5',
        palette[status] ?? 'border-ink-700 text-ink-400',
      )}
    >
      {status}
    </span>
  );
}

function EventRow({ ev }: { ev: TaskEvent }) {
  const t = new Date(ev.ts).toLocaleTimeString([], { hour12: false });

  switch (ev.type) {
    case 'task.started':
      return <Line ts={t} tone="amber">▶ task started</Line>;
    case 'task.finished':
      return (
        <Line
          ts={t}
          tone={ev.status === 'succeeded' ? 'emerald' : ev.status === 'cancelled' ? 'ink' : 'rose'}
        >
          ■ task {ev.status}
          {ev.error ? ` · ${ev.error.slice(0, 200)}` : ''}
        </Line>
      );
    case 'plan':
      return (
        <div className="my-1 rounded border border-ink-800 bg-ink-900/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-ui-xs text-ink-600">{t}</span>
            <span className="font-mono text-ui-xs uppercase tracking-widest2 text-amber-400">▣ plan</span>
          </div>
          <div className="mt-1 font-serif text-ui-sm italic text-ink-200">{ev.plan.summary}</div>
          {ev.plan.selectedSkills && ev.plan.selectedSkills.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {ev.plan.selectedSkills.map((s) => (
                <span
                  key={s}
                  className="rounded border border-amber-700/60 bg-amber-950/20 px-1.5 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-amber-300"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          <ol className="mt-1 space-y-0.5 font-mono text-ui-xs">
            {ev.plan.steps.map((s, i) => (
              <li key={s.id} className="text-ink-300">
                <span className="text-ink-500">{i + 1}.</span> {s.goal}
              </li>
            ))}
          </ol>
        </div>
      );
    case 'step.started':
      return (
        <Line ts={t} tone="ink">
          → {ev.agent}
          {ev.tool ? `:${ev.tool}` : ''}
        </Line>
      );
    case 'step.finished':
      return (
        <Line ts={t} tone={ev.ok ? 'ink' : 'rose'}>
          ← step {ev.ok ? 'ok' : `fail · ${(ev.error ?? '').slice(0, 200)}`}
        </Line>
      );
    case 'log':
      return (
        <Line ts={t} tone={ev.stream === 'stderr' ? 'rose' : 'ink'} dim>
          {ev.text.replace(/\n+$/, '')}
        </Line>
      );
    case 'critic':
      return (
        <div className="my-1 rounded border border-ink-800 bg-ink-900/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-ui-xs text-ink-600">{t}</span>
            <span className={cn('font-mono text-ui-xs uppercase tracking-widest2', ev.verdict.done ? 'text-emerald-400' : 'text-amber-400')}>
              ⚖ {ev.verdict.done ? 'done' : 'continue'}
            </span>
          </div>
          <div className="mt-1 font-mono text-ui-xs text-ink-300">{ev.verdict.reason}</div>
          {ev.verdict.nextHint && (
            <div className="mt-0.5 font-mono text-ui-xs text-ink-500">hint: {ev.verdict.nextHint}</div>
          )}
        </div>
      );
    case 'approval.requested':
      return (
        <Line ts={t} tone="amber">
          ⚑ approval requested · {ev.tool}
        </Line>
      );
    case 'approval.decided':
      return (
        <Line ts={t} tone={ev.decision === 'deny' ? 'rose' : 'emerald'}>
          ⚐ approval {ev.decision}
        </Line>
      );
    case 'llm.delta':
      return (
        <Line ts={t} tone="emerald" dim>
          {ev.content}
        </Line>
      );
    case 'llm.thinking_delta':
      return (
        <Line ts={t} tone="purple" dim>
          💭 {ev.content}
        </Line>
      );
    case 'task.iteration':
      return (
        <Line ts={t} tone="amber">
          ↻ iteration {ev.iteration}
        </Line>
      );
    case 'user_input.requested':
      return (
        <Line ts={t} tone="sky">
          ✋ question: {ev.question}
        </Line>
      );
    case 'user_input.responded':
      return (
        <Line ts={t} tone="sky">
          ✓ answered: {ev.answer || '(skipped)'}
        </Line>
      );
    default:
      return null;
  }
}

function Line({
  ts,
  tone,
  dim,
  children,
}: {
  ts: string;
  tone: 'amber' | 'emerald' | 'rose' | 'ink' | 'purple' | 'sky';
  dim?: boolean;
  children: React.ReactNode;
}) {
  const colour = {
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    purple: dim ? 'text-purple-400' : 'text-purple-300',
    ink: dim ? 'text-ink-400' : 'text-ink-200',
    sky: 'text-sky-300',
  }[tone];
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3">
      <span className="shrink-0 select-none font-mono text-ui-xs text-ink-600">{ts}</span>
      <span className={cn('min-w-0 whitespace-pre-wrap break-words', colour)}>{children}</span>
    </div>
  );
}
