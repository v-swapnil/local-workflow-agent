import { useState } from 'react';
import { cn } from '../lib/utils';
import type { inferProcedureOutput } from '@trpc/server';
import type { AppRouter } from '../../../main/ipc/router';
import { Button } from './ui/button';

type Tree = inferProcedureOutput<AppRouter['file']['tree']>;

interface Props {
  root: Tree;
  activePath: string | null;
  onOpen: (path: string) => void;
}

export function FileTree({ root, activePath, onOpen }: Props) {
  return (
    <div className="select-none font-mono text-ui-base text-ink-200">
      {root.children?.map((child) => (
        <Node key={child.path} node={child} depth={0} activePath={activePath} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function Node({
  node,
  depth,
  activePath,
  onOpen,
}: {
  node: Tree;
  depth: number;
  activePath: string | null;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isActive = !node.isDir && activePath === node.path;
  const indent = { paddingLeft: 8 + depth * 14 };

  if (!node.isDir) {
    return (
      <Button
        variant="ghost"
        onClick={() => onOpen(node.path)}
        style={indent}
        className={cn(
          'h-auto w-full justify-start gap-1.5 rounded-none py-[3px] text-left font-normal hover:bg-ink-800/50',
          isActive && 'bg-ink-800 text-amber hover:bg-ink-800',
        )}
      >
        <span className="text-ink-400">·</span>
        <span className="truncate">{node.name}</span>
      </Button>
    );
  }

  return (
    <div>
      <Button
        variant="ghost"
        onClick={() => setOpen((o) => !o)}
        style={indent}
        className="h-auto w-full justify-start gap-1.5 rounded-none py-[3px] text-left font-normal text-ink-300 hover:bg-ink-800/50"
      >
        <span className="text-ui-2xs text-ink-500">{open ? '▾' : '▸'}</span>
        <span className="truncate">{node.name}</span>
      </Button>
      {open &&
        node.children?.map((c) => (
          <Node key={c.path} node={c} depth={depth + 1} activePath={activePath} onOpen={onOpen} />
        ))}
    </div>
  );
}
