import { cn } from '../../lib/utils';
import { inputClass } from './AgentFormPrimitives';

interface AgentTestPanelProps {
  agentId: string;
  testPrompt: string;
  setTestPrompt: (v: string) => void;
  testResponse: string | null;
  testError: string | null;
  isPending: boolean;
  onRun: () => void;
}

export function AgentTestPanel({
  agentId: _agentId,
  testPrompt,
  setTestPrompt,
  testResponse,
  testError,
  isPending,
  onRun,
}: AgentTestPanelProps) {
  return (
    <div className="mt-8 animate-slide-up rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
      <div className="mb-3 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
        test agent
      </div>
      <div className="flex gap-2">
        <input
          value={testPrompt}
          onChange={(e) => setTestPrompt(e.target.value)}
          placeholder="say hello…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && testPrompt.trim()) onRun();
          }}
          className={cn(inputClass, 'flex-1')}
        />
        <button
          onClick={onRun}
          disabled={isPending || !testPrompt.trim()}
          className="rounded-md border border-ink-700/60 px-4 py-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-300 transition-all hover:border-amber/30 hover:text-amber disabled:opacity-40"
        >
          {isPending ? <span className="animate-pulse">running…</span> : 'run'}
        </button>
      </div>
      {testError && (
        <div className="mt-3 rounded-md border border-signal-err/20 bg-signal-err/5 px-3 py-2.5 font-mono text-ui-xs text-signal-err">
          {testError}
        </div>
      )}
      {testResponse && (
        <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-ink-700/40 bg-ink-900/50 px-4 py-3 font-mono text-ui-sm leading-relaxed text-ink-200 whitespace-pre-wrap">
          {testResponse}
        </div>
      )}
    </div>
  );
}
