import { lazy, Suspense, useState } from 'react';
import { trpc } from '../trpc';
import type { WorkflowDefinition } from '../../../main/services/workflows';

// Lazy-load the heavy React Flow canvas
const WorkflowCanvas = lazy(() =>
  import('../components/workflow/WorkflowCanvas').then((m) => ({ default: m.WorkflowCanvas })),
);

function WorkflowList({
  workflows,
  selectedId,
  onSelect,
  onNew,
}: {
  workflows: { id: string; name: string; description?: string | null }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800">
      <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
        <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
          workflows
        </span>
        <button
          onClick={onNew}
          className="rounded border border-ink-700 px-2 py-0.5 font-mono text-ui-xs text-ink-300 hover:border-amber-700/60 hover:text-amber-300"
        >
          + new
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {workflows.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-ui-xs text-ink-500">
            no workflows yet
          </div>
        ) : (
          <ul className="space-y-0.5 px-2 py-2">
            {workflows.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => onSelect(w.id)}
                  className={`flex w-full flex-col gap-0.5 rounded px-3 py-2 text-left transition-colors ${
                    selectedId === w.id
                      ? 'bg-ink-800 text-ink-100 shadow-inset-hair'
                      : 'text-ink-300 hover:bg-ink-800/60 hover:text-ink-100'
                  }`}
                >
                  <span className="truncate font-mono text-ui-sm font-medium">{w.name}</span>
                  {w.description && (
                    <span className="truncate font-mono text-ui-xs text-ink-500">
                      {w.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
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
    { graphJson: currentDef ? JSON.stringify(currentDef) : '{}' },
    { enabled: !!currentDef },
  );

  function selectWorkflow(id: string) {
    const w = workflows.find((x) => x.id === id);
    if (!w) return;
    setSelectedId(id);
    setName(w.name);
    setDescription(w.description ?? '');
    try {
      setCurrentDef(JSON.parse(w.graphJson) as WorkflowDefinition);
    } catch {
      setCurrentDef(null);
    }
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
      graphJson: currentDef ? JSON.stringify(currentDef) : '{"nodes":[],"edges":[]}',
    });
  }

  const agentList = agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    model: a.model,
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
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b border-ink-800 px-4 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="workflow name"
            className="w-52 rounded border border-ink-700 bg-ink-950 px-3 py-1 font-mono text-ui-sm text-ink-100 focus:border-amber-700/60 focus:outline-none"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="description (optional)"
            className="flex-1 rounded border border-ink-700 bg-ink-950 px-3 py-1 font-mono text-ui-xs text-ink-400 focus:border-amber-700/60 focus:outline-none"
          />
          {!isValid && errors.length > 0 && (
            <span className="font-mono text-ui-xs text-signal-warn" title={errors.join('; ')}>
              ⚠ {errors.length} error{errors.length > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={save}
            disabled={upsert.isPending || !name.trim()}
            className="rounded border border-amber-700/60 bg-amber-950/30 px-4 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-amber-300 hover:bg-amber-950/60 disabled:opacity-40"
          >
            {upsert.isPending ? 'saving…' : 'save'}
          </button>
          {selectedId && (
            <button
              onClick={() => del.mutate({ id: selectedId })}
              disabled={del.isPending}
              className="rounded border border-signal-err/40 px-3 py-1 font-mono text-ui-xs text-signal-err hover:bg-signal-err/10 disabled:opacity-40"
            >
              delete
            </button>
          )}
          {saveError && (
            <span className="font-mono text-ui-xs text-signal-err">{saveError}</span>
          )}
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
