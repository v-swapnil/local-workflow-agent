import { useState } from 'react';
import { PatchDiff } from '@pierre/diffs/react';
import { trpc } from '../../trpc';
import type { ChangeKind } from './changeUtils';
import { changeMeta } from './changeUtils';

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
