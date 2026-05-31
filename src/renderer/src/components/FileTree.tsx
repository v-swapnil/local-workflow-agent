import {
  ChevronDownIcon,
  FileCodeIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { inferProcedureOutput } from '@trpc/server';
import type { AppRouter } from '../../../main/ipc/router';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'swift', 'kt', 'sh', 'bash', 'zsh', 'css', 'scss', 'sass', 'less', 'html', 'vue', 'svelte']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']);
const TEXT_EXTS = new Set(['md', 'mdx', 'txt', 'yaml', 'yml', 'toml', 'env', 'gitignore', 'lock']);

function FileNodeIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json' || ext === 'jsonc') return <FileJsonIcon className={className} />;
  if (CODE_EXTS.has(ext)) return <FileCodeIcon className={className} />;
  if (IMAGE_EXTS.has(ext)) return <ImageIcon className={className} />;
  if (TEXT_EXTS.has(ext)) return <FileTextIcon className={className} />;
  return <FileIcon className={className} />;
}

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
        <FileNodeIcon name={node.name} className="size-3.5 shrink-0 text-ink-500" />
        <span className="truncate">{node.name}</span>
      </Button>
    );
  }

  return (
    <Collapsible defaultOpen={depth < 1}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          style={indent}
          className="group h-auto w-full justify-start gap-1.5 rounded-none py-[3px] text-left font-normal text-ink-300 hover:bg-ink-800/50"
        >
          <ChevronDownIcon className="size-3.5 shrink-0 text-ink-500 transition-transform group-data-[state=closed]:-rotate-90" />
          <FolderIcon className="size-3.5 shrink-0 text-ink-400 group-data-[state=open]:hidden" />
          <FolderOpenIcon className="size-3.5 shrink-0 text-ink-400 group-data-[state=closed]:hidden" />
          <span className="truncate">{node.name}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {node.children?.map((c) => (
          <Node key={c.path} node={c} depth={depth + 1} activePath={activePath} onOpen={onOpen} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
