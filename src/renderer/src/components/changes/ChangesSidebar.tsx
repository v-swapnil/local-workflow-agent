import { trpc } from '@renderer/trpc';
import { useEffect, useMemo } from 'react';
import { useChangedFiles } from './useChangedFiles';
import { FileTree } from '../FileTree';
import { GitStatus } from '@pierre/trees';
import { ActiveChange, ChangedFile, ChangeKind } from './types';

interface ChangesSidebarProps {
  workspaceId: number;
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

export function ChangesSidebar({ workspaceId, active, setActive }: ChangesSidebarProps) {
  const status = trpc.git.status.useQuery({ workspaceId }, { refetchInterval: 5000 });

  const filesBySection = useChangedFiles(status.data);

  // Merge staged + unstaged into a single deduped list keyed by path.
  const changedFiles = useMemo<ChangedFile[]>(() => {
    const byPath = new Map<string, ChangedFile>();
    for (const file of [...filesBySection.staged, ...filesBySection.others]) {
      if (!byPath.has(file.path)) byPath.set(file.path, file);
    }
    return [...byPath.values()];
  }, [filesBySection.staged, filesBySection.others]);

  // Stable references so FileTree does not reset its expansion state on every render.
  const treePaths = useMemo(() => changedFiles.map((file) => file.path), [changedFiles]);
  const treeGitStatus = useMemo(
    () => changedFiles.map((file) => ({ path: file.path, status: toGitStatus(file.kind) })),
    [changedFiles],
  );

  useEffect(() => {
    if (!active) return;
    const exists = changedFiles.some((file) => file.path === active.path);
    if (!exists) setActive(null);
  }, [active, changedFiles, setActive]);

  const handleSelect = (filePath: string) => {
    const selected = changedFiles.find((file) => file.path === filePath);
    if (selected) {
      setActive({
        path: selected.path,
        kind: selected.kind,
        originalPath: selected.originalPath,
      });
    }
  };

  if (status.data && !status.data.isRepo) {
    return <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">Not a git repository</div>;
  }
  if (status.data?.clean) {
    return (
      <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">
        Working tree clean - no changes
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {changedFiles.length === 0 ? (
        <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">No changes</div>
      ) : (
        <div className="min-h-0 flex-1">
          <FileTree
            paths={treePaths}
            activePath={active?.path ?? null}
            gitStatus={treeGitStatus}
            onOpen={handleSelect}
          />
        </div>
      )}
    </div>
  );
}
