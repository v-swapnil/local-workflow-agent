import { useNavigate } from 'react-router-dom';
import { trpc } from '../../trpc';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

export function WorktreeSection({ workspaceId }: { workspaceId: string }) {
  void workspaceId; // worktree.list is scoped to the active workspace server-side
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const worktrees = trpc.worktree.list.useQuery(undefined, { refetchInterval: 5000 });
  const remove = trpc.worktree.remove.useMutation({
    onSuccess: () => utils.worktree.list.invalidate(),
  });

  const active = worktrees.data?.filter((w) => w.status === 'active') ?? [];
  const removed = worktrees.data?.filter((w) => w.status === 'removed') ?? [];

  return (
    <section className="rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
          worktrees
        </h2>
        <div className="font-mono text-ui-2xs text-ink-600">
          {active.length} active · {removed.length} removed
        </div>
      </div>

      {worktrees.isLoading && (
        <div className="font-mono text-ui-sm text-ink-500">loading...</div>
      )}

      {!worktrees.isLoading && worktrees.data?.length === 0 && (
        <div className="font-mono text-ui-sm text-ink-500">
          no worktrees yet — enable "Use worktrees" in Settings → Git
        </div>
      )}

      {worktrees.data && worktrees.data.length > 0 && (
        <div className="space-y-1 overflow-hidden rounded-lg border border-ink-800/40">
          {worktrees.data.map((w, i) => (
            <div
              key={w.id}
              className={cn(
                'grid grid-cols-[1fr_auto] items-start gap-4 px-4 py-3',
                i ? 'border-t border-ink-800/30' : '',
                w.status === 'removed' ? 'opacity-50' : '',
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-ui-xs text-ink-500">⎇</span>
                  <span className="font-mono text-ui-xs text-amber">{w.branch}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 ${
                      w.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-ink-800/50 text-ink-500'
                    }`}
                  >
                    {w.status}
                  </span>
                </div>
                <div className="truncate font-mono text-ui-xs text-ink-400" title={w.path}>
                  {w.path}
                </div>
                <div className="font-mono text-ui-xs text-ink-600">
                  base: {w.baseBranch} @ {w.baseCommit.slice(0, 8)} ·{' '}
                  {w.sessionId ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-auto p-0 text-amber font-mono text-ui-xs"
                      onClick={() => navigate(`/sessions?id=${w.sessionId}`)}
                    >
                      session {w.sessionId}
                    </Button>
                  ) : (
                    <span className="text-amber/60">orphaned</span>
                  )}{' '}
                  · {new Date(w.createdAt).toLocaleString()}
                </div>
              </div>

              {w.status === 'active' && (
                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => {
                      if (confirm(`Delete worktree "${w.branch}"?`)) remove.mutate({ id: w.id });
                    }}
                    disabled={remove.isPending}
                  >
                    delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
