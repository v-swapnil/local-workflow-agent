import { PatchDiff } from '@pierre/diffs/react';
import { trpc } from '../../trpc';

interface DiffPanelEditorProps {
  workspaceId: string;
  worktreeId?: string;
  path: string;
  staged?: boolean;
}

export function DiffPanelEditor({ workspaceId, worktreeId, path, staged }: DiffPanelEditorProps) {
  const fileDiff = trpc.git.fileDiff.useQuery({ path, workspaceId, worktreeId, staged });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {fileDiff.data ? (
          <PatchDiff patch={fileDiff.data} options={{ diffStyle: 'split', overflow: 'wrap' }} />
        ) : (
          <div className="p-6 font-mono text-ui-sm text-ink-500">
            {fileDiff.isLoading ? '...' : 'no diff available'}
          </div>
        )}
      </div>
    </div>
  );
}
