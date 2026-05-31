import { useState } from 'react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { cn } from '../lib/utils';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ChevronDown, FolderPlus, Menu } from 'lucide-react';

export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const list = trpc.workspace.list.useQuery();
  const { workspaceId, setActive } = useActiveWorkspace();
  const openExisting = trpc.workspace.openExisting.useMutation({
    onSuccess: async (ws) => {
      if (!ws) return;
      await utils.workspace.list.invalidate();
      await setActive(ws.id);
      setOpen(false);
    },
  });

  const current = list.data?.find((w) => w.id === workspaceId) ?? null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="app-no-drag h-auto flex items-center gap-2 rounded-md border border-ink-800/60 bg-ink-900/40 px-2.5 py-1 font-mono text-ui-xs text-ink-200 hover:border-ink-700 hover:bg-ink-800/40"
        >
          <Menu className="h-3 w-3 text-ink-500" />
          <span className="max-w-[140px] truncate normal-case">
            {current ? current.name : 'no workspace'}
          </span>
          <ChevronDown className={cn('h-2.5 w-2.5 text-ink-500 transition-transform', open && 'rotate-180')} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 overflow-hidden rounded-lg border-ink-700/60 bg-ink-900 p-0 shadow-float"
      >
        <DropdownMenuLabel className="border-b border-ink-800/60 px-4 py-2.5 font-mono text-ui-xs font-normal uppercase tracking-widest2 text-ink-500">
          workspaces
        </DropdownMenuLabel>
        <ScrollArea className="max-h-64">
          {list.data?.length === 0 && (
            <div className="px-4 py-3 text-ui-base text-ink-400">No workspaces yet.</div>
          )}
          {list.data?.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={async () => {
                await setActive(w.id);
              }}
              className={cn(
                'app-no-drag flex-col items-start gap-0.5 border-b border-ink-800/60 px-4 py-2 rounded-none cursor-pointer focus:bg-ink-800/60',
                w.id === workspaceId && 'bg-ink-800/40',
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-ui-lg text-ink-100">{w.name}</span>
                <span className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
                  {w.managed ? 'managed' : 'linked'}
                </span>
              </div>
              <div className="truncate font-mono text-ui-xs text-ink-500">{w.path}</div>
            </DropdownMenuItem>
          ))}
        </ScrollArea>
        <DropdownMenuSeparator className="m-0 bg-ink-800" />
        <DropdownMenuItem
          onSelect={() => openExisting.mutate()}
          disabled={openExisting.isLoading}
          className="app-no-drag gap-2 px-4 py-2.5 font-mono text-ui-xs uppercase tracking-widest2 text-amber rounded-none cursor-pointer focus:bg-ink-800/60 focus:text-amber"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {openExisting.isLoading ? 'opening…' : 'new workspace'}
        </DropdownMenuItem>
        {openExisting.error && (
          <div className="border-t border-ink-800 px-3 py-2 font-mono text-ui-xs text-signal-err">
            {openExisting.error.message}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
