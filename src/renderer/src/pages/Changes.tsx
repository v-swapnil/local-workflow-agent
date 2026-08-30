import { useState } from 'react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { FileDiffPanel } from '@renderer/components/changes/FileDiffPanel';
import { ChangesSidebar } from '@renderer/components/changes/ChangesSidebar';
import { ActiveChange } from '@renderer/components/changes/types';

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <div className="max-w-md rounded-lg border border-dashed border-ink-700/50 bg-ink-900/20 px-8 py-10">
        <div className="font-mono text-ui-sm text-ink-400">{children}</div>
      </div>
    </div>
  );
}

function DiffPanel({
  workspaceId,
  active,
  setActive,
}: {
  workspaceId: number;
  active: ActiveChange | null;
  setActive: (change: ActiveChange | null) => void;
}) {
  const status = trpc.git.status.useQuery({ workspaceId }, { refetchInterval: 5000 });

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col gap-4 p-2 border-r border-ink-800/40 bg-ink-900/15">
          {status.data && !status.data.isRepo ? (
            <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">Not a git repository</div>
          ) : status.data?.clean ? (
            <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">
              Working tree clean - no changes
            </div>
          ) : (
            <ChangesSidebar workspaceId={workspaceId} active={active} setActive={setActive} />
          )}
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          {status.data && !status.data.isRepo ? (
            <Empty>not a git repository</Empty>
          ) : status.data?.clean ? (
            <Empty>working tree clean - no changes</Empty>
          ) : active ? (
            <FileDiffPanel workspaceId={workspaceId} activePath={active.path} />
          ) : (
            <Empty>select a file to view changes.</Empty>
          )}
        </section>
      </div>
    </div>
  );
}

export function Changes() {
  const { workspaceId, isLoading } = useActiveWorkspace();
  const [active, setActive] = useState<ActiveChange | null>(null);

  if (isLoading) {
    return <Empty>loading workspace…</Empty>;
  }
  if (!workspaceId) {
    return (
      <Empty>
        no workspace selected. open the workspace switcher in the top-right to create or open one.
      </Empty>
    );
  }

  return <DiffPanel workspaceId={workspaceId} active={active} setActive={setActive} />;
}
