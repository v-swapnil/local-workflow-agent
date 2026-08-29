import { trpc } from '../../trpc';
import { UniversalSearch } from './UniversalSearch';

interface WorkspaceOverviewProps {
  workspaceId: number;
  onOpenFile: (path: string) => void;
}

export const WorkspaceOverview = ({ workspaceId, onOpenFile }: WorkspaceOverviewProps) => {
  const workspace = trpc.workspace.get.useQuery({ id: workspaceId });

  return (
    <section className="flex items-center justify-between gap-4 rounded-lg border border-ink-800/60 bg-ink-900/20 px-5 py-4">
      <div className="min-w-0">
        <div className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
          workspace
        </div>
        <div className="mt-0.5 font-serif text-lg text-ink-100">
          {workspace.data?.name ?? '—'}
          <span className="ml-2 font-mono text-ui-xs text-ink-500">{workspace.data?.path}</span>
        </div>
      </div>

      <div className="shrink-0">
        <UniversalSearch workspaceId={workspaceId} onOpenFile={onOpenFile} />
      </div>
    </section>
  );
};
