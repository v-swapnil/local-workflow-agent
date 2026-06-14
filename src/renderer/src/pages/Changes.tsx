import { useEffect, useState } from 'react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { CommitPanel } from '../components/changes/CommitPanel';
import { PrSection } from '../components/changes/PrSection';
import { ChangedFileList } from '../components/changes/ChangedFileList';
import { DiffPanelEditor } from '../components/changes/DiffPanelEditor';
import { useChangedFiles } from '../components/changes/useChangedFiles';
import type { ActiveChange } from '../components/changes/changeUtils';
import { summarizeWorking } from '../components/changes/changeUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Button } from '@renderer/components/ui/button';
import { Minus, Plus } from 'lucide-react';

function SectionHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`border-b border-ink-800/40 px-3 py-2 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500 flex items-center justify-between ${className}`}
    >
      {children}
    </div>
  );
}

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

  const utils = trpc.useUtils();
  const status = trpc.git.status.useQuery({ workspaceId, worktreeId }, { refetchInterval: 5000 });

  const workspace = trpc.workspace.get.useQuery({ id: workspaceId });
  const worktrees = trpc.worktree.list.useQuery();

  const invalidateStatus = () => utils.git.status.invalidate({ workspaceId, worktreeId });

  const stage = trpc.git.stage.useMutation({ onSuccess: invalidateStatus });
  const unstage = trpc.git.unstage.useMutation({ onSuccess: invalidateStatus });

  const stageAll = trpc.git.stageAll.useMutation({ onSuccess: invalidateStatus });
  const unstageAll = trpc.git.unstageAll.useMutation({ onSuccess: invalidateStatus });

  useEffect(() => {
    const activeIds = new Set(
      (worktrees.data ?? []).filter((w) => w.status === 'active').map((w) => w.id),
    );
    if (worktreeId && !activeIds.has(worktreeId)) setWorktreeId('');
  }, [worktreeId, worktrees.data]);

  const filesBySection = useChangedFiles(status.data);

  useEffect(() => {
    if (!active) return;
    const exists = [...filesBySection.staged, ...filesBySection.others].some(
      (f) => f.path === active.path,
    );
    if (!exists) setActive(null);
  }, [active, filesBySection.staged, filesBySection.others, setActive]);

  const summary = summarizeWorking(filesBySection.others);

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-ink-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-medium leading-tight tracking-tight text-ink-50">
            {workspace.data?.name ?? '—'}
          </h1>
          <p className="mt-1 flex items-center gap-2 font-mono text-ui-2xs text-ink-500">
            <span>⎇ {status.data?.branch ?? '—'}</span>
            <span className="text-ink-400">·</span>
            <span>{summary || 'clean'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
            source
          </span>
          <Select
            value={worktreeId || '__root__'}
            onValueChange={(v) => {
              setWorktreeId(v === '__root__' ? '' : v);
              setActive(null);
            }}
          >
            <SelectTrigger className="font-mono text-ui-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__root__">workspace root</SelectItem>
              {(worktrees.data ?? [])
                .filter((w) => w.status === 'active')
                .map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.branch}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-ink-800/40 bg-ink-900/15">
          <SectionHeader className="bg-ink-950 h-10">
            <div>Staged ({filesBySection.staged.length})</div>
            {filesBySection.staged.length > 0 && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => unstageAll.mutate({ workspaceId, worktreeId })}
                disabled={unstageAll.isPending}
                className="flex items-center gap-1 font-mono hover:border-rose-500/30 hover:text-signal-err"
              >
                <Minus className="h-2.5 w-2.5" strokeWidth={1.5} />
              </Button>
            )}
          </SectionHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {status.data && !status.data.isRepo ? (
              <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">
                Not a git repository
              </div>
            ) : (
              <ChangedFileList
                files={filesBySection.staged}
                activePath={active?.path ?? null}
                onSelect={(path) => {
                  const selected = filesBySection.staged.find((f) => f.path === path);
                  if (selected) {
                    setActive({
                      path: selected.path,
                      kind: selected.kind,
                      originalPath: selected.originalPath,
                      staged: true,
                    });
                  }
                }}
                onUnstage={(path) => unstage.mutate({ workspaceId, worktreeId, paths: [path] })}
              />
            )}
          </div>
          <SectionHeader className="bg-ink-950 h-10">
            <div>Unstaged ({filesBySection.others.length})</div>
            {filesBySection.others.length > 0 && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => stageAll.mutate({ workspaceId, worktreeId })}
                disabled={stageAll.isPending}
                className="flex items-center gap-1 font-mono hover:border-emerald-500/30 hover:text-signal-ok"
              >
                <Plus className="h-2.5 w-2.5" strokeWidth={1.5} />
              </Button>
            )}
          </SectionHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {status.data && !status.data.isRepo ? (
              <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">
                Not a git repository
              </div>
            ) : status.data?.clean ? (
              <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">
                Working tree clean - no changes
              </div>
            ) : (
              <ChangedFileList
                files={filesBySection.others}
                activePath={active?.path ?? null}
                onSelect={(path) => {
                  const selected = filesBySection.others.find((f) => f.path === path);
                  if (selected) {
                    setActive({
                      path: selected.path,
                      kind: selected.kind,
                      originalPath: selected.originalPath,
                      staged: false,
                    });
                  }
                }}
                onStage={(path) => stage.mutate({ workspaceId, worktreeId, paths: [path] })}
              />
            )}
          </div>
          {/* Commit panel */}
          {status.data?.isRepo && (
            <CommitPanel workspaceId={workspaceId} worktreeId={worktreeId || undefined} />
          )}
          {/* PR section */}
          {status.data?.isRepo && (
            <PrSection
              workspaceId={workspaceId}
              worktreeId={worktreeId || undefined}
              currentBranch={status.data.branch ?? null}
            />
          )}
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          {status.data && !status.data.isRepo ? (
            <Empty>not a git repository</Empty>
          ) : status.data?.clean ? (
            <Empty>working tree clean - no changes</Empty>
          ) : active ? (
            <DiffPanelEditor
              workspaceId={workspaceId}
              worktreeId={worktreeId}
              path={active.path}
              staged={active.staged}
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
