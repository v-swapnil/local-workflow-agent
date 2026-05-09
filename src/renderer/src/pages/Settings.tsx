import { PageShell } from '../components/PageShell';
import { ModelManager } from '../components/ModelManager';
import { DebugChat } from '../components/DebugChat';
import { trpc } from '../trpc';
import { useUI, type TextSize } from '../store/ui';

export function Settings() {
  const health = trpc.health.useQuery();
  const utils = trpc.useUtils();
  const theme = useUI((s) => s.theme);
  const setThemeLocal = useUI((s) => s.setTheme);
  const textSize = useUI((s) => s.textSize);
  const setTextSizeLocal = useUI((s) => s.setTextSize);
  const setTheme = trpc.settings.setTheme.useMutation({
    onSuccess: () => utils.settings.theme.invalidate(),
  });
  const setTextSize = trpc.settings.setTextSize.useMutation({
    onSuccess: () => utils.settings.textSize.invalidate(),
  });
  const openLogs = trpc.settings.openLogsFolder.useMutation();
  const autoApprove = trpc.approval.autoApprove.useQuery();
  const setAuto = trpc.approval.setAutoApprove.useMutation({
    onSuccess: () => utils.approval.autoApprove.invalidate(),
  });
  const autoBranch = trpc.git.autoBranch.useQuery();
  const setAutoBranch = trpc.git.setAutoBranch.useMutation({
    onSuccess: () => utils.git.autoBranch.invalidate(),
  });
  const useWorktrees = trpc.settings.useWorktrees.useQuery();
  const setUseWorktrees = trpc.settings.setUseWorktrees.useMutation({
    onSuccess: () => utils.settings.useWorktrees.invalidate(),
  });
  const activeProvider = trpc.llm.activeProvider.useQuery();

  return (
    <PageShell
      path="settings"
      title="Settings"
      subtitle="Local configuration. All data stays on your machine."
    >
      <div className="grid grid-cols-[1fr_1fr] gap-8">
        <section>
          <SectionTitle index="01" title="LLM" />
          <ModelManager />

          <div className="mt-8">
            <SectionTitle index="02" title="Appearance" />
            <div className="flex items-center gap-2">
              <button
                className={`rounded border px-3 py-1.5 font-mono text-ui-sm uppercase tracking-widest2 ${theme === 'dark' ? 'border-amber-700/60 bg-amber-950/30 text-amber-300' : 'border-ink-700 text-ink-300 hover:border-ink-600'}`}
                onClick={() => {
                  setThemeLocal('dark');
                  setTheme.mutate({ value: 'dark' });
                }}
                disabled={setTheme.isPending}
              >
                dark
              </button>
              <button
                className={`rounded border px-3 py-1.5 font-mono text-ui-sm uppercase tracking-widest2 ${theme === 'light' ? 'border-amber-700/60 bg-amber-950/30 text-amber-300' : 'border-ink-700 text-ink-300 hover:border-ink-600'}`}
                onClick={() => {
                  setThemeLocal('light');
                  setTheme.mutate({ value: 'light' });
                }}
                disabled={setTheme.isPending}
              >
                light
              </button>
            </div>
            <div className="mt-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
              quick toggle: cmd/ctrl + shift + l
            </div>

            <div className="mt-5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
              text size
            </div>
            <div className="mt-2 flex items-center gap-2">
              {(['compact', 'default', 'comfortable'] as TextSize[]).map((size) => (
                <button
                  key={size}
                  className={`rounded border px-3 py-1.5 font-mono text-ui-sm uppercase tracking-widest2 ${textSize === size ? 'border-amber-700/60 bg-amber-950/30 text-amber-300' : 'border-ink-700 text-ink-300 hover:border-ink-600'}`}
                  onClick={() => {
                    setTextSizeLocal(size);
                    setTextSize.mutate({ value: size });
                  }}
                  disabled={setTextSize.isPending}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <SectionTitle index="03" title="Safety" />
            <ToggleCard
              checked={!!autoApprove.data}
              disabled={setAuto.isPending}
              onChange={(v) => setAuto.mutate({ value: v })}
              title="auto-approve sensitive tools"
              description="When off, write_file / apply_patch / run_shell / run_tests will prompt for approval before executing. Recommended for unfamiliar workspaces."
            />
          </div>

          <div className="mt-8">
            <SectionTitle index="04" title="Git" />
            <ToggleCard
              checked={!!autoBranch.data}
              disabled={setAutoBranch.isPending}
              onChange={(v) => setAutoBranch.mutate({ value: v })}
              title="auto-branch per task"
              description="Each task checks out a fresh branch ase/<taskId> before code is written, and commits all changes on success. The repo is initialised on first use."
            />
            <div className="mt-2">
              <ToggleCard
                checked={!!useWorktrees.data}
                disabled={setUseWorktrees.isPending}
                onChange={(v) => setUseWorktrees.mutate({ value: v })}
                title="use worktrees for session isolation"
                description="Creates a separate git worktree for each session, keeping your workspace clean. Each session gets its own branch ase/session/<id>. Requires a git repo."
              />
            </div>
          </div>
        </section>

        <section>
          <SectionTitle index="05" title="Debug Chat" />
          <DebugChat />

          <div className="mt-8">
            <SectionTitle index="06" title="System" />
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => openLogs.mutate()}
                disabled={openLogs.isPending}
                className="rounded border border-ink-700 px-3 py-1.5 font-mono text-ui-sm uppercase tracking-widest2 text-ink-200 hover:border-ink-600 disabled:opacity-40"
              >
                {openLogs.isPending ? 'opening…' : 'open logs folder'}
              </button>
            </div>
            <Rows
              rows={[
                ['app.version', health.data?.app.version ?? '...'],
                ['provider', activeProvider.data ?? '...'],
                ['db.path', health.data?.db.path ?? '...'],
                ['logs.path', openLogs.data?.path ?? '...'],
                ['ollama.url', health.data?.ollama.url ?? '...'],
                [
                  'ollama.status',
                  health.data ? (health.data.ollama.ok ? 'online' : 'offline') : '...',
                ],
              ]}
            />
            <div className="mt-3 rounded border border-ink-800 bg-ink-900/40 px-4 py-3 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
              shortcuts: cmd/ctrl+1..7 navigate pages, cmd/ctrl+, opens settings
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function ToggleCard({
  checked,
  disabled,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded border border-ink-800 bg-ink-900/40 p-4 hover:border-ink-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-amber-500"
      />
      <div>
        <div className="font-serif text-sm text-ink-50">{title}</div>
        <div className="mt-1 font-mono text-ui-sm text-ink-400">{description}</div>
      </div>
    </label>
  );
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="font-mono text-ui-xs uppercase tracking-widest2 text-amber">{index}</span>
      <h2 className="font-serif text-2xl text-ink-50">{title}</h2>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded border border-ink-800 bg-ink-900/40">
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className={`grid grid-cols-[140px_1fr] gap-4 px-4 py-2.5 ${i ? 'border-t border-ink-800' : ''}`}
        >
          <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">{k}</div>
          <div className="truncate font-mono text-ui-sm text-ink-100">{v}</div>
        </div>
      ))}
    </div>
  );
}
