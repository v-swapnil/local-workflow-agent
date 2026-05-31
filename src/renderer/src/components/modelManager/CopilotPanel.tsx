import { useState } from 'react';
import { trpc } from '../../trpc';
import { Pill } from '../Pill';
import { ModelDropdown } from './ModelDropdown';

export function CopilotPanel() {
  const utils = trpc.useUtils();
  const copilotHealth = trpc.llm.copilotHealth.useQuery(undefined, { refetchInterval: 5000 });
  const copilotModels = trpc.llm.copilotModels.useQuery(undefined, { refetchInterval: 15000 });
  const activeModel = trpc.llm.activeModel.useQuery();
  const setActiveModel = trpc.llm.setActiveModel.useMutation({
    onSuccess: () => utils.llm.activeModel.invalidate(),
  });
  const secondary = trpc.llm.secondaryModel.useQuery();
  const setSecondary = trpc.llm.setSecondaryModel.useMutation({
    onSuccess: () => utils.llm.secondaryModel.invalidate(),
  });
  const cliUrl = trpc.llm.copilotCliUrl.useQuery();
  const setCliUrl = trpc.llm.setCopilotCliUrl.useMutation({
    onSuccess: () => {
      utils.llm.copilotCliUrl.invalidate();
      utils.llm.copilotHealth.invalidate();
      utils.llm.copilotModels.invalidate();
    },
  });
  const [urlDraft, setUrlDraft] = useState('');
  const [editing, setEditing] = useState(false);

  const ok = copilotHealth.data?.ok === true;
  const state = copilotHealth.isLoading ? 'checking' : ok ? 'online' : 'offline';
  const modelList = copilotModels.data ?? [];

  return (
    <>
      <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
              provider
            </div>
            <div className="mt-1 font-mono text-ui-base font-medium text-ink-50">
              GitHub Copilot
            </div>
            <div className="font-mono text-ui-xs text-ink-500">
              {editing ? (
                <form
                  className="mt-1 flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (urlDraft.trim()) {
                      setCliUrl.mutate({ url: urlDraft.trim() });
                      setEditing(false);
                    }
                  }}
                >
                  <input
                    autoFocus
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    className="w-40 rounded border border-ink-700 bg-ink-950 px-2 py-0.5 font-mono text-ui-xs text-ink-100 focus:border-amber focus:outline-none"
                    placeholder="localhost:49393"
                  />
                  <button type="submit" className="font-mono text-ui-xs text-amber hover:underline">
                    save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="font-mono text-ui-xs text-ink-500 hover:underline"
                  >
                    cancel
                  </button>
                </form>
              ) : (
                <>
                  {copilotHealth.data?.url ?? cliUrl.data ?? '...'}{' '}
                  <button
                    onClick={() => {
                      setUrlDraft(cliUrl.data ?? '');
                      setEditing(true);
                    }}
                    className="text-amber hover:underline"
                  >
                    edit
                  </button>
                </>
              )}
            </div>
          </div>
          <Pill ok={copilotHealth.isLoading ? undefined : ok} label={state} />
        </div>
        {!ok && !copilotHealth.isLoading && (
          <div className="rounded-lg border border-ink-700/40 bg-ink-950/80 px-4 py-3 font-mono text-ui-xs text-ink-300">
            <div className="mb-1 text-amber">Copilot CLI not reachable.</div>
            Start the server with <code className="text-amber">copilot --stdio=false</code>, then
            check the URL above matches the port.
          </div>
        )}
      </div>

      <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-5">
        <div className="mb-4 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
          available models
        </div>
        {!ok ? (
          <div className="font-mono text-ui-xs text-ink-500">—</div>
        ) : modelList.length === 0 ? (
          <div className="font-mono text-ui-xs text-ink-500">
            no models returned — check authentication
          </div>
        ) : (
          <div className="space-y-4">
            <ModelDropdown
              label="main model"
              description="Primary model for tasks, planning, and chat"
              models={modelList}
              value={activeModel.data ?? ''}
              onChange={(name) => setActiveModel.mutate({ name })}
            />
            <ModelDropdown
              label="secondary model"
              description="Lighter model for sub-tasks and minor operations"
              models={modelList}
              value={secondary.data ?? ''}
              onChange={(name) => setSecondary.mutate({ name })}
            />
          </div>
        )}
      </div>
    </>
  );
}
