import { useState } from 'react';
import { trpc } from '../trpc';
import { AgentList } from '../components/agents/AgentList';
import { AgentFormPanel } from '../components/agents/AgentFormPanel';
import { BLANK } from '../components/agents/agentTypes';
import type { AgentFormState } from '../components/agents/agentTypes';

export function Agents() {
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormState>(BLANK);

  const { data: agents = [] } = trpc.agent.list.useQuery();
  const { data: toolsList = [] } = trpc.tool.list.useQuery();

  const upsert = trpc.agent.upsert.useMutation({
    onSuccess: async () => {
      await utils.agent.list.invalidate();
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
    const a = agents.find((x) => x.id === id);
    if (!a) return;
    setSelected(id);
    setForm({
      id: a.id,
      name: a.name,
      role: a.role,
      systemPrompt: a.systemPrompt,
      tools: a.tools ? a.tools.split(',').map((t) => t.trim()).filter(Boolean) : [],
      temperature: a.temperature,
      description: (a as { description?: string }).description ?? '',
    });
  }

  function newAgent() {
    setSelected(null);
    setForm(BLANK);
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
          const a = agents.find((x) => x.id === id);
          if (confirm(`Delete agent "${a?.name ?? id}"?`)) del.mutate({ id });
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
    </div>
  );
}
