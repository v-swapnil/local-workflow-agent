import { useEffect, useMemo, useRef } from 'react';
import { FileTree, useFileTree, useFileTreeSelection } from '@pierre/trees/react';
import { themeToTreeStyles, type GitStatus, type GitStatusEntry } from '@pierre/trees';
import type { ChangedFile, ChangeKind } from './changeUtils';
import { useUI } from '@renderer/store/ui';

function toGitStatus(kind: ChangeKind): GitStatus {
  switch (kind) {
    case 'created':
      return 'added';
    case 'deleted':
      return 'deleted';
    case 'renamed':
      return 'renamed';
    case 'untracked':
      return 'untracked';
    default:
      return 'modified';
  }
}

interface PierreChangesTreeProps {
  files: ChangedFile[];
  activePath: string | null;
  onSelectFile: (file: ChangedFile) => void;
}

export function PierreChangesTree({ files, activePath, onSelectFile }: PierreChangesTreeProps) {
  const { theme } = useUI();

  const styles = themeToTreeStyles({ type: theme });

  // Stable keys so the tree only rebuilds when the actual paths/statuses change,
  // not on every 5s status refetch that returns a new array reference.
  const pathsKey = files.map((file) => file.path).join('\n');
  const statusKey = files.map((file) => `${file.path}:${file.kind}`).join('\n');

  const paths = useMemo(() => files.map((file) => file.path), [pathsKey]);
  const gitStatus = useMemo<GitStatusEntry[]>(
    () => files.map((file) => ({ path: file.path, status: toGitStatus(file.kind) })),
    [statusKey],
  );
  const filesByPath = useMemo(() => {
    const map = new Map<string, ChangedFile>();
    for (const file of files) map.set(file.path, file);
    return map;
  }, [pathsKey]);

  const onSelectFileRef = useRef(onSelectFile);
  onSelectFileRef.current = onSelectFile;

  const { model } = useFileTree({
    paths,
    gitStatus,
    initialExpansion: 'open',
    stickyFolders: true,
    icons: 'standard',
  });

  useEffect(() => {
    model.resetPaths(paths);
  }, [model, paths]);

  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [model, gitStatus]);

  const selectedPaths = useFileTreeSelection(model);

  // Emit selection upward when the user picks a file (ignore directory rows).
  useEffect(() => {
    const selectedFilePath = selectedPaths.find(
      (path) => model.getItem(path)?.isDirectory() === false,
    );
    if (!selectedFilePath || selectedFilePath === activePath) return;
    const file = filesByPath.get(selectedFilePath);
    if (file) onSelectFileRef.current(file);
  }, [selectedPaths, model, activePath, filesByPath]);

  // Reflect an externally-driven active path back into the tree selection.
  useEffect(() => {
    if (!activePath || selectedPaths.includes(activePath)) return;
    model.getItem(activePath)?.select();
  }, [activePath, model, selectedPaths]);

  return <FileTree model={model} style={{ ...styles, height: '100%' }} />;
}
