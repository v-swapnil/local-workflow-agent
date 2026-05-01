import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { cn } from '../lib/utils';
import { useUI } from '../store/ui';

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
  const create = trpc.session.create.useMutation({
    onSuccess: async (s) => {
      await utils.session.list.invalidate();
      setSessionId(s.id);
    },
  });
  const del = trpc.session.delete.useMutation({
    onSuccess: async () => {
      await utils.session.list.invalidate();
      setSessionId(null);
    },
  });

  useEffect(() => {
    // Clear the ?id= param after consuming it so it doesn't stick around
    if (searchParams.has('id')) {
      searchParams.delete('id');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionId && sessionsQ.data?.length) setSessionId(sessionsQ.data[0]!.id);
  }, [sessionId, sessionsQ.data]);

  return (
    <div className="grid h-full grid-cols-[260px_1fr] gap-6 p-6">
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

        <div className="flex-1 space-y-1 overflow-y-auto">
          {sessionsQ.data?.map((s) => (
            <button
              key={s.id}
              onClick={() => setSessionId(s.id)}
              className={cn(
                'group flex w-full items-start justify-between rounded border px-3 py-2 text-left transition-colors',
                sessionId === s.id
                  ? 'border-amber-700/60 bg-amber-950/20'
                  : 'border-ink-800 bg-ink-900/30 hover:border-ink-700',
              )}
            >
              <div className="min-w-0">
                <div className="truncate font-serif text-ui-lg text-ink-50">{s.title}</div>
                <div className="mt-0.5 font-mono text-ui-xs text-ink-500">
                  {new Date(s.updatedAt).toLocaleString()}
                </div>
              </div>
              <span
                className="invisible ml-2 cursor-pointer font-mono text-ui-xs text-ink-500 hover:text-rose-400 group-hover:visible"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete session "${s.title}"?`)) del.mutate({ id: s.id });
                }}
              >
                del
              </span>
            </button>
          ))}
          {sessionsQ.data?.length === 0 && (
            <div className="font-mono text-ui-sm text-ink-500">no sessions yet</div>
          )}
        </div>
      </aside>

      <main className="min-w-0">
        {sessionId ? (
          <SessionDetail sessionId={sessionId} key={sessionId} />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
            select or create a session
          </div>
        )}
      </main>
    </div>
  );
}

function SessionDetail({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();
  const session = trpc.session.get.useQuery({ id: sessionId });
  const tasks = trpc.task.list.useQuery({ sessionId }, { refetchInterval: 2000 });
  const [prompt, setPrompt] = useState('');
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const create = trpc.task.create.useMutation({
    onSuccess: async (t) => {
      await utils.task.list.invalidate({ sessionId });
      setFocusedTaskId(t.id);
      setPrompt('');
    },
  });

  useEffect(() => {
    if (!focusedTaskId && tasks.data?.length) setFocusedTaskId(tasks.data[0]!.id);
  }, [focusedTaskId, tasks.data]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 border-b border-ink-800 pb-3">
        <div className="font-serif text-2xl text-ink-50">{session.data?.title ?? '…'}</div>
        <div className="mt-1 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
          {session.data?.id} · {tasks.data?.length ?? 0} tasks
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr] gap-4 overflow-hidden">
        <aside className="flex min-h-0 flex-col">
          <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
            tasks
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto">
            {tasks.data?.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setFocusedTaskId(t.id)}
                className={cn(
                  'flex w-full flex-col rounded border px-2 py-1.5 text-left',
                  focusedTaskId === t.id
                    ? 'border-amber-700/60 bg-amber-950/20'
                    : 'border-ink-800 bg-ink-900/30 hover:border-ink-700',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-ui-xs text-ink-500">
                    #{tasks.data!.length - i}
                  </span>
                  <StatusPill status={t.status} compact />
                </div>
                <div className="mt-1 line-clamp-2 font-serif text-ui-sm text-ink-100">
                  {t.prompt}
                </div>
              </button>
            ))}
            {tasks.data?.length === 0 && (
              <div className="font-mono text-ui-sm text-ink-500">no tasks yet</div>
            )}
          </div>
        </aside>

        <div className="min-h-0 min-w-0">
          {focusedTaskId ? (
            <TaskView taskId={focusedTaskId} key={focusedTaskId} />
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
              submit a prompt to begin
            </div>
          )}
        </div>
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

const getEvents = (previousEvents: TaskEvent[], currentEvent: TaskEvent) => {
  const lastEvent = previousEvents[previousEvents.length - 1];
  if (lastEvent?.type === 'llm.delta' && currentEvent.type === 'llm.delta') {
    return previousEvents
      .slice(0, -1)
      .concat({ ...lastEvent, content: lastEvent.content + currentEvent.content });
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

  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalReq[]>([]);
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
        } else if (e.type === 'task.finished') {
          setPendingApprovals([]);
        }
      },
    },
  );

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [events.length]);

  const plan = useMemo(() => {
    const ev = [...events].reverse().find((e) => e.type === 'plan');
    return ev?.type === 'plan' ? ev.plan : null;
  }, [events]);

  const verdict = useMemo(() => {
    const ev = [...events].reverse().find((e) => e.type === 'critic');
    return ev?.type === 'critic' ? ev.verdict : null;
  }, [events]);

  const status = task.data?.status ?? 'queued';
  const running = status === 'running' || status === 'queued';
  const finished = status === 'succeeded' || status === 'failed' || status === 'cancelled';

  // If the DB already shows the task is done (e.g. app crashed without emitting
  // task.finished), clear any stale approval requests from the replay.
  useEffect(() => {
    if (finished) {
      setPendingApprovals([]);
    }
  }, [finished]);

  // Refresh git diff when files likely changed.
  const fileTouched = useMemo(() => {
    return events.filter(
      (e) => e.type === 'step.finished' || (e.type === 'log' && e.text.startsWith('[git]')),
    ).length;
  }, [events]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_320px] gap-4 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col">
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
                <button
                  onClick={() => retry.mutate({ id: taskId })}
                  disabled={retry.isPending}
                  className="rounded border border-amber-700/60 px-2 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 text-amber-300 hover:bg-amber-950/40 disabled:opacity-40"
                >
                  retry
                </button>
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

      <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        <Panel title="plan">
          {plan ? (
            <div>
              <div className="mb-2 font-serif text-ui-lg italic text-ink-200">{plan.summary}</div>
              {plan.selectedSkills && plan.selectedSkills.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {plan.selectedSkills.map((s) => (
                    <span
                      key={s}
                      className="rounded border border-amber-700/60 bg-amber-950/20 px-1.5 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-amber-300"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
              <ol className="space-y-1 font-mono text-ui-sm">
                {plan.steps.map((s, i) => (
                  <li key={s.id} className="text-ink-200">
                    <span className="text-ink-500">{i + 1}.</span> {s.goal}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="font-mono text-ui-sm text-ink-500">awaiting plan…</div>
          )}
        </Panel>
        <Panel title="verdict">
          {verdict ? (
            <div className="space-y-1 font-mono text-ui-sm">
              <div className={verdict.done ? 'text-emerald-400' : 'text-amber-400'}>
                {verdict.done ? '✔ done' : '↻ continue'}
              </div>
              <DiffPanel touchedKey={fileTouched} />
              <div className="text-ink-300">{verdict.reason}</div>
              {verdict.nextHint && <div className="text-ink-500">hint: {verdict.nextHint}</div>}
            </div>
          ) : (
            <div className="font-mono text-ui-sm text-ink-500">no verdict yet</div>
          )}
        </Panel>
      </aside>

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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-ink-800 bg-ink-900/40 p-3">
      <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
        {title}
      </div>
      {children}
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
  const ts = <span className="text-ink-600">{t}</span>;

  switch (ev.type) {
    case 'task.started':
      return <Line tone="amber">{ts} ▶ task started</Line>;
    case 'task.finished':
      return (
        <Line
          tone={ev.status === 'succeeded' ? 'emerald' : ev.status === 'cancelled' ? 'ink' : 'rose'}
        >
          {ts} ■ task {ev.status}
          {ev.error ? ` · ${ev.error.slice(0, 200)}` : ''}
        </Line>
      );
    case 'plan':
      return (
        <Line tone="ink">
          {ts} ▣ plan: {ev.plan.summary}
        </Line>
      );
    case 'step.started':
      return (
        <Line tone="ink">
          {ts} → {ev.agent}
          {ev.tool ? `:${ev.tool}` : ''}
        </Line>
      );
    case 'step.finished':
      return (
        <Line tone={ev.ok ? 'ink' : 'rose'}>
          {ts} ← step {ev.ok ? 'ok' : `fail · ${(ev.error ?? '').slice(0, 200)}`}
        </Line>
      );
    case 'log':
      return (
        <Line tone={ev.stream === 'stderr' ? 'rose' : 'ink'} dim>
          {ts} {ev.text.replace(/\n+$/, '')}
        </Line>
      );
    case 'critic':
      return (
        <Line tone={ev.verdict.done ? 'emerald' : 'amber'}>
          {ts} ⚖ critic: {ev.verdict.reason}
        </Line>
      );
    case 'approval.requested':
      return (
        <Line tone="amber">
          {ts} ⚑ approval requested · {ev.tool}
        </Line>
      );
    case 'approval.decided':
      return (
        <Line tone={ev.decision === 'deny' ? 'rose' : 'emerald'}>
          {ts} ⚐ approval {ev.decision}
        </Line>
      );
    case 'llm.delta':
      return (
        <Line tone="emerald" dim>
          {ts} ← {ev.content}
        </Line>
      );
    case 'task.iteration':
      return (
        <Line tone="amber">
          {ts} ↻ iteration {ev.iteration}
        </Line>
      );
    default:
      return null;
  }
}

function Line({
  tone,
  dim,
  children,
}: {
  tone: 'amber' | 'emerald' | 'rose' | 'ink';
  dim?: boolean;
  children: React.ReactNode;
}) {
  const colour = {
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    ink: dim ? 'text-ink-400' : 'text-ink-200',
  }[tone];
  return <div className={cn('whitespace-pre-wrap', colour)}>{children}</div>;
}

function DiffPanel({ touchedKey }: { touchedKey: number }) {
  const { workspaceId } = useActiveWorkspace();
  const theme = useUI((s) => s.theme);
  const status = trpc.git.status.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );
  const diff = trpc.git.diff.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  // Refetch when files likely changed.
  useEffect(() => {
    if (!workspaceId) return;
    status.refetch();
    diff.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchedKey, workspaceId]);

  if (!workspaceId) {
    return (
      <Panel title="git diff">
        <div className="font-mono text-ui-sm text-ink-500">no workspace</div>
      </Panel>
    );
  }

  const s = status.data;
  if (!s?.isRepo) {
    return (
      <Panel title="git diff">
        <div className="font-mono text-ui-sm text-ink-500">
          not a git repo — toggle <span className="text-ink-300">auto-branch per task</span> in
          Settings to initialise on next run.
        </div>
      </Panel>
    );
  }

  const text = diff.data?.unifiedDiff ?? '';

  return (
    <Panel title="git diff">
      <div className="mb-2 flex items-center justify-between font-mono text-ui-xs uppercase tracking-widest2">
        <span className="text-ink-300">
          branch: <span className="text-amber-300">{s.branch ?? '—'}</span>
        </span>
        <span className="text-ink-500">
          {s.modified.length}M · {s.not_added.length}? · {s.staged.length}S
        </span>
      </div>
      {text.trim() ? (
        <div className="h-[260px] overflow-hidden rounded border border-ink-800">
          <Editor
            value={text}
            language="diff"
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 11,
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              wordWrap: 'on',
              renderWhitespace: 'none',
              folding: false,
            }}
          />
        </div>
      ) : (
        <div className="font-mono text-ui-sm text-ink-500">working tree clean</div>
      )}
    </Panel>
  );
}
