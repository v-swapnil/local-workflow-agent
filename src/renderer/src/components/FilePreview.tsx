import { trpc } from '../trpc';
import { useUI } from '../store/ui';

import { File } from '@pierre/diffs/react';

interface FilePreviewProps {
  workspaceId: string;
  path: string;
}

export function FilePreview({ workspaceId, path }: FilePreviewProps) {
  const file = trpc.file.read.useQuery({ workspaceId, path });
  const theme = useUI((s) => s.theme);

  if (file.isLoading) {
    return <div className="p-6 font-mono text-ui-base text-ink-400">Loading...</div>;
  }
  if (file.error) {
    return <div className="p-6 font-mono text-ui-base text-signal-err">{file.error.message}</div>;
  }

  return (
    <div className="flex h-full w-full">
      <File
        file={{ name: path, contents: file.data?.content || '' }}
        options={{
          disableFileHeader: true,
          overflow: 'wrap',
          themeType: theme === 'dark' ? 'dark' : 'light',
        }}
        style={{ height: '100%', width: '100%', overflow: 'auto' }}
      />
    </div>
  );
}
