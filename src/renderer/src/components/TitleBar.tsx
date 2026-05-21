import { trpc } from '../trpc';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { useUI } from '../store/ui';

export function TitleBar() {
  const utils = trpc.useUtils();
  const health = trpc.health.useQuery(undefined, { refetchInterval: 8000 });
  const setTheme = trpc.settings.setTheme.useMutation({
    onSuccess: () => utils.settings.theme.invalidate(),
  });
  const theme = useUI((s) => s.theme);
  const setThemeLocal = useUI((s) => s.setTheme);
  const ollamaOk = health.data?.ollama.ok;
  const version = health.data?.app.version ?? '';

  return (
    <div className="app-drag relative z-30 flex h-11 items-center justify-between border-b border-ink-800/60 bg-ink-950/90 pl-[80px] pr-4 backdrop-blur-md">
      <div className="flex items-center gap-2.5 font-mono text-ui-xs tracking-widest2 text-ink-500">
        <span className="uppercase">autonomous software engineer</span>
        {version && (
          <span className="rounded-full bg-ink-800/60 px-1.5 py-0.5 text-ui-2xs text-ink-500">{version}</span>
        )}
      </div>
      <div className="app-no-drag flex items-center gap-2">
        <ModelBadge />
        <button
          onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark';
            setThemeLocal(next);
            setTheme.mutate({ value: next });
          }}
          className="group flex h-7 w-7 items-center justify-center rounded-md border border-ink-800/60 bg-ink-900/40 text-ink-400 transition-all hover:border-ink-700 hover:bg-ink-800/60 hover:text-ink-200"
          title="Toggle theme (Cmd/Ctrl+Shift+L)"
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="h-3.5 w-3.5 transition-transform group-hover:rotate-45">
              <circle cx="8" cy="8" r="3" />
              <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M13.5 9.5a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" />
            </svg>
          )}
        </button>
        <WorkspaceSwitcher />
        <div className="mx-1 h-4 w-px bg-ink-800/60" />
        <StatusDot
          label="ollama"
          ok={ollamaOk}
          detail={ollamaOk ? `${health.data?.ollama.models?.length ?? 0}` : undefined}
        />
        <StatusDot label="db" ok={health.data?.db.ok} />
      </div>
    </div>
  );
}

function StatusDot({ label, ok, detail }: { label: string; ok?: boolean; detail?: string }) {
  const color = ok === undefined ? 'bg-ink-500' : ok ? 'bg-signal-ok' : 'bg-signal-err';
  return (
    <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
      <span className={`h-[5px] w-[5px] rounded-full ${color} ${ok === false ? 'animate-pulse' : ''}`} />
      <span>{label}</span>
      {detail && <span className="text-ink-600">{detail}</span>}
    </div>
  );
}

function ModelBadge() {
  const active = trpc.llm.activeModel.useQuery();
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-ink-800/60 bg-ink-900/40 px-2.5 py-1 font-mono text-ui-xs text-ink-300">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="h-3 w-3 text-ink-500">
        <rect x="2" y="2" width="12" height="12" rx="2" />
        <circle cx="6" cy="6.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="10" cy="6.5" r="1" fill="currentColor" stroke="none" />
        <path d="M5.5 10c.5 1 1.5 1.5 2.5 1.5s2-.5 2.5-1.5" />
      </svg>
      <span className="normal-case text-ink-200">{active.data ?? '…'}</span>
    </div>
  );
}
