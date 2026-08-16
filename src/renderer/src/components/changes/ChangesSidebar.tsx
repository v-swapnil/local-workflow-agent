import { Minus, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { TreeLeaf, TreeNode } from '../ui/tree-node';
import { ChangedFileListItem } from './ChangedFileListItem';
import { trpc } from '@renderer/trpc';
import { useChangedFiles } from './useChangedFiles';
import { useEffect, useMemo, useState } from 'react';
import { ActiveChange, ChangeKind } from './changeUtils';
import { FileTree } from '../FileTree';
import { GitStatus } from '@pierre/trees';

interface ChangesSidebarProps {
  workspaceId: string;
  worktreeId: string;
  active: ActiveChange | null;
  setActive: (change: ActiveChange | null) => void;
}

function toGitStatus(kind: ChangeKind): GitStatus {
  switch (kind) {
    case 'created':
      return 'added';
    case 'deleted':
      return 'deleted';
    case 'renamed':
      return 'renamed';
    case 'untracked':
      return 'untracked';
    default:
      return 'modified';
  }
}

export function ChangesSidebar({
  workspaceId,
  worktreeId,
  active,
  setActive,
}: ChangesSidebarProps) {
  const [stagedExpanded, setStagedExpanded] = useState(false);
  const [unstagedExpanded, setUnstagedExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('tree');

  const utils = trpc.useUtils();
  const status = trpc.git.status.useQuery({ workspaceId, worktreeId }, { refetchInterval: 5000 });
  const invalidateStatus = () => utils.git.status.invalidate({ workspaceId, worktreeId });

  const stage = trpc.git.stage.useMutation({ onSuccess: invalidateStatus });
  const unstage = trpc.git.unstage.useMutation({ onSuccess: invalidateStatus });

  const stageAll = trpc.git.stageAll.useMutation({ onSuccess: invalidateStatus });
  const unstageAll = trpc.git.unstageAll.useMutation({ onSuccess: invalidateStatus });

  const filesBySection = useChangedFiles(status.data);

  const stagedFiles = filesBySection.staged;
  const unStagedFiles = filesBySection.others;

  // Unified list for the tree view: dedupe by path, prefer the working-tree
  // entry so selecting a file shows its unstaged diff when it exists in both.
  const treeFiles = useMemo(() => {
    const byPath = new Map<string, (typeof unStagedFiles)[number]>();
    for (const file of unStagedFiles) byPath.set(file.path, file);
    for (const file of stagedFiles) if (!byPath.has(file.path)) byPath.set(file.path, file);
    return [...byPath.values()];
  }, [stagedFiles, unStagedFiles]);

  useEffect(() => {
    if (!active) return;
    const exists = [...filesBySection.staged, ...filesBySection.others].some(
      (f) => f.path === active.path,
    );
    if (!exists) setActive(null);
  }, [active, filesBySection.staged, filesBySection.others, setActive]);

  const handleSelect = (filePath: string, isStaged: boolean) => {
    const files = isStaged ? stagedFiles : unStagedFiles;
    const selected = files.find((f) => f.path === filePath);
    if (selected) {
      setActive({
        path: selected.path,
        kind: selected.kind,
        originalPath: selected.originalPath,
        staged: isStaged,
      });
    }
  };

  if (status.data && !status.data.isRepo) {
    return <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">Not a git repository</div>;
  } else if (status.data?.clean) {
    return (
      <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">
        Working tree clean - no changes
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 pb-2">
        <Button
          variant={viewMode === 'tree' ? 'outline' : 'ghost'}
          size="xs"
          className="h-6 px-2 font-mono text-ui-2xs"
          onClick={() => setViewMode('tree')}
        >
          tree
        </Button>
        <Button
          variant={viewMode === 'list' ? 'outline' : 'ghost'}
          size="xs"
          className="h-6 px-2 font-mono text-ui-2xs"
          onClick={() => setViewMode('list')}
        >
          list
        </Button>
      </div>

      {viewMode === 'tree' ? (
        <div className="min-h-0 flex-1">
          <FileTree
            paths={treeFiles.map((file) => file.path)}
            activePath={active?.path ?? null}
            gitStatus={treeFiles.map((file) => ({
              path: file.path,
              status: toGitStatus(file.kind),
            }))}
            onOpen={(filePath) => {
              const file = treeFiles.find((f) => f.path === filePath);
              if (file) {
                setActive({
                  path: file.path,
                  kind: file.kind,
                  originalPath: file.originalPath,
                  staged: file.section === 'staged',
                });
              }
            }}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TreeNode
            isActive={stagedFiles.some((file) => active?.path === file.path)}
            isExpanded={stagedExpanded}
            onExpandedChange={() => setStagedExpanded(!stagedExpanded)}
            onSelect={() => setStagedExpanded(!stagedExpanded)}
            content={<div>Staged ({stagedFiles.length})</div>}
            actions={
              <Button
                variant="ghost"
                size="xs"
                onClick={() => unstageAll.mutate({ workspaceId, worktreeId })}
                disabled={unstageAll.isPending}
                className="invisible shrink-0 rounded p-1 text-ink-600 hover:border-rose-500/30 hover:text-signal-err group-hover:visible"
              >
                <Minus className="h-2.5 w-2.5" strokeWidth={1.5} />
              </Button>
            }
          >
            {stagedFiles.length > 0 ? (
              stagedFiles.map((file, index) => {
                const isLast = index === stagedFiles.length - 1;
                return (
                  <TreeLeaf
                    key={file.path}
                    isActive={active?.path === file.path}
                    isLast={isLast}
                    onSelect={() => handleSelect(file.path, true)}
                    content={
                      <ChangedFileListItem isActive={active?.path === file.path} file={file} />
                    }
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        title="Unstage file"
                        onClick={(e) => {
                          e.stopPropagation();
                          unstage.mutate({ workspaceId, worktreeId, paths: [file.path] });
                        }}
                        className="shrink-0 h-6 w-6 text-ink-500 hover:bg-rose-500/10 hover:text-signal-err"
                      >
                        <Minus className="h-3 w-3" strokeWidth={1.5} />
                      </Button>
                    }
                  />
                );
              })
            ) : (
              <div className="ml-4 py-2 font-mono text-ui-2xs text-ink-600">No files</div>
            )}
          </TreeNode>
          <TreeNode
            isActive={unStagedFiles.some((file) => active?.path === file.path)}
            isExpanded={unstagedExpanded}
            onExpandedChange={() => setUnstagedExpanded(!unstagedExpanded)}
            onSelect={() => setUnstagedExpanded(!unstagedExpanded)}
            content={<div>Unstaged ({unStagedFiles.length})</div>}
            actions={
              <Button
                variant="ghost"
                size="xs"
                onClick={() => stageAll.mutate({ workspaceId, worktreeId })}
                disabled={stageAll.isPending}
                className="invisible shrink-0 rounded p-1 text-ink-600 hover:border-emerald-500/30 hover:text-signal-ok group-hover:visible"
              >
                <Plus className="h-2.5 w-2.5" strokeWidth={1.5} />
              </Button>
            }
          >
            {unStagedFiles.length > 0 ? (
              unStagedFiles.map((file, index) => {
                const isLast = index === unStagedFiles.length - 1;
                return (
                  <TreeLeaf
                    key={file.path}
                    isActive={active?.path === file.path}
                    isLast={isLast}
                    onSelect={() => handleSelect(file.path, false)}
                    content={
                      <ChangedFileListItem isActive={active?.path === file.path} file={file} />
                    }
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        title="Stage file"
                        onClick={(e) => {
                          e.stopPropagation();
                          stage.mutate({ workspaceId, worktreeId, paths: [file.path] });
                        }}
                        className="shrink-0 h-6 w-6 text-ink-500 hover:bg-rose-500/10 hover:text-signal-err"
                      >
                        <Plus className="h-3 w-3" strokeWidth={1.5} />
                      </Button>
                    }
                  />
                );
              })
            ) : (
              <div className="ml-4 py-2 font-mono text-ui-2xs text-ink-600">No files</div>
            )}
          </TreeNode>
        </div>
      )}
    </div>
  );
}
