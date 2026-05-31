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
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800/60">
      <div className="flex items-center justify-between border-b border-ink-800/60 px-4 py-3">
        <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
          workflows
        </span>
        <button
          onClick={onNew}
          className="flex items-center gap-1 rounded-md border border-ink-700/60 bg-ink-800/30 px-2 py-1 font-mono text-ui-xs text-ink-300 transition-all hover:border-amber/30 hover:bg-amber/5 hover:text-amber"
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-2.5 w-2.5">
            <path d="M6 2v8M2 6h8" />
          </svg>
          new
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {workflows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800/40">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="h-4 w-4 text-ink-500">
                <circle cx="4" cy="4" r="1.5" />
                <circle cx="12" cy="4" r="1.5" />
                <circle cx="8" cy="12" r="1.5" />
                <path d="M5.2 5.2L7 10.5M10.8 5.2L9 10.5" />
              </svg>
            </div>
            <span className="font-mono text-ui-xs text-ink-500">no workflows yet</span>
          </div>
        ) : (
          <ul className="space-y-0.5 px-2 py-2">
            {workflows.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => onSelect(w.id)}
                  className={`relative flex w-full flex-col gap-0.5 rounded-md border px-3 py-2.5 text-left transition-all ${
                    selectedId === w.id
                      ? 'border-amber/20 bg-ink-800/60 text-ink-100 shadow-sm shadow-amber/5'
                      : 'border-transparent text-ink-300 hover:border-ink-700/60 hover:bg-ink-800/30 hover:text-ink-100'
                  }`}
                >
                  {selectedId === w.id && (
                    <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-amber" />
                  )}
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
            className="rounded-md bg-amber/90 px-4 py-1.5 font-mono text-ui-xs font-medium uppercase tracking-widest2 text-ink-950 shadow-glow-sm transition-all hover:bg-amber hover:shadow-glow disabled:opacity-40 disabled:shadow-none"
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
