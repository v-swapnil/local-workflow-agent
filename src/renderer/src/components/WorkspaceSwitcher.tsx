import { useState } from 'react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { cn } from '../lib/utils';

export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const utils = trpc.useUtils();
  const list = trpc.workspace.list.useQuery();
  const { workspaceId, setActive } = useActiveWorkspace();
  const create = trpc.workspace.create.useMutation({
    onSuccess: async (ws) => {
      await utils.workspace.list.invalidate();
      await setActive(ws.id);
      setCreating(false);
      setNewName('');
      setOpen(false);
    },
  });
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
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="app-no-drag flex items-center gap-2 rounded-md border border-ink-800/60 bg-ink-900/40 px-2.5 py-1 font-mono text-ui-xs text-ink-200 transition-all hover:border-ink-700 hover:bg-ink-800/40"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-ink-500">
          <path d="M2 4h12M2 8h8M2 12h10" />
        </svg>
        <span className="max-w-[140px] truncate normal-case">
          {current ? current.name : 'no workspace'}
        </span>
        <svg viewBox="0 0 8 5" fill="currentColor" className={cn('h-[5px] w-2 text-ink-500 transition-transform', open && 'rotate-180')}>
          <path d="M0 0l4 4 4-4z" />
        </svg>
      </button>

      {open && (
        <div className="app-no-drag absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-ink-700/60 bg-ink-900 shadow-float animate-scale-in">
          <div className="border-b border-ink-800/60 px-4 py-2.5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
            workspaces
          </div>
          <div className="max-h-64 overflow-y-auto">
            {list.data?.length === 0 && (
              <div className="px-4 py-3 text-ui-base text-ink-400">No workspaces yet.</div>
            )}
            {list.data?.map((w) => (
              <button
                key={w.id}
                onClick={async () => {
                  await setActive(w.id);
                  setOpen(false);
                }}
                className={cn(
                  'app-no-drag flex w-full flex-col gap-0.5 border-b border-ink-800/60 px-4 py-2 text-left hover:bg-ink-800/60',
                  w.id === workspaceId && 'bg-ink-800/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ui-lg text-ink-100">{w.name}</span>
                  <span className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
                    {w.managed ? 'managed' : 'linked'}
                  </span>
                </div>
                <div className="truncate font-mono text-ui-xs text-ink-500">{w.path}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 border-t border-ink-800">
            <button
              onClick={() => {
                setCreating((c) => !c);
                setNewName('');
              }}
              className="app-no-drag border-r border-ink-800 px-3 py-2 font-mono text-ui-sm uppercase tracking-widest2 text-amber hover:bg-ink-800"
            >
              + new
            </button>
            <button
              onClick={() => openExisting.mutate()}
              disabled={openExisting.isLoading}
              className="app-no-drag px-3 py-2 font-mono text-ui-sm uppercase tracking-widest2 text-ink-200 hover:bg-ink-800 disabled:opacity-50"
            >
              {openExisting.isLoading ? 'opening…' : 'open folder…'}
            </button>
          </div>
          {creating && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = newName.trim();
                if (!name) return;
                create.mutate({ name });
              }}
              className="flex items-center gap-2 border-t border-ink-800 px-3 py-2"
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="workspace name"
                className="app-no-drag flex-1 rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-sm text-ink-100 placeholder:text-ink-500 focus:border-amber focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newName.trim() || create.isLoading}
                className="app-no-drag rounded border border-amber bg-amber/10 px-2.5 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-amber hover:bg-amber/20 disabled:opacity-50"
              >
                {create.isLoading ? '…' : 'create'}
              </button>
            </form>
          )}
          {create.error && (
            <div className="border-t border-ink-800 px-3 py-2 font-mono text-ui-xs text-signal-err">
              {create.error.message}
            </div>
          )}
          {openExisting.error && (
            <div className="border-t border-ink-800 px-3 py-2 font-mono text-ui-xs text-signal-err">
              {openExisting.error.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
