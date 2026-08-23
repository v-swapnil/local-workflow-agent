import { useEffect, useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { trpc } from '../trpc';
import { AgentList } from '../components/agents/AgentList';
import { AgentFormPanel } from '../components/agents/AgentFormPanel';
import { NewAgentModal } from '../components/agents/NewAgentModal';
import { Button } from '../components/ui/button';
import { BLANK } from '../components/agents/agentTypes';
import type { AgentFormState } from '../components/agents/agentTypes';
import { AgentRecord } from '@shared/schema';

function createAgentFormState(agent: AgentRecord): AgentFormState {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    systemPrompt: agent.systemPrompt,
    tools: agent.tools
      ? agent.tools
          .split(',')
          .map((tool) => tool.trim())
          .filter(Boolean)
      : [],
    temperature: agent.temperature,
    description: agent.description ?? '',
  };
}

export function Agents() {
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormState>(BLANK);
  const [showNewModal, setShowNewModal] = useState(false);

  const { data: agents = [] } = trpc.agent.list.useQuery();
  const { data: toolsList = [] } = trpc.tool.list.useQuery();

  const upsert = trpc.agent.upsert.useMutation({
    onSuccess: async () => {
      await utils.agent.list.invalidate();
    },
  });
  const createAgent = trpc.agent.upsert.useMutation({
    onSuccess: async (agent) => {
      await utils.agent.list.invalidate();
      setShowNewModal(false);
      setSelected(agent.id);
      setForm(createAgentFormState(agent));
    },
  });
  const del = trpc.agent.delete.useMutation({
    onSuccess: async () => {
      await utils.agent.list.invalidate();
      setSelected(null);
      setForm(BLANK);
    },
  });

  function selectAgent(id: string) {
    const agent = agents.find((candidate) => candidate.id === id);
    if (!agent) return;
    setSelected(id);
    setForm(createAgentFormState(agent));
  }

  // Auto-select the first agent when the list loads and nothing is selected.
  useEffect(() => {
    if (selected) return;
    const firstAgent = agents[0];
    if (!firstAgent) return;
    setSelected(firstAgent.id);
    setForm(createAgentFormState(firstAgent));
  }, [agents, selected]);

  function newAgent() {
    setShowNewModal(true);
  }

  function save() {
    upsert.mutate({
      id: form.id,
      name: form.name,
      role: form.role,
      systemPrompt: form.systemPrompt,
      tools: form.tools.length > 0 ? form.tools.join(',') : null,
      temperature: form.temperature,
      description: form.description || undefined,
    });
  }

  return (
    <div className="flex h-full min-h-0 animate-fade-in">
      <AgentList
        agents={agents}
        selected={selected}
        onSelect={selectAgent}
        onNew={newAgent}
        onDelete={(id) => {
          const agent = agents.find((candidate) => candidate.id === id);
          if (confirm(`Delete agent "${agent?.name ?? id}"?`)) del.mutate({ id });
        }}
      />
      {agents.length === 0 ? (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-800/40">
            <Bot className="h-5 w-5 text-ink-500" strokeWidth={1.3} />
          </div>
          <div className="font-mono text-ui-sm text-ink-300">no agents yet</div>
          <div className="max-w-xs font-mono text-ui-xs text-ink-500">
            create an agent to define its role, system prompt, and tools
          </div>
          <Button variant="outline" size="sm" onClick={newAgent} className="mt-1 gap-1.5">
            <Plus className="h-3 w-3" strokeWidth={1.5} />
            new agent
          </Button>
        </div>
      ) : (
        <AgentFormPanel
          form={form}
          setForm={setForm}
          availableTools={toolsList}
          onSave={save}
          onDelete={() => form.id && del.mutate({ id: form.id })}
          isSaving={upsert.isPending}
          isDeleting={del.isPending}
          saveError={upsert.error?.message}
        />
      )}
      {showNewModal && (
        <NewAgentModal
          isPending={createAgent.isPending}
          onClose={() => setShowNewModal(false)}
          onCreate={({ name, role, systemPrompt }) =>
            createAgent.mutate({
              name,
              role,
              systemPrompt: systemPrompt ?? '',
              temperature: BLANK.temperature,
            })
          }
        />
      )}
    </div>
  );
}
