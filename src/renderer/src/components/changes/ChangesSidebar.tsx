import { Minus, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { TreeLeaf, TreeNode } from '../ui/tree-node';
import { ChangedFileListItem } from './ChangedFileListItem';
import { trpc } from '@renderer/trpc';
import { useChangedFiles } from './useChangedFiles';
import { useEffect, useState } from 'react';
import { ActiveChange } from './changeUtils';

interface ChangesSidebarProps {
  workspaceId: string;
  worktreeId: string;
  active: ActiveChange | null;
  setActive: (change: ActiveChange | null) => void;
}

export function ChangesSidebar({
  workspaceId,
  worktreeId,
  active,
  setActive,
}: ChangesSidebarProps) {
  const [stagedExpanded, setStagedExpanded] = useState(false);
  const [unstagedExpanded, setUnstagedExpanded] = useState(false);

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
                content={<ChangedFileListItem isActive={active?.path === file.path} file={file} />}
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
                content={<ChangedFileListItem isActive={active?.path === file.path} file={file} />}
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
  );
}
