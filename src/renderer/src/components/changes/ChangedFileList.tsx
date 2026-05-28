import type { ChangedFile } from './changeUtils';
import { changeMeta, splitPath } from './changeUtils';

interface ChangedFileListProps {
  files: ChangedFile[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
}

export function ChangedFileList({
  files,
  activePath,
  onSelect,
  onStage,
  onUnstage,
}: ChangedFileListProps) {
  if (files.length === 0) {
    return <div className="px-3 py-3 font-mono text-ui-xs text-ink-500">No files</div>;
  }

  return (
    <ul className="space-y-px px-2 py-1.5">
      {files.map((file) => {
        const isActive = activePath === file.path;
        const meta = changeMeta(file.kind);
        const parts = splitPath(file.path);
        const renameTitle =
          file.kind === 'renamed' && file.originalPath
            ? `renamed: ${file.originalPath} -> ${file.path}`
            : meta.label;

        return (
          <li
            key={`${file.section}:${file.path}:${file.kind}`}
            className="flex items-center gap-0.5"
          >
            {file.section === 'working' && onStage && (
              <button
                type="button"
                title="Stage file"
                onClick={(e) => {
                  e.stopPropagation();
                  onStage(file.path);
                }}
                className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-ink-500 transition-colors hover:bg-emerald-500/10 hover:text-signal-ok"
              >
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-3 w-3"
                >
                  <path d="M6 2v8M2 6h8" />
                </svg>
              </button>
            )}
            {file.section === 'staged' && onUnstage && (
              <button
                type="button"
                title="Unstage file"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstage(file.path);
                }}
                className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-ink-500 transition-colors hover:bg-rose-500/10 hover:text-signal-err"
              >
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-3 w-3"
                >
                  <path d="M2 6h8" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all ${
                isActive
                  ? 'bg-amber/8 text-ink-100 border border-amber/15'
                  : 'border border-transparent text-ink-300 hover:bg-ink-800/30 hover:text-ink-100'
              }`}
              onClick={() => onSelect(file.path)}
              title={file.path}
            >
              <span
                className={`w-4 shrink-0 text-center font-mono text-ui-2xs font-medium ${meta.className}`}
                title={renameTitle}
              >
                {meta.code}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-ui-xs leading-5">{parts.name}</span>
                {parts.parent ? (
                  <span className="block truncate font-mono text-ui-2xs text-ink-500">
                    {parts.parent}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
