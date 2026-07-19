import { useEffect, useState } from 'react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import type { ActiveChange } from '../components/changes/changeUtils';
import { UnifiedDiffPanel } from '@renderer/components/changes/UnifiedDiffPanel';
import { CustomSelect } from '@renderer/components/CustomSelect';
import { ChangesSidebar } from '@renderer/components/changes/ChangesSidebar';

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
  workspaceId: string;
  worktreeId?: string;
  active: ActiveChange | null;
  setActive: (change: ActiveChange | null) => void;
}) {
  const [worktreeId, setWorktreeId] = useState<string>('');

  const status = trpc.git.status.useQuery({ workspaceId, worktreeId }, { refetchInterval: 5000 });
  const worktrees = trpc.worktree.list.useQuery();

  useEffect(() => {
    const activeIds = new Set(
      (worktrees.data ?? []).filter((w) => w.status === 'active').map((w) => w.id),
    );
    if (worktreeId && !activeIds.has(worktreeId)) setWorktreeId('');
  }, [worktreeId, worktrees.data]);

  const worktreeOptions = [
    { label: 'workspace root', value: '__root__' },
    ...(worktrees.data ?? [])
      .filter((w) => w.status === 'active')
      .map((w) => ({ label: w.branch, value: w.id })),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col gap-4 p-2 border-r border-ink-800/40 bg-ink-900/15">
          <CustomSelect
            placeholder="Select a worktree"
            value={worktreeId || '__root__'}
            onChange={(v) => {
              setWorktreeId(v === '__root__' ? '' : v);
              setActive(null);
            }}
            options={worktreeOptions}
          />

          {status.data && !status.data.isRepo ? (
            <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">Not a git repository</div>
          ) : status.data?.clean ? (
            <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">
              Working tree clean - no changes
            </div>
          ) : (
            <ChangesSidebar
              workspaceId={workspaceId}
              worktreeId={worktreeId}
              active={active}
              setActive={setActive}
            />
          )}
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          {status.data && !status.data.isRepo ? (
            <Empty>not a git repository</Empty>
          ) : status.data?.clean ? (
            <Empty>working tree clean - no changes</Empty>
          ) : active ? (
            <UnifiedDiffPanel
              workspaceId={workspaceId}
              worktreeId={worktreeId}
              staged={active.staged}
              activePath={active.path}
            />
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
