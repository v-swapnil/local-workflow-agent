import { useState } from 'react';
import { trpc } from '../../trpc';
import { cn } from '../../lib/utils';
import { useChangedFiles } from '../../components/changes/useChangedFiles';
import { changeMeta, splitPath, summarizeWorking } from '../../components/changes/changeUtils';
import type { ChangedFile } from '../../components/changes/changeUtils';
import { ChevronRight, FileDiff } from 'lucide-react';

interface FileStat {
  additions: number;
  deletions: number;
  binary: boolean;
}

function FileRow({ file, stat }: { file: ChangedFile; stat?: FileStat }) {
  const meta = changeMeta(file.kind);
  const parts = splitPath(file.path);
  const title =
    file.kind === 'renamed' && file.originalPath
      ? `renamed: ${file.originalPath} -> ${file.path}`
      : file.path;

  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded px-2 py-1 hover:bg-ink-800/30"
      title={title}
    >
      <span
        className={cn('w-3 shrink-0 text-center font-mono text-ui-2xs font-medium', meta.className)}
      >
        {meta.code}
      </span>
      <span className="truncate font-mono text-ui-xs text-ink-200">{parts.name}</span>
      {parts.parent && (
        <span className="min-w-0 flex-1 truncate font-mono text-ui-2xs text-ink-600">
          {parts.parent}
        </span>
      )}
      <span className="ml-auto shrink-0 font-mono text-ui-2xs tabular-nums">
        {stat?.binary ? (
          <span className="text-ink-600">bin</span>
        ) : stat && (stat.additions > 0 || stat.deletions > 0) ? (
          <>
            {stat.additions > 0 && <span className="text-signal-ok">+{stat.additions}</span>}
            {stat.additions > 0 && stat.deletions > 0 && <span className="text-ink-700"> </span>}
            {stat.deletions > 0 && <span className="text-signal-err">-{stat.deletions}</span>}
          </>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Session-level git changes (worktree if present, else workspace root).
 * Shows all change types: staged, tracked, and untracked files.
 */
export function SessionChanges({
  workspaceId,
  worktreeId,
}: {
  workspaceId: string;
  worktreeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const status = trpc.git.status.useQuery(
    { workspaceId, worktreeId },
    { refetchInterval: 5000 },
  );
  const changeStats = trpc.git.changeStats.useQuery(
    { workspaceId, worktreeId },
    { refetchInterval: 5000 },
  );

  const { staged, others } = useChangedFiles(status.data);
  const total = staged.length + others.length;
  const summary = summarizeWorking([...staged, ...others]);

  const statBy = new Map<string, FileStat>();
  for (const s of changeStats.data ?? []) {
    statBy.set(`${s.section}:${s.path}`, {
      additions: s.additions,
      deletions: s.deletions,
      binary: s.binary,
    });
  }
  const totalAdd = (changeStats.data ?? []).reduce((acc, s) => acc + s.additions, 0);
  const totalDel = (changeStats.data ?? []).reduce((acc, s) => acc + s.deletions, 0);

  if (status.data && !status.data.isRepo) return null;

  return (
    <div className="shrink-0 rounded-md border border-ink-800/50 bg-ink-900/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-ink-500 transition-transform', open && 'rotate-90')}
          strokeWidth={1.5}
        />
        <FileDiff className="h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.3} />
        <span className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-400">
          changes
        </span>
        <span className="font-mono text-ui-2xs text-ink-600">{total}</span>
        {(totalAdd > 0 || totalDel > 0) && (
          <span className="font-mono text-ui-2xs tabular-nums">
            {totalAdd > 0 && <span className="text-signal-ok">+{totalAdd}</span>}{' '}
            {totalDel > 0 && <span className="text-signal-err">-{totalDel}</span>}
          </span>
        )}
        <span className="ml-auto font-mono text-ui-2xs text-ink-500">{summary || 'clean'}</span>
      </button>

      {open && total > 0 && (
        <div className="max-h-48 overflow-y-auto border-t border-ink-800/40 px-1.5 py-1.5">
          {staged.length > 0 && (
            <>
              <div className="px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-600">
                staged ({staged.length})
              </div>
              {staged.map((f) => (
                <FileRow key={`staged:${f.path}`} file={f} stat={statBy.get(`staged:${f.path}`)} />
              ))}
            </>
          )}
          {others.length > 0 && (
            <>
              <div className="mt-1 px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-600">
                changed ({others.length})
              </div>
              {others.map((f) => (
                <FileRow
                  key={`working:${f.path}`}
                  file={f}
                  stat={statBy.get(`working:${f.path}`)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {open && total === 0 && (
        <div className="border-t border-ink-800/40 px-3 py-2 font-mono text-ui-2xs text-ink-600">
          working tree clean
        </div>
      )}
    </div>
  );
}
