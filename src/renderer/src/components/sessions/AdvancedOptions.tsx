import { trpc } from '../../trpc';

interface Props {
  modelOverride: string;
  agentId: string;
  workflowId: string;
  onModelOverride: (v: string) => void;
  onAgentId: (v: string) => void;
  onWorkflowId: (v: string) => void;
}

export function AdvancedOptions({
  modelOverride,
  agentId,
  workflowId,
  onModelOverride,
  onAgentId,
  onWorkflowId,
}: Props) {
  const { data: modelsData } = trpc.llm.ollamaModels.useQuery();
  const { data: agents = [] } = trpc.agent.list.useQuery();
  const { data: workflowsData = [] } = trpc.workflow.list.useQuery();

  const models = modelsData ?? [];
  const workflows = workflowsData as { id: string; name: string }[];

  const selectClass =
    'rounded-md border border-ink-700/60 bg-ink-900/40 px-2 py-1 font-mono text-ui-xs text-ink-200 transition-colors focus:border-amber/30 focus:outline-none hover:border-ink-600';

  return (
    <details className="group">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500 transition-colors hover:text-ink-300">
        <svg
          className="h-2.5 w-2.5 transition-transform group-open:rotate-90"
          viewBox="0 0 8 10"
          fill="currentColor"
        >
          <path d="M1 1l6 4-6 4V1z" />
        </svg>
        options
      </summary>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-ui-2xs text-ink-500">model</span>
          <select
            value={modelOverride}
            onChange={(e) => onModelOverride(e.target.value)}
            className={selectClass}
          >
            <option value="">— default —</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-ui-2xs text-ink-500">agent</span>
          <select
            value={agentId}
            onChange={(e) => {
              onAgentId(e.target.value);
              if (e.target.value) onWorkflowId('');
            }}
            className={selectClass}
          >
            <option value="">— none —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.role})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-ui-2xs text-ink-500">workflow</span>
          <select
            value={workflowId}
            onChange={(e) => {
              onWorkflowId(e.target.value);
              if (e.target.value) onAgentId('');
            }}
            className={selectClass}
          >
            <option value="">— none —</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
