import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { CommitPanel } from '../components/changes/CommitPanel';
import { PrSection } from '../components/changes/PrSection';

import { PatchDiff } from '@pierre/diffs/react';

type ChangeKind = 'modified' | 'created' | 'deleted' | 'renamed' | 'conflicted' | 'untracked';

interface ChangedFile {
  path: string;
  originalPath?: string;
  kind: ChangeKind;
  section: 'staged' | 'working';
}

interface ActiveChange {
  path: string;
  kind: ChangeKind;
  originalPath?: string;
}

function mapStatusCode(code: string): ChangeKind | null {
  if (code === 'M') return 'modified';
  if (code === 'A') return 'created';
  if (code === 'D') return 'deleted';
  if (code === 'R') return 'renamed';
  if (code === 'C' || code === 'U') return 'conflicted';
  if (code === '?') return 'untracked';
  return null;
}

function splitPath(path: string): { parent: string; name: string } {
  const parts = path.split('/');
  const name = parts.pop() ?? path;
  const parent = parts.join('/');
  return { parent, name };
}

function changeMeta(kind: ChangeKind): { code: string; label: string; className: string } {
  if (kind === 'modified') return { code: 'M', label: 'Modified', className: 'text-amber' };
  if (kind === 'created') return { code: 'A', label: 'Added', className: 'text-signal-ok' };
  if (kind === 'deleted') return { code: 'D', label: 'Deleted', className: 'text-signal-err' };
  if (kind === 'renamed') return { code: 'R', label: 'Renamed', className: 'text-purple-400' };
  if (kind === 'conflicted')
    return { code: 'C', label: 'Conflicted', className: 'text-signal-warn' };
  return { code: '?', label: 'Untracked', className: 'text-ink-400' };
}

function summarizeWorking(files: ChangedFile[]): string {
  const tally = { M: 0, A: 0, D: 0, R: 0, C: 0, '?': 0 };
  for (const file of files) {
    const { code } = changeMeta(file.kind);
    if (code in tally) tally[code as keyof typeof tally] += 1;
  }
  const chunks: string[] = [];
  if (tally.M) chunks.push(`${tally.M}M`);
  if (tally.A) chunks.push(`${tally.A}A`);
  if (tally.D) chunks.push(`${tally.D}D`);
  if (tally.R) chunks.push(`${tally.R}R`);
  if (tally.C) chunks.push(`${tally.C}C`);
  if (tally['?']) chunks.push(`${tally['?']}?`);
  return chunks.join(' · ');
}

function mapPathKind(
  path: string,
  status: {
    created?: string[];
    modified?: string[];
    deleted?: string[];
    conflicted?: string[];
    renamed?: { from: string; to: string }[];
  },
): { kind: ChangeKind; originalPath?: string } {
  const renamed = status.renamed?.find((r) => r.to === path);
  if (renamed) return { kind: 'renamed', originalPath: renamed.from };
  if (status.conflicted?.includes(path)) return { kind: 'conflicted' };
  if (status.created?.includes(path)) return { kind: 'created' };
  if (status.deleted?.includes(path)) return { kind: 'deleted' };
  if (status.modified?.includes(path)) return { kind: 'modified' };
  return { kind: 'modified' };
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-ink-800/40 px-3 py-2 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
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

function ChangedFileList({
  files,
  activePath,
  onSelect,
  onStage,
  onUnstage,
}: {
  files: ChangedFile[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
}) {
  if (files.length === 0) {
    return <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">No files</div>;
  }

  return (
    <ul className="space-y-px px-2 py-1.5">
      {files.map((file) => {
        const isActive = activePath === file.path;
        const meta = changeMeta(file.kind);
        const parts = splitPath(file.path);
        const renameTitle =
          file.kind === 'renamed' && file.originalPath
            ? `renamed: ${file.originalPath} -> ${file.path}`
            : meta.label;

        return (
          <li
            key={`${file.section}:${file.path}:${file.kind}`}
            className="flex items-center gap-0.5"
          >
            {file.section === 'working' && onStage && (
              <button
                type="button"
                title="Stage file"
                onClick={(e) => {
                  e.stopPropagation();
                  onStage(file.path);
                }}
                className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-ink-500 transition-colors hover:bg-emerald-500/10 hover:text-signal-ok"
              >
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-3 w-3"
                >
                  <path d="M6 2v8M2 6h8" />
                </svg>
              </button>
            )}
            {file.section === 'staged' && onUnstage && (
              <button
                type="button"
                title="Unstage file"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstage(file.path);
                }}
                className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-ink-500 transition-colors hover:bg-rose-500/10 hover:text-signal-err"
              >
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-3 w-3"
                >
                  <path d="M2 6h8" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all ${
                isActive
                  ? 'bg-amber/8 text-ink-100 border border-amber/15'
                  : 'border border-transparent text-ink-300 hover:bg-ink-800/30 hover:text-ink-100'
              }`}
              onClick={() => onSelect(file.path)}
              title={file.path}
            >
              <span
                className={`w-4 shrink-0 text-center font-mono text-ui-2xs font-medium ${meta.className}`}
                title={renameTitle}
              >
                {meta.code}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-ui-xs leading-5">{parts.name}</span>
                {parts.parent ? (
                  <span className="block truncate font-mono text-ui-2xs text-ink-500">
                    {parts.parent}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DiffPanelEditor({
  workspaceId,
  worktreeId,
  path,
  kind,
}: {
  workspaceId: string;
  worktreeId?: string;
  path: string;
  kind: ChangeKind;
}) {
  const [inlineMode, setInlineMode] = useState(false);

  const fileDiff = trpc.git.fileDiff.useQuery({ path, workspaceId, worktreeId });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-ink-800/40 bg-ink-900/20 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 font-mono text-ui-2xs font-medium ${changeMeta(kind).className}`}
          >
            {changeMeta(kind).code}
          </span>
          <span className="min-w-0 truncate font-mono text-ui-sm text-ink-100">{path}</span>
        </div>
        <button
          type="button"
          className="rounded-md border border-ink-700/50 px-2.5 py-1 font-mono text-ui-2xs text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100"
          onClick={() => setInlineMode((v) => !v)}
        >
          {inlineMode ? 'Side-by-side' : 'Inline'}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {fileDiff.data ? (
          <PatchDiff
            patch={fileDiff.data}
            options={{ diffStyle: inlineMode ? 'unified' : 'split' }}
          />
        ) : (
          <div className="p-6 font-mono text-ui-sm text-ink-500">
            {fileDiff.isLoading ? 'loading diff…' : 'no diff available'}
          </div>
        )}
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

  useEffect(() => {
    const activeIds = new Set(
      (worktrees.data ?? []).filter((w) => w.status === 'active').map((w) => w.id),
    );
    if (worktreeId && !activeIds.has(worktreeId)) setWorktreeId('');
  }, [worktreeId, worktrees.data]);

  const filesBySection = useMemo(() => {
    const staged: ChangedFile[] = [];
    const others: ChangedFile[] = [];
    const sourceFiles = status.data?.files ?? [];

    for (const file of sourceFiles) {
      if (file.index !== ' ' && file.index !== '?') {
        const kind = mapStatusCode(file.index);
        if (kind) {
          staged.push({
            path: file.path,
            originalPath: file.from,
            kind,
            section: 'staged',
          });
        }
      }
      if (file.working_dir !== ' ') {
        const kind = mapStatusCode(file.working_dir);
        if (kind) {
          others.push({
            path: file.path,
            originalPath: file.from,
            kind,
            section: 'working',
          });
        }
      }
    }

    // Fallback for environments where status.files may be empty but aggregate arrays are populated.
    if (sourceFiles.length === 0 && status.data && !status.data.clean) {
      const stagedList = status.data.staged ?? [];
      const notAddedList = status.data.not_added ?? [];
      const modifiedList = status.data.modified ?? [];
      const createdList = status.data.created ?? [];
      const deletedList = status.data.deleted ?? [];
      const conflictedList = status.data.conflicted ?? [];
      const renamedList = status.data.renamed ?? [];

      const stagedSet = new Set(stagedList);
      const otherSet = new Set([
        ...notAddedList,
        ...modifiedList,
        ...createdList,
        ...deletedList,
        ...conflictedList,
        ...renamedList.map((r) => r.to),
      ]);

      for (const path of stagedSet) {
        const mapped = mapPathKind(path, status.data);
        staged.push({
          path,
          kind: mapped.kind,
          originalPath: mapped.originalPath,
          section: 'staged',
        });
      }

      for (const path of otherSet) {
        if (!path) continue;
        const mapped = mapPathKind(path, status.data);
        if (mapped.kind === 'created' && notAddedList.includes(path)) {
          others.push({ path, kind: 'untracked', section: 'working' });
          continue;
        }
        others.push({
          path,
          kind: mapped.kind,
          originalPath: mapped.originalPath,
          section: 'working',
        });
      }
    }

    return {
      staged,
      others,
    };
  }, [status.data]);

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
          <select
            value={worktreeId}
            onChange={(e) => {
              setWorktreeId(e.target.value);
              setActive(null);
            }}
            className="rounded-md border border-ink-700/50 bg-ink-900/40 px-3 py-1.5 font-mono text-ui-xs text-ink-200 transition-colors focus:border-amber/30 focus:outline-none hover:border-ink-600"
          >
            <option value="">workspace root</option>
            {(worktrees.data ?? [])
              .filter((w) => w.status === 'active')
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.branch}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-ink-800/40 bg-ink-900/15">
          <SectionHeader>Staged ({filesBySection.staged.length})</SectionHeader>
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
                    });
                  }
                }}
                onUnstage={(path) => unstage.mutate({ workspaceId, worktreeId, paths: [path] })}
              />
            )}
          </div>
          <SectionHeader>Unstaged ({filesBySection.others.length})</SectionHeader>
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
                    });
                  }
                }}
                onStage={(path) => stage.mutate({ workspaceId, worktreeId, paths: [path] })}
              />
            )}
          </div>
          {/* Commit panel */}
          {status.data?.isRepo && (
            <CommitPanel
              workspaceId={workspaceId}
              worktreeId={worktreeId || undefined}
              onDone={invalidateStatus}
            />
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
              kind={active.kind}
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
