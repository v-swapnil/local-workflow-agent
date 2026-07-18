import { trpc } from '../../trpc';
import { Button } from '../ui/button';

const TYPE_COLORS: Record<string, string> = {
  semantic: 'bg-sky-500/10 text-sky-400',
  episodic: 'bg-violet-500/10 text-violet-400',
  procedural: 'bg-emerald-500/10 text-emerald-400',
  preference: 'bg-amber/10 text-amber',
  fact: 'bg-ink-800/50 text-ink-300',
  summary: 'bg-rose-500/10 text-rose-400',
  observation: 'bg-ink-800/50 text-ink-400',
};

export function MemorySection({ workspaceId }: { workspaceId: string }) {
  const utils = trpc.useUtils();
  const memories = trpc.workspace.memories.useQuery({ workspaceId });
  const deleteMemory = trpc.workspace.deleteMemory.useMutation({
    onSuccess: () => utils.workspace.memories.invalidate({ workspaceId }),
  });

  return (
    <section className="rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
          memories
        </h2>
        <div className="font-mono text-ui-2xs text-ink-600">{memories.data?.length ?? 0} total</div>
      </div>

      {memories.isLoading && <div className="font-mono text-ui-sm text-ink-500">loading...</div>}

      {!memories.isLoading && memories.data?.length === 0 && (
        <div className="font-mono text-ui-sm text-ink-500">no workspace memories yet.</div>
      )}

      {memories.data && memories.data.length > 0 && (
        <div className="space-y-1 overflow-hidden rounded-lg border border-ink-800/40">
          {memories.data.map((m, i) => (
            <div
              key={m.id}
              className={`grid grid-cols-[1fr_auto] items-start gap-4 px-4 py-3 ${
                i ? 'border-t border-ink-800/30' : ''
              }`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 ${
                      TYPE_COLORS[m.type] ?? 'bg-ink-800/50 text-ink-400'
                    }`}
                  >
                    {m.type}
                  </span>
                  <span className="font-mono text-ui-2xs text-ink-600">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="whitespace-pre-wrap font-mono text-ui-xs text-ink-300">
                  {m.content}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <Button
                  variant="danger"
                  size="xs"
                  onClick={() => {
                    if (confirm('Delete this memory?')) deleteMemory.mutate({ id: m.id });
                  }}
                  disabled={deleteMemory.isPending}
                >
                  delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
