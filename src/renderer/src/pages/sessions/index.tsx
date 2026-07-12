import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '../../trpc';
import { useActiveWorkspace } from '../../hooks/useActiveWorkspace';
import { SessionTreeNode } from './SessionTreeNode';
import { SessionDetail } from './SessionDetail';
import { Button } from '../../components/ui/button';
import { Plus, SquarePlus, MessageCircle } from 'lucide-react';

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
      <aside className="flex flex-col border-r border-ink-800/60 bg-ink-900/20 group/sidebar">
        {!workspaceId && (
          <div className="px-4 py-6 text-center font-mono text-ui-sm text-ink-500">
            no active workspace
          </div>
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
              <SquarePlus className="h-8 w-8 text-ink-700" strokeWidth={1} />
              <div className="font-mono text-ui-xs text-ink-500">no sessions yet</div>
              <div className="font-mono text-ui-2xs text-ink-600">click "new" to start</div>
            </div>
          )}

          <Button
            variant="outline"
            size="xs"
            className="flex invisible !mt-2 group-hover/sidebar:visible items-center w-full border-dashed gap-1.5 py-4 font-mono hover:border-amber/30 hover:bg-amber/8 hover:text-amber"
            disabled={!workspaceId || create.isPending}
            onClick={() =>
              create.mutate({
                workspaceId: workspaceId!,
                title: `session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              })
            }
          >
            <Plus className="h-3 w-3" strokeWidth={1.5} />
            new session
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden p-5">
        {sessionId ? (
          <SessionDetail
            sessionId={sessionId}
            key={sessionId}
            focusedTaskId={focusedTaskId}
            onTaskFocus={setFocusedTaskId}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <MessageCircle className="h-10 w-10 text-ink-700" strokeWidth={1} />
            <div className="font-mono text-ui-xs text-ink-500">select or create a session</div>
          </div>
        )}
      </main>
    </div>
  );
}
