import { trpc } from '../../trpc';

export function WorkspaceOverview({ workspaceId }: { workspaceId: string }) {
  const ws = trpc.workspace.get.useQuery({ id: workspaceId });

  return (
    <section className="rounded-lg border border-ink-800/60 bg-ink-900/20 px-5 py-4">
      <div className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
        workspace
      </div>
      <div className="mt-0.5 font-serif text-lg text-ink-100">
        {ws.data?.name ?? '—'}
        <span className="ml-2 font-mono text-ui-xs text-ink-500">{ws.data?.path}</span>
      </div>
    </section>
  );
}
