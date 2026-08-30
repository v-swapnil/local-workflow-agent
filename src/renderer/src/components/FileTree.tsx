import { useEffect, useMemo } from 'react';
import { FileTree as PierreFileTree, useFileTree, useFileTreeSelection } from '@pierre/trees/react';
import { useUI } from '@renderer/store/ui';
import { GitStatusEntry, themeToTreeStyles } from '@pierre/trees';

interface FileTreeProps {
  paths: string[];
  gitStatus?: GitStatusEntry[];
  activePath: string | null;
  onOpen: (path: string) => void;
}

export function FileTree({ paths, gitStatus, activePath, onOpen }: FileTreeProps) {
  const { theme } = useUI();
  const styles = themeToTreeStyles({ type: theme });

  // git ls-files output can include a trailing empty entry; drop blanks.
  const cleanPaths = useMemo(() => paths.filter(Boolean), [paths]);

  const { model } = useFileTree({
    paths: cleanPaths,
    initialExpansion: 'closed',
    search: true,
    initialSelectedPaths: activePath ? [activePath] : undefined,
    icons: 'standard',
    gitStatus,
    flattenEmptyDirectories: true,
    onSelectionChange: (selected) => {
      const selectedPath = selected?.[0];
      if (!selectedPath) return;
      if (model.getItem(selectedPath)?.isDirectory()) return;
      onOpen(selectedPath);
    },
  });

  useEffect(() => {
    model.resetPaths(cleanPaths);
  }, [model, cleanPaths]);

  return <PierreFileTree model={model} style={{ ...styles, height: '100%' }} />;
}
