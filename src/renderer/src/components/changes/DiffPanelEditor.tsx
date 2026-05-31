import { useState } from 'react';
import { PatchDiff } from '@pierre/diffs/react';
import { trpc } from '../../trpc';
import type { ChangeKind } from './changeUtils';
import { changeMeta } from './changeUtils';
import { Toggle } from '../ui/toggle';

interface DiffPanelEditorProps {
  workspaceId: string;
  worktreeId?: string;
  path: string;
  kind: ChangeKind;
}

export function DiffPanelEditor({ workspaceId, worktreeId, path, kind }: DiffPanelEditorProps) {
  const [inlineMode, setInlineMode] = useState(false);

  const fileDiff = trpc.git.fileDiff.useQuery({ path, workspaceId, worktreeId });
  const meta = changeMeta(kind);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-ink-800/40 bg-ink-900/20 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 font-mono text-ui-2xs font-medium ${meta.className}`}>
            {meta.code}
          </span>
          <span className="min-w-0 truncate font-mono text-ui-sm text-ink-100">{path}</span>
        </div>
        <Toggle
          pressed={inlineMode}
          onPressedChange={setInlineMode}
          size="sm"
          variant="outline"
          className="font-mono text-ui-2xs data-[state=on]:border-amber/30 data-[state=on]:bg-amber/8 data-[state=on]:text-amber"
        >
          {inlineMode ? 'Side-by-side' : 'Inline'}
        </Toggle>
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
