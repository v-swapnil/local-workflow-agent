import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '../../trpc';
import { useActiveWorkspace } from '../../hooks/useActiveWorkspace';
import { SessionTreeNode } from './SessionTreeNode';
import { SessionDetail } from './SessionDetail';

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
    <div className="grid h-full grid-cols-[320px_1fr] gap-0 animate-fade-in">
      {/* Sidebar */}
      <aside className="flex flex-col border-r border-ink-800/60 bg-ink-900/20">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800/40">
          <h2 className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">Sessions</h2>
          <button
            className="flex items-center gap-1.5 rounded-md border border-ink-700/50 bg-ink-800/40 px-2.5 py-1.5 font-mono text-ui-xs text-ink-300 transition-all hover:border-amber/30 hover:bg-amber/8 hover:text-amber disabled:opacity-40"
            disabled={!workspaceId || create.isPending}
            onClick={() =>
              create.mutate({
                workspaceId: workspaceId!,
                title: `session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              })
            }
          >
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
              <path d="M6 2v8M2 6h8" />
            </svg>
            new
          </button>
        </div>

        {!workspaceId && (
          <div className="px-4 py-6 text-center font-mono text-ui-sm text-ink-500">no active workspace</div>
        )}

        <div className="flex-1 space-y-px overflow-y-auto px-2 py-2">
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
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="h-8 w-8 text-ink-700">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M8 12h8M12 8v8" strokeWidth="1.5" />
              </svg>
              <div className="font-mono text-ui-xs text-ink-500">no sessions yet</div>
              <div className="font-mono text-ui-2xs text-ink-600">click "new" to start</div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 p-5">
        {sessionId ? (
          <SessionDetail
            sessionId={sessionId}
            key={sessionId}
            focusedTaskId={focusedTaskId}
            onTaskFocus={setFocusedTaskId}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="h-10 w-10 text-ink-700">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div className="font-mono text-ui-xs text-ink-500">select or create a session</div>
          </div>
        )}
      </main>
    </div>
  );
}
