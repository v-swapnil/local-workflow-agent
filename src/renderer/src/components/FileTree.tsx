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
    initialExpansion: 'open',
    search: true,
    initialSelectedPaths: activePath ? [activePath] : undefined,
    icons: 'standard',
    gitStatus,
  });

  const selectedPaths = useFileTreeSelection(model);

  useEffect(() => {
    model.resetPaths(cleanPaths);
  }, [model, cleanPaths]);

  useEffect(() => {
    const selectedPath = selectedPaths[0];
    if (!selectedPath) return;
    const item = model.getItem(selectedPath);
    if (item && !item.isDirectory()) onOpen(selectedPath);
  }, [selectedPaths, model, onOpen]);

  return <PierreFileTree model={model} style={{ ...styles, height: '100%' }} />;
}
