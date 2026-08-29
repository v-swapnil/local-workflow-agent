import { trpc } from '@renderer/trpc';
import { useEffect, useState } from 'react';
import { ActiveChange, ChangeKind } from './changeUtils';
import { useChangedFiles } from './useChangedFiles';
import { FileTree } from '../FileTree';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { GitStatus } from '@pierre/trees';

interface ChangesSidebarProps {
  workspaceId: number;
  worktreeId: number;
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
  const [activeTab, setActiveTab] = useState<'staged' | 'unstaged'>('unstaged');

  const status = trpc.git.status.useQuery({ workspaceId, worktreeId }, { refetchInterval: 5000 });

  const filesBySection = useChangedFiles(status.data);

  const stagedFiles = filesBySection.staged;
  const unStagedFiles = filesBySection.others;

  const activeFiles = activeTab === 'staged' ? stagedFiles : unStagedFiles;

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
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'staged' | 'unstaged')}
        className="shrink-0 px-2 pb-2"
      >
        <TabsList className="grid h-8 w-full grid-cols-2 bg-ink-900/40 p-0.5 font-mono text-ui-2xs">
          <TabsTrigger value="unstaged" className="h-full data-[state=active]:bg-ink-800">
            unstaged ({unStagedFiles.length})
          </TabsTrigger>
          <TabsTrigger value="staged" className="h-full data-[state=active]:bg-ink-800">
            staged ({stagedFiles.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeFiles.length === 0 ? (
        <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">No {activeTab} changes</div>
      ) : (
        <div className="min-h-0 flex-1">
          <FileTree
            paths={activeFiles.map((file) => file.path)}
            activePath={active?.path ?? null}
            gitStatus={activeFiles.map((file) => ({
              path: file.path,
              status: toGitStatus(file.kind),
            }))}
            onOpen={(filePath) => handleSelect(filePath, activeTab === 'staged')}
          />
        </div>
      )}
    </div>
  );
}
