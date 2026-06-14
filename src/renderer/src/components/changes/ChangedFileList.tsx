import type { ChangedFile } from './changeUtils';
import { changeMeta, splitPath } from './changeUtils';
import { Button } from '../ui/button';
import { Plus, Minus } from 'lucide-react';

interface ChangedFileListProps {
  files: ChangedFile[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
}

function ChangedFileListItem({
  file,
  activePath,
  onSelect,
  onStage,
  onUnstage,
}: Omit<ChangedFileListProps, 'files'> & { file: ChangedFile }) {
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
      className={`h-auto min-w-0 rounded-md px-2 py-1.5 text-left font-normal ${
        isActive
          ? 'bg-amber/8 text-ink-100 border border-amber/15 hover:bg-amber/12'
          : 'border border-transparent text-ink-300 hover:bg-ink-800/30 hover:text-ink-100'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 group">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onSelect(file.path)}
          title={file.path}
          className="min-w-0 h-auto flex-1 justify-start items-center p-0 text-left font-normal hover:bg-transparent"
        >
          <span
            className={`w-4 shrink-0 text-center font-mono text-ui-2xs font-medium ${meta.className}`}
            title={renameTitle}
          >
            {meta.code}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-ui-xs leading-5">{parts.name}</span>
          </span>
        </Button>

        {file.section === 'working' && onStage && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            title="Stage file"
            onClick={(e) => {
              e.stopPropagation();
              onStage(file.path);
            }}
            className="invisible shrink-0 h-6 w-6 text-ink-500 hover:bg-emerald-500/10 hover:text-signal-ok group-hover:visible"
          >
            <Plus className="h-3 w-3" strokeWidth={1.5} />
          </Button>
        )}
        {file.section === 'staged' && onUnstage && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            title="Unstage file"
            onClick={(e) => {
              e.stopPropagation();
              onUnstage(file.path);
            }}
            className="invisible shrink-0 h-6 w-6 text-ink-500 hover:bg-rose-500/10 hover:text-signal-err group-hover:visible"
          >
            <Minus className="h-3 w-3" strokeWidth={1.5} />
          </Button>
        )}
      </div>
    </li>
  );
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
      {files.map((file) => (
        <ChangedFileListItem
          file={file}
          activePath={activePath}
          onSelect={onSelect}
          onStage={onStage}
          onUnstage={onUnstage}
        />
      ))}
    </ul>
  );
}
