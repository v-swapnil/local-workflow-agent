import { trpc } from '@renderer/trpc';
import { FileTree } from '../FileTree';
import { FilePreview } from '../FilePreview';

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <div className="max-w-md rounded border border-dashed border-ink-700 bg-ink-900/30 px-8 py-10 font-mono text-ui-base text-ink-400">
        {children}
      </div>
    </div>
  );
}

export function WorkspaceFiles({
  workspaceId,
  activePath,
  setActivePath,
}: {
  workspaceId: string;
  activePath: string | null;
  setActivePath: (p: string | null) => void;
}) {
  const tree = trpc.file.tree.useQuery({ workspaceId, path: '', depth: 4 });
  return (
    <div className="flex h-full flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900/30 p-2">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tree.isLoading && <div className="px-3 text-ui-base text-ink-400">...</div>}
          {tree.data && (
            <FileTree root={tree.data} activePath={activePath} onOpen={setActivePath} />
          )}
          {tree.data && (tree.data.children?.length ?? 0) === 0 && (
            <div className="px-3 py-4 font-mono text-ui-sm text-ink-500">empty workspace.</div>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col">
        {activePath ? (
          <FilePreview workspaceId={workspaceId} path={activePath} />
        ) : (
          <Empty>select a file from the tree on the left.</Empty>
        )}
      </section>
    </div>
  );
}
