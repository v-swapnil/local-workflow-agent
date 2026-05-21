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
  const { data: modelsData } = trpc.llm.listModels.useQuery();
  const { data: agents = [] } = trpc.agent.list.useQuery();
  const { data: workflowsData = [] } = trpc.workflow.list.useQuery();

  const models = modelsData ?? [];
  const workflows = workflowsData as { id: string; name: string }[];

  return (
    <details className="mt-2">
      <summary className="cursor-pointer select-none font-mono text-ui-xs uppercase tracking-widest2 text-ink-500 hover:text-ink-300">
        ▸ advanced options
      </summary>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {/* Model override */}
        <label className="flex flex-col gap-1">
          <span className="font-mono text-ui-xs text-ink-500">model</span>
          <select
            value={modelOverride}
            onChange={(e) => onModelOverride(e.target.value)}
            className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-200 focus:border-amber-700/60 focus:outline-none"
          >
            <option value="">— default —</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        {/* Agent picker */}
        <label className="flex flex-col gap-1">
          <span className="font-mono text-ui-xs text-ink-500">agent</span>
          <select
            value={agentId}
            onChange={(e) => {
              onAgentId(e.target.value);
              if (e.target.value) onWorkflowId(''); // mutually exclusive
            }}
            className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-200 focus:border-amber-700/60 focus:outline-none"
          >
            <option value="">— none —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.role})
              </option>
            ))}
          </select>
        </label>

        {/* Workflow picker */}
        <label className="flex flex-col gap-1">
          <span className="font-mono text-ui-xs text-ink-500">workflow</span>
          <select
            value={workflowId}
            onChange={(e) => {
              onWorkflowId(e.target.value);
              if (e.target.value) onAgentId(''); // mutually exclusive
            }}
            className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-200 focus:border-amber-700/60 focus:outline-none"
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
