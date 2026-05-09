import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { trpc } from '../trpc';
import { cn } from '../lib/utils';

export function Worktrees() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const worktrees = trpc.worktree.list.useQuery(undefined, { refetchInterval: 5000 });
  const remove = trpc.worktree.remove.useMutation({
    onSuccess: () => utils.worktree.list.invalidate(),
  });
  const del = trpc.worktree.delete.useMutation({
    onSuccess: () => utils.worktree.list.invalidate(),
  });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const active = worktrees.data?.filter((w) => w.status === 'active') ?? [];
  const removed = worktrees.data?.filter((w) => w.status === 'removed') ?? [];

  const handleDeleteAll = () => {
    if (!confirm('Delete all removed worktrees from the database?')) return;
    for (const w of removed) {
      del.mutate({ id: w.id });
    }
  };

  return (
    <PageShell
      path="worktrees"
      title="Worktrees"
      subtitle="Git worktrees created per session for isolated task execution."
    >
      {worktrees.isLoading && (
        <div className="font-mono text-ui-sm text-ink-500">loading…</div>
      )}

      {!worktrees.isLoading && worktrees.data?.length === 0 && (
        <div className="font-mono text-ui-sm text-ink-500">
          no worktrees yet — enable "Use worktrees" in Settings → Git
        </div>
      )}

      {worktrees.data && worktrees.data.length > 0 && (
        <div className="space-y-1 overflow-hidden rounded border border-ink-800">
          {worktrees.data.map((w, i) => (
            <div
              key={w.id}
              className={cn(
                'grid grid-cols-[1fr_auto] items-start gap-4 px-4 py-3',
                i ? 'border-t border-ink-800' : '',
                w.status === 'removed' ? 'opacity-50' : '',
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-ui-xs text-ink-500">⎇</span>
                  <span className="font-mono text-ui-sm text-amber-400">{w.branch}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 ${
                      w.status === 'active'
                        ? 'bg-emerald-950/50 text-emerald-400'
                        : 'bg-ink-800 text-ink-500'
                    }`}
                  >
                    {w.status}
                  </span>
                </div>
                <div
                  className="truncate font-mono text-ui-xs text-ink-400"
                  title={w.path}
                >
                  {w.path}
                </div>
                <div className="font-mono text-ui-xs text-ink-600">
                  base: {w.baseBranch} @ {w.baseCommit.slice(0, 8)} ·{' '}
                  {w.sessionId ? (
                    <button
                      className="text-amber-400 hover:underline"
                      onClick={() => navigate(`/sessions?id=${w.sessionId}`)}
                    >
                      session {w.sessionId}
                    </button>
                  ) : (
                    <span className="text-amber-600">orphaned</span>
                  )}{' '}
                  · {new Date(w.createdAt).toLocaleString()}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                {w.status === 'active' && (
                  <button
                    onClick={() => {
                      if (confirm(`Remove worktree "${w.branch}"?`)) remove.mutate({ id: w.id });
                    }}
                    disabled={remove.isPending}
                    className="rounded border border-ink-700 px-2 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-300 hover:border-rose-500 hover:text-rose-400 disabled:opacity-40"
                  >
                    remove
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirmId === w.id) {
                      del.mutate({ id: w.id });
                      setConfirmId(null);
                    } else {
                      setConfirmId(w.id);
                    }
                  }}
                  disabled={del.isPending}
                  className={cn(
                    'rounded border px-2 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 disabled:opacity-40',
                    confirmId === w.id
                      ? 'border-rose-600 bg-rose-950/30 text-rose-400'
                      : 'border-ink-700 text-ink-400 hover:border-rose-500 hover:text-rose-400',
                  )}
                >
                  {confirmId === w.id ? 'confirm?' : 'delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {removed.length > 0 && (
        <div className="mt-4">
          <button
            onClick={handleDeleteAll}
            disabled={del.isPending}
            className="rounded border border-ink-700 px-3 py-1.5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400 hover:border-rose-500 hover:text-rose-400 disabled:opacity-40"
          >
            delete all removed ({removed.length})
          </button>
        </div>
      )}

      <div className="mt-6">
        <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-600">
          {active.length} active · {removed.length} removed · {worktrees.data?.length ?? 0} total
        </div>
      </div>
    </PageShell>
  );
}
