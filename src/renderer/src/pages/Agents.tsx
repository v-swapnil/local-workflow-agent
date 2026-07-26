import { useState } from 'react';
import { trpc } from '../trpc';
import { AgentList } from '../components/agents/AgentList';
import { AgentFormPanel } from '../components/agents/AgentFormPanel';
import { NewAgentModal } from '../components/agents/NewAgentModal';
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
    kind: agent.kind,
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
      kind: form.kind,
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
              kind: BLANK.kind,
            })
          }
        />
      )}
    </div>
  );
}
