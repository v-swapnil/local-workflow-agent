import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { trpc } from '../trpc';
import { Button } from '../components/ui/button';
import { SidebarListItem } from '../components/ui/sidebar-list-item';
import { NewWorkflowModal } from '../components/workflow/NewWorkflowModal';
import { SimpleTooltip } from '../components/ui/tooltip';
import { Plus, Network, X, AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { WorkflowDefinition } from '@main/services/workflows';

// Lazy-load the heavy React Flow canvas
const WorkflowCanvas = lazy(() =>
  import('../components/workflow/WorkflowCanvas').then((m) => ({ default: m.WorkflowCanvas })),
);

// Stable serialization of a workflow's saveable state, used to detect real changes.
function snapshot(name: string, description: string, def: WorkflowDefinition | null): string {
  return JSON.stringify({
    name: name.trim(),
    description: description ?? '',
    nodes: def?.nodes ?? [],
    edges: def?.edges ?? [],
  });
}

function WorkflowList({
  workflows,
  selectedId,
  onSelect,
  onNew,
  onDelete,
}: {
  workflows: { id: number; name: string; description?: string | null }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <aside className="flex overflow-y-auto w-60 shrink-0 flex-col border-r border-ink-800/60 group/sidebar p-4">
      {workflows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800/40">
            <Network className="h-4 w-4 text-ink-500" strokeWidth={1.3} />
          </div>
          <span className="font-mono text-ui-xs text-ink-500">no workflows yet</span>
        </div>
      ) : (
        <ul className="space-y-px">
          {workflows.map((w) => (
            <li key={w.id}>
              <SidebarListItem
                title={w.name}
                isActive={selectedId === w.id}
                onSelect={() => onSelect(w.id)}
                description={w.description ?? undefined}
                actions={
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 rounded p-1 text-ink-600 hover:bg-rose-950/40 hover:text-rose-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(w.id);
                    }}
                    title="Delete workflow"
                  >
                    <X className="h-3 w-3" strokeWidth={1.2} />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        size="xs"
        className="flex invisible !mt-2 group-hover/sidebar:visible items-center w-full border-dashed gap-1.5 py-4 font-mono hover:border-amber/30 hover:bg-amber/8 hover:text-amber"
        onClick={onNew}
      >
        <Plus className="h-3 w-3" strokeWidth={1.5} />
        new workflow
      </Button>
    </aside>
  );
}

export function Workflows() {
  const utils = trpc.useUtils();
  const { data: workflows = [] } = trpc.workflow.list.useQuery();
  const { data: agents = [] } = trpc.agent.list.useQuery();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currentDef, setCurrentDef] = useState<WorkflowDefinition | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  // Snapshot of the last successfully persisted state, to avoid redundant auto-saves.
  const savedRef = useRef<string | null>(null);

  const upsert = trpc.workflow.upsert.useMutation({
    onSuccess: async (saved) => {
      savedRef.current = snapshot(saved.name, saved.description ?? '', {
        nodes: saved.nodes,
        edges: saved.edges,
      });
      await utils.workflow.list.invalidate();
      setSelectedId(saved.id);
    },
  });

  const createWorkflow = trpc.workflow.upsert.useMutation({
    onSuccess: async (saved) => {
      await utils.workflow.list.invalidate();
      setSelectedId(saved.id);
      setName(saved.name);
      setDescription(saved.description ?? '');
      setCurrentDef({ nodes: saved.nodes, edges: saved.edges });
      savedRef.current = snapshot(saved.name, saved.description ?? '', {
        nodes: saved.nodes,
        edges: saved.edges,
      });
      setShowNewModal(false);
    },
  });

  const del = trpc.workflow.delete.useMutation({
    onSuccess: async () => {
      await utils.workflow.list.invalidate();
      setSelectedId(null);
      setName('');
      setDescription('');
      setCurrentDef(null);
      savedRef.current = null;
    },
  });

  const validate = trpc.workflow.validate.useQuery(
    { nodes: currentDef?.nodes ?? [], edges: currentDef?.edges ?? [] },
    { enabled: !!currentDef },
  );

  function selectWorkflow(id: number) {
    const w = workflows.find((x) => x.id === id);
    if (!w) return;
    setSelectedId(id);
    setName(w.name);
    setDescription(w.description ?? '');
    setCurrentDef({ nodes: w.nodes, edges: w.edges });
    savedRef.current = snapshot(w.name, w.description ?? '', { nodes: w.nodes, edges: w.edges });
  }

  // Auto-select the first workflow when the list loads and nothing is selected.
  useEffect(() => {
    if (selectedId) return;
    const firstWorkflow = workflows[0];
    if (!firstWorkflow) return;
    setSelectedId(firstWorkflow.id);
    setName(firstWorkflow.name);
    setDescription(firstWorkflow.description ?? '');
    setCurrentDef({ nodes: firstWorkflow.nodes, edges: firstWorkflow.edges });
    savedRef.current = snapshot(firstWorkflow.name, firstWorkflow.description ?? '', {
      nodes: firstWorkflow.nodes,
      edges: firstWorkflow.edges,
    });
  }, [workflows, selectedId]);

  function newWorkflow() {
    setShowNewModal(true);
  }

  const agentList = agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
  }));

  const errors = validate.data?.errors ?? [];
  const isValid = !validate.data || validate.data.valid;

  // Auto-save: debounced, and only when the workflow is valid and actually changed.
  useEffect(() => {
    if (!selectedId || !currentDef || !name.trim()) return;
    if (!isValid) return;
    if (snapshot(name, description, currentDef) === savedRef.current) return;

    const timer = setTimeout(() => {
      upsert.mutate({
        id: selectedId,
        name: name.trim(),
        description: description || undefined,
        nodes: currentDef.nodes,
        edges: currentDef.edges,
      });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, name, description, currentDef, isValid]);

  return (
    <div className="flex h-full min-h-0">
      <WorkflowList
        workflows={workflows}
        selectedId={selectedId}
        onSelect={selectWorkflow}
        onNew={newWorkflow}
        onDelete={(id) => {
          const w = workflows.find((x) => x.id === id);
          if (confirm(`Delete workflow "${w?.name ?? id}"?`)) del.mutate({ id });
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        {name && (
          <header className="flex items-center justify-between gap-4 border-b border-ink-800/60 px-5 py-3">
            <div className="min-w-0">
              <h1 className="truncate font-mono text-ui-sm text-ink-100">{name}</h1>
              {description ? (
                <p className="truncate font-mono text-ui-xs text-ink-500">{description}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center">
              {errors.length > 0 ? (
                <SimpleTooltip
                  side='bottom'
                  className="max-w-xs"
                  content={
                    <ul className="space-y-1">
                      {errors.map((err, i) => (
                        <li key={i} className="flex gap-1.5 font-mono text-ui-xs text-ink-300">
                          <span className="text-ink-500">•</span>
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                  }
                >
                  <span className="flex cursor-default items-center gap-1.5 font-mono text-ui-xs text-signal-err">
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {errors.length} error{errors.length > 1 ? 's' : ''}
                  </span>
                </SimpleTooltip>
              ) : upsert.isPending ? (
                <span className="flex items-center gap-1.5 font-mono text-ui-xs text-ink-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                  saving
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-mono text-ui-xs text-signal-ok">
                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                  saved
                </span>
              )}
            </div>
          </header>
        )}

        {/* Canvas */}
        <div className="min-h-0 flex-1">
          {name ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center font-mono text-ui-xs text-ink-500">
                  loading canvas…
                </div>
              }
            >
              <WorkflowCanvas
                key={selectedId ?? 'new'}
                initialDefinition={currentDef}
                agents={agentList}
                onChange={setCurrentDef}
              />
            </Suspense>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-800/40">
                <Network className="h-5 w-5 text-ink-500" strokeWidth={1.3} />
              </div>
              <div className="font-mono text-ui-sm text-ink-300">no workflows yet</div>
              <div className="max-w-xs font-mono text-ui-xs text-ink-500">
                create a workflow to orchestrate agents on a canvas
              </div>
              <Button variant="outline" size="sm" onClick={newWorkflow} className="mt-1 gap-1.5">
                <Plus className="h-3 w-3" strokeWidth={1.5} />
                new workflow
              </Button>
            </div>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewWorkflowModal
          isPending={createWorkflow.isPending}
          onClose={() => setShowNewModal(false)}
          onCreate={({ name: wfName, description: wfDesc }) =>
            createWorkflow.mutate({
              name: wfName,
              description: wfDesc,
              nodes: [],
              edges: [],
            })
          }
        />
      )}
    </div>
  );
}
