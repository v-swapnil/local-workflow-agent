import { lazy, Suspense, useState } from 'react';
import { trpc } from '../trpc';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { SidebarListItem } from '../components/ui/sidebar-list-item';
import { Plus, Network, X } from 'lucide-react';
import type { WorkflowDefinition } from '@main/services/workflows';

// Lazy-load the heavy React Flow canvas
const WorkflowCanvas = lazy(() =>
  import('../components/workflow/WorkflowCanvas').then((m) => ({ default: m.WorkflowCanvas })),
);

function WorkflowList({
  workflows,
  selectedId,
  onSelect,
  onNew,
  onDelete,
}: {
  workflows: { id: string; name: string; description?: string | null }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
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
                subtitle={w.description ?? undefined}
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currentDef, setCurrentDef] = useState<WorkflowDefinition | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);

  const selectedWorkflow = workflows.find((w) => w.id === selectedId);

  const upsert = trpc.workflow.upsert.useMutation({
    onSuccess: async (saved) => {
      await utils.workflow.list.invalidate();
      setSelectedId(saved.id);
      setSaveError(null);
    },
    onError: (err) => setSaveError(err.message),
  });

  const del = trpc.workflow.delete.useMutation({
    onSuccess: async () => {
      await utils.workflow.list.invalidate();
      setSelectedId(null);
      setName('');
      setDescription('');
      setCurrentDef(null);
    },
  });

  const validate = trpc.workflow.validate.useQuery(
    { nodes: currentDef?.nodes ?? [], edges: currentDef?.edges ?? [] },
    { enabled: !!currentDef },
  );

  function selectWorkflow(id: string) {
    const w = workflows.find((x) => x.id === id);
    if (!w) return;
    setSelectedId(id);
    setName(w.name);
    setDescription(w.description ?? '');
    setCurrentDef({ nodes: w.nodes, edges: w.edges });
    setSaveError(null);
    setValidationResult(null);
  }

  function newWorkflow() {
    setSelectedId(null);
    setName('new-workflow');
    setDescription('');
    setCurrentDef(null);
    setSaveError(null);
    setValidationResult(null);
  }

  function save() {
    if (!name.trim()) return;
    upsert.mutate({
      id: selectedId ?? undefined,
      name: name.trim(),
      description: description || undefined,
      nodes: currentDef?.nodes ?? [],
      edges: currentDef?.edges ?? [],
    });
  }

  const agentList = agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
  }));

  const errors = validate.data?.errors ?? [];
  const isValid = !validate.data || validate.data.valid;

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
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b border-ink-800 px-4 py-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="workflow name"
            className="w-52"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="description (optional)"
            className="flex-1"
          />
          {!isValid && errors.length > 0 && (
            <span className="font-mono text-ui-xs text-signal-warn" title={errors.join('; ')}>
              ⚠ {errors.length} error{errors.length > 1 ? 's' : ''}
            </span>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={save}
            disabled={upsert.isPending || !name.trim()}
          >
            {upsert.isPending ? 'saving...' : 'save'}
          </Button>
          {saveError && <span className="font-mono text-ui-xs text-signal-err">{saveError}</span>}
        </div>

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
            <div className="flex h-full items-center justify-center font-mono text-ui-xs text-ink-500">
              select or create a workflow
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
