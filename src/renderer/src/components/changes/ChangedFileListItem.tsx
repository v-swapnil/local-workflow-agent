import { cn } from '@renderer/lib/utils';
import { ChangedFile, changeMeta, splitPath } from './changeUtils';

export function ChangedFileListItem({ isActive, file }: { isActive: boolean; file: ChangedFile }) {
  const meta = changeMeta(file.kind);
  const parts = splitPath(file.path);
  const renameTitle =
    file.kind === 'renamed' && file.originalPath
      ? `renamed: ${file.originalPath} -> ${file.path}`
      : meta.label;

  return (
    <>
      <span
        className={`w-4 shrink-0 text-center font-mono text-ui-2xs font-medium ${meta.className}`}
        title={renameTitle}
      >
        {meta.code}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate font-mono text-ui-sm font-medium',
            isActive ? 'text-ink-50' : 'text-ink-200',
          )}
        >
          {parts.name}
        </span>
        <span className="min-w-0 truncate leading-4 block font-mono text-ui-2xs text-ink-500">
          {parts.parent}
        </span>
      </span>
    </>
  );
}
