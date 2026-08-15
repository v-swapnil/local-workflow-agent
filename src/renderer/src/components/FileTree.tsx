import { useEffect, useMemo } from 'react';
import { FileTree as PierreFileTree, useFileTree, useFileTreeSelection } from '@pierre/trees/react';

interface FileTreeProps {
  paths: string[];
  activePath: string | null;
  onOpen: (path: string) => void;
}

export function FileTree({ paths, activePath, onOpen }: FileTreeProps) {
  // git ls-files output can include a trailing empty entry; drop blanks.
  const cleanPaths = useMemo(() => paths.filter(Boolean), [paths]);

  const { model } = useFileTree({
    paths: cleanPaths,
    initialExpansion: 'open',
    search: true,
    initialSelectedPaths: activePath ? [activePath] : undefined,
    icons: 'standard',
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

  return <PierreFileTree model={model} style={{ height: '100%' }} />;
}
