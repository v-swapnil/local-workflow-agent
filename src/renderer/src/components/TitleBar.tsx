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
    <div className="app-drag relative z-30 flex h-10 items-center justify-between border-b border-ink-800 bg-ink-950/80 pl-4 pr-4 backdrop-blur">
      <div className="flex items-center gap-3 font-mono text-ui-sm uppercase tracking-widest2 text-ink-400">
        {/* <span className="text-amber">[ase]</span> */}
        {/* <span className="text-ink-500">/</span> */}
        <span>autonomous software engineer</span>
        {version && <span className="text-ink-500">v{version}</span>}
      </div>
      <div className="app-no-drag flex items-center gap-3 font-mono text-ui-xs uppercase tracking-widest2">
        <ModelBadge />
        <button
          onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark';
            setThemeLocal(next);
            setTheme.mutate({ value: next });
          }}
          className="rounded border border-ink-800 bg-ink-900/60 px-2 py-1 text-ink-300 hover:border-ink-700"
          title="Toggle theme (Cmd/Ctrl+Shift+L)"
        >
          {theme === 'dark' ? 'light' : 'dark'}
        </button>
        <WorkspaceSwitcher />
        <Status
          label="ollama"
          ok={ollamaOk}
          detail={ollamaOk ? `${health.data?.ollama.models?.length ?? 0} models` : 'offline'}
        />
        <Status label="db" ok={health.data?.db.ok} />
      </div>
    </div>
  );
}

function Status({ label, ok, detail }: { label: string; ok?: boolean; detail?: string }) {
  const color = ok === undefined ? 'bg-ink-500' : ok ? 'bg-signal-ok' : 'bg-signal-err';
  return (
    <div className="flex items-center gap-1.5 text-ink-400">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      <span>{label}</span>
      {detail && <span className="text-ink-500">· {detail}</span>}
    </div>
  );
}

function ModelBadge() {
  const active = trpc.llm.activeModel.useQuery();
  return (
    <div className="flex items-center gap-1.5 rounded border border-ink-800 bg-ink-900/60 px-2 py-1 text-ink-300">
      <span className="text-ink-500">model</span>
      <span className="text-amber">·</span>
      <span className="normal-case text-ink-100">{active.data ?? '…'}</span>
    </div>
  );
}
