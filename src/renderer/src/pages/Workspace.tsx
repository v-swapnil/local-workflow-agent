import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { WorkspaceOverview } from '../components/workspace/WorkspaceOverview';
import { UniversalSearch } from '../components/workspace/UniversalSearch';
import { WorktreeSection } from '../components/workspace/WorktreeSection';
import { MemorySection } from '../components/workspace/MemorySection';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useState } from 'react';
import { WorkspaceFiles } from '@renderer/components/workspace/WorkspaceFiles';

const TABS = [
  ['search', 'search'],
  ['worktrees', 'worktrees'],
  ['memories', 'memories'],
] as const;

export function Workspace() {
  const [activePath, setActivePath] = useState<string | null>(null);

  const { workspaceId, isLoading } = useActiveWorkspace();

  return (
    <section className="mx-auto flex min-h-full flex-col p-4 animate-fade-in gap-4">
      {isLoading && <div className="font-mono text-ui-sm text-ink-500">loading workspace...</div>}

      {!isLoading && !workspaceId && (
        <div className="font-mono text-ui-sm text-ink-500">
          no workspace selected. open the workspace switcher in the top-right to create or open one.
        </div>
      )}

      {workspaceId && (
        <>
          <WorkspaceOverview workspaceId={workspaceId} />
          <Tabs defaultValue="search">
            <TabsList className="h-auto rounded-lg border border-ink-800/40 bg-ink-900/15 p-0.5">
              {TABS.map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-md px-3 py-1.5 font-mono text-ui-xs text-ink-400 data-[state=active]:bg-ink-800/60 data-[state=active]:text-amber data-[state=active]:shadow-none"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="search" className="mt-4">
              <UniversalSearch workspaceId={workspaceId} />
              <WorkspaceFiles
                workspaceId={workspaceId}
                activePath={activePath}
                setActivePath={setActivePath}
              />
            </TabsContent>
            <TabsContent value="worktrees" className="mt-4">
              <WorktreeSection workspaceId={workspaceId} />
            </TabsContent>
            <TabsContent value="memories" className="mt-4">
              <MemorySection workspaceId={workspaceId} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </section>
  );
}
