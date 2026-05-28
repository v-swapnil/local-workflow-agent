import { useMemo } from 'react';
import { mapStatusCode, mapPathKind } from './changeUtils';
import type { ChangedFile } from './changeUtils';

interface GitStatusFile {
  path: string;
  from?: string;
  index: string;
  working_dir: string;
}

interface GitStatus {
  files?: GitStatusFile[];
  clean?: boolean;
  staged?: string[];
  not_added?: string[];
  modified?: string[];
  created?: string[];
  deleted?: string[];
  conflicted?: string[];
  renamed?: { from: string; to: string }[];
}

interface ChangedFiles {
  staged: ChangedFile[];
  others: ChangedFile[];
}

export function useChangedFiles(status: GitStatus | undefined): ChangedFiles {
  return useMemo(() => {
    const staged: ChangedFile[] = [];
    const others: ChangedFile[] = [];

    if (!status) return { staged, others };

    const sourceFiles = status.files ?? [];

    for (const file of sourceFiles) {
      if (file.index !== ' ' && file.index !== '?') {
        const kind = mapStatusCode(file.index);
        if (kind) {
          staged.push({ path: file.path, originalPath: file.from, kind, section: 'staged' });
        }
      }
      if (file.working_dir !== ' ') {
        const kind = mapStatusCode(file.working_dir);
        if (kind) {
          others.push({ path: file.path, originalPath: file.from, kind, section: 'working' });
        }
      }
    }

    // Fallback for environments where status.files may be empty but aggregate arrays are populated.
    if (sourceFiles.length === 0 && !status.clean) {
      const stagedList = status.staged ?? [];
      const notAddedList = status.not_added ?? [];
      const renamedList = status.renamed ?? [];

      const stagedSet = new Set(stagedList);
      const otherSet = new Set([
        ...notAddedList,
        ...(status.modified ?? []),
        ...(status.created ?? []),
        ...(status.deleted ?? []),
        ...(status.conflicted ?? []),
        ...renamedList.map((r) => r.to),
      ]);

      for (const path of stagedSet) {
        const mapped = mapPathKind(path, status);
        staged.push({ path, kind: mapped.kind, originalPath: mapped.originalPath, section: 'staged' });
      }

      for (const path of otherSet) {
        if (!path) continue;
        const mapped = mapPathKind(path, status);
        if (mapped.kind === 'created' && notAddedList.includes(path)) {
          others.push({ path, kind: 'untracked', section: 'working' });
          continue;
        }
        others.push({ path, kind: mapped.kind, originalPath: mapped.originalPath, section: 'working' });
      }
    }

    return { staged, others };
  }, [status]);
}
