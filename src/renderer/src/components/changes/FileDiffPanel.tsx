import { FileDiffOptions } from '@pierre/diffs';
import { PatchDiff } from '@pierre/diffs/react';
import { useUI } from '@renderer/store/ui';
import { trpc } from '@renderer/trpc';
import { useMemo } from 'react';

interface FileDiffPanelProps {
  workspaceId: number;
  activePath: string;
}

export function FileDiffPanel({ workspaceId, activePath }: FileDiffPanelProps) {
  const theme = useUI((state) => state.theme);
  const diff = trpc.git.fileDiff.useQuery({ workspaceId, path: activePath });

  const options = useMemo<FileDiffOptions<unknown>>(
    () => ({
      themeType: theme === 'dark' ? 'dark' : 'light',
      stickyHeader: true,
      diffStyle: 'split',
      overflow: 'wrap',
    }),
    [theme],
  );

  if (!diff.data) {
    return (
      <div className="p-6 font-mono text-ui-sm text-ink-500">
        {diff.isLoading ? '...' : 'no diff available'}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col max-h-full overflow-scroll bg-ink-950">
      <PatchDiff patch={diff.data} options={options} />
    </div>
  );
}
