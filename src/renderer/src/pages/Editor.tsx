import { useState } from 'react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { FileTree } from '../components/FileTree';
import { MonacoPane } from '../components/MonacoPane';

export function Editor() {
  const { workspaceId, isLoading } = useActiveWorkspace();
  const [activePath, setActivePath] = useState<string | null>(null);

  if (isLoading) {
    return <Empty>loading workspace…</Empty>;
  }
  if (!workspaceId) {
    return (
      <Empty>
        no workspace selected. open the workspace switcher in the top-right to create or open one.
      </Empty>
    );
  }

  return (
    <EditorView workspaceId={workspaceId} activePath={activePath} setActivePath={setActivePath} />
  );
}

function EditorView({
  workspaceId,
  activePath,
  setActivePath,
}: {
  workspaceId: string;
  activePath: string | null;
  setActivePath: (p: string | null) => void;
}) {
  const tree = trpc.file.tree.useQuery({ workspaceId, path: '', depth: 4 });
  const utils = trpc.useUtils();
  const writeMut = trpc.file.write.useMutation({
    onSuccess: () => utils.file.tree.invalidate({ workspaceId }),
  });

  const ws = trpc.workspace.get.useQuery({ id: workspaceId });

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950">
      <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
        <div>
          <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
            workspace
          </div>
          <div className="mt-0.5 font-serif text-lg text-ink-100">
            {ws.data?.name ?? '—'}
            <span className="ml-2 font-mono text-ui-xs text-ink-500">{ws.data?.path}</span>
          </div>
        </div>
        <button
          onClick={async () => {
            const name = window.prompt('New file path (relative)?');
            if (!name) return;
            await writeMut.mutateAsync({ workspaceId, path: name, content: '' });
            setActivePath(name);
          }}
          className="rounded border border-ink-700 bg-ink-900 px-3 py-1.5 font-mono text-ui-sm uppercase tracking-widest2 text-amber hover:border-amber"
        >
          + new file
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900/30">
          <div className="border-b border-ink-800 px-3 py-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
            files
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {tree.isLoading && <div className="px-3 text-ui-base text-ink-400">…</div>}
            {tree.data && (
              <FileTree root={tree.data} activePath={activePath} onOpen={setActivePath} />
            )}
            {tree.data && (tree.data.children?.length ?? 0) === 0 && (
              <div className="px-3 py-4 font-mono text-ui-sm text-ink-500">
                empty workspace.
                <br />
                create a file →
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          {activePath ? (
            <MonacoPane workspaceId={workspaceId} path={activePath} />
          ) : (
            <Empty>select a file from the tree on the left.</Empty>
          )}
        </section>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <div className="max-w-md rounded border border-dashed border-ink-700 bg-ink-900/30 px-8 py-10 font-mono text-ui-base text-ink-400">
        {children}
      </div>
    </div>
  );
}
