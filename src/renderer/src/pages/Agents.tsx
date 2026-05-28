import { useState } from 'react';
import { trpc } from '../trpc';
import { PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';
import { AgentList } from '../components/agents/AgentList';
import { AgentFormPanel } from '../components/agents/AgentFormPanel';
import { AgentTestPanel } from '../components/agents/AgentTestPanel';
import { BLANK } from '../components/agents/agentTypes';
import type { AgentFormState } from '../components/agents/agentTypes';

export function Agents() {
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormState>(BLANK);
  const [testPrompt, setTestPrompt] = useState('');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const { data: agents = [] } = trpc.agent.list.useQuery();
  const { data: modelsData } = trpc.llm.listModelsByProvider.useQuery({ provider: form.provider });
  const models = modelsData ?? [];

  const upsert = trpc.agent.upsert.useMutation({
    onSuccess: async () => {
      await utils.agent.list.invalidate();
      setTestResponse(null);
    },
  });
  const del = trpc.agent.delete.useMutation({
    onSuccess: async () => {
      await utils.agent.list.invalidate();
      setSelected(null);
      setForm(BLANK);
    },
  });
  const test = trpc.agent.test.useMutation({
    onSuccess: (data) => {
      setTestResponse(data.response);
      setTestError(null);
    },
    onError: (err) => setTestError(err.message),
  });

  function selectAgent(id: string) {
    const a = agents.find((x) => x.id === id);
    if (!a) return;
    setSelected(id);
    setTestResponse(null);
    setTestError(null);
    setForm({
      id: a.id,
      name: a.name,
      role: a.role,
      model: a.model,
      systemPrompt: a.systemPrompt,
      tools: a.tools ?? '',
      temperature: a.temperature,
      graphMode: (a.graphMode as 'full' | 'direct') ?? 'full',
      maxIterations: (a as { maxIterations?: number }).maxIterations ?? 10,
      description: (a as { description?: string }).description ?? '',
      provider: ((a as { provider?: string }).provider as ProviderId) ?? PROVIDERS.OLLAMA,
    });
  }

  function newAgent() {
    setSelected(null);
    setForm(BLANK);
    setTestResponse(null);
    setTestError(null);
  }

  function save() {
    upsert.mutate({
      id: form.id,
      name: form.name,
      role: form.role,
      model: form.model,
      systemPrompt: form.systemPrompt,
      tools: form.tools || null,
      temperature: form.temperature,
      graphMode: form.graphMode,
      maxIterations: form.maxIterations,
      description: form.description || undefined,
      provider: form.provider,
    });
  }

  return (
    <div className="flex h-full min-h-0 animate-fade-in">
      <AgentList
        agents={agents.map((a) => ({ ...a, provider: (a as { provider?: string }).provider }))}
        selected={selected}
        onSelect={selectAgent}
        onNew={newAgent}
      />
      <AgentFormPanel
        form={form}
        setForm={setForm}
        models={models}
        onSave={save}
        onDelete={() => form.id && del.mutate({ id: form.id })}
        isSaving={upsert.isPending}
        isDeleting={del.isPending}
        saveError={upsert.error?.message}
      >
        {form.id && (
          <AgentTestPanel
            agentId={form.id}
            testPrompt={testPrompt}
            setTestPrompt={setTestPrompt}
            testResponse={testResponse}
            testError={testError}
            isPending={test.isPending}
            onRun={() => form.id && test.mutate({ id: form.id, prompt: testPrompt.trim() })}
          />
        )}
      </AgentFormPanel>
    </div>
  );
}
