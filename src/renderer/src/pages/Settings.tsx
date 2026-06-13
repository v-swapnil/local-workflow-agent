import { useEffect, useState, type ReactNode } from 'react';
import { PageShell } from '../components/PageShell';
import { ModelManager } from '../components/ModelManager';
import { trpc } from '../trpc';
import { useUI, type TextSize } from '../store/ui';
import { Switch } from '../components/ui/switch';
import { Button } from '../components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Slider } from '../components/ui/slider';

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
  const shellPath = trpc.settings.shellPath.useQuery();
  const resolvedShell = trpc.settings.resolvedShell.useQuery();
  const setShellPath = trpc.settings.setShellPath.useMutation({
    onSuccess: () => {
      utils.settings.shellPath.invalidate();
      utils.settings.resolvedShell.invalidate();
    },
  });
  const resetShellPath = trpc.settings.resetShellPath.useMutation({
    onSuccess: () => {
      utils.settings.shellPath.invalidate();
      utils.settings.resolvedShell.invalidate();
    },
  });
  const queueConcurrency = trpc.settings.queueConcurrency.useQuery();
  const setQueueConcurrency = trpc.settings.setQueueConcurrency.useMutation({
    onSuccess: () => utils.settings.queueConcurrency.invalidate(),
  });
  const kanbanAutoClear = trpc.settings.kanbanAutoClear.useQuery();
  const setKanbanAutoClear = trpc.settings.setKanbanAutoClear.useMutation({
    onSuccess: () => utils.settings.kanbanAutoClear.invalidate(),
  });
  const kanbanDefaultView = trpc.settings.kanbanDefaultView.useQuery();
  const setKanbanDefaultView = trpc.settings.setKanbanDefaultView.useMutation({
    onSuccess: () => utils.settings.kanbanDefaultView.invalidate(),
  });

  const linearApiKey = trpc.settings.linearApiKey.useQuery();
  const setLinearApiKey = trpc.settings.setLinearApiKey.useMutation();

  const [shellDraft, setShellDraft] = useState('');
  const [linearApiKeyDraft, setLinearApiKeyDraft] = useState('');

  useEffect(() => {
    setShellDraft(shellPath.data ?? '');
  }, [shellPath.data]);

  useEffect(() => {
    setLinearApiKeyDraft(linearApiKey.data ?? '');
  }, [linearApiKey.data]);

  const shellConfigured = shellPath.data ?? '';
  const shellChanged = shellDraft.trim() !== shellConfigured;
  const shellInvalid =
    !!resolvedShell.data?.configuredPath && !resolvedShell.data.configuredPathExists;
  const concurrency = queueConcurrency.data ?? 1;

  return (
    <PageShell
      path="settings"
      title="Settings"
      subtitle="Local configuration. All data stays on your machine."
    >
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_1fr]">
        <section>
          <SectionTitle index="01" title="LLM" />
          <ModelManager />

          <div className="mt-8">
            <SectionTitle index="02" title="Appearance" />

            <div className="mt-5 group flex flex-col items-start gap-3.5 rounded-lg border border-ink-800/40 bg-ink-900/15 p-4 transition-all">
              <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
                Theme
              </div>
              <div className="flex items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={theme}
                  onValueChange={(v) => {
                    if (!v) return;
                    setThemeLocal(v as 'dark' | 'light');
                    setTheme.mutate({ value: v as 'dark' | 'light' });
                  }}
                  disabled={setTheme.isPending}
                  className="gap-1"
                >
                  <ToggleGroupItem
                    value="dark"
                    size="sm"
                    variant="outline"
                    className="font-mono uppercase tracking-widest2 data-[state=on]:border-amber/30 data-[state=on]:bg-amber/8 data-[state=on]:text-amber"
                  >
                    dark
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="light"
                    size="sm"
                    variant="outline"
                    className="font-mono uppercase tracking-widest2 data-[state=on]:border-amber/30 data-[state=on]:bg-amber/8 data-[state=on]:text-amber"
                  >
                    light
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="mt-5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
                text size
              </div>
              <div className="flex items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={textSize}
                  onValueChange={(v) => {
                    if (!v) return;
                    setTextSizeLocal(v as TextSize);
                    setTextSize.mutate({ value: v as TextSize });
                  }}
                  disabled={setTextSize.isPending}
                  className="gap-1"
                >
                  {(['compact', 'default', 'comfortable'] as TextSize[]).map((size) => (
                    <ToggleGroupItem
                      key={size}
                      value={size}
                      size="sm"
                      variant="outline"
                      className="font-mono uppercase tracking-widest2 data-[state=on]:border-amber/30 data-[state=on]:bg-amber/8 data-[state=on]:text-amber"
                    >
                      {size}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <SectionTitle index="03" title="Safety" />
            <ToggleCard
              checked={!!autoApprove.data}
              disabled={setAuto.isPending}
              onChange={(v) => setAuto.mutate({ value: v })}
              title="auto-approve sensitive tools"
              description="When off, write_file / apply_patch / run_shell will prompt for approval before executing. Recommended for unfamiliar workspaces."
            />
          </div>
        </section>

        <section>
          <SectionTitle index="04" title="Execution" />
          <SettingCard
            title="shell path"
            description="Used by run_shell and task execution. Leave empty to auto-detect from your environment."
          >
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const next = shellDraft.trim();
                if (next) setShellPath.mutate({ value: next });
              }}
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={shellDraft}
                  onChange={(e) => setShellDraft(e.target.value)}
                  className="font-mono text-ui-sm"
                  placeholder="/bin/zsh"
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!shellDraft.trim() || !shellChanged || setShellPath.isPending}
                  >
                    save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!shellConfigured || resetShellPath.isPending}
                    onClick={() => resetShellPath.mutate()}
                  >
                    reset
                  </Button>
                </div>
              </div>
              <div className="font-mono text-ui-xs leading-relaxed text-ink-500">
                effective: {resolvedShell.data?.shellPath ?? '...'}
                {resolvedShell.data?.shellName ? ` (${resolvedShell.data.shellName})` : ''}
              </div>
              {shellInvalid && (
                <div className="font-mono text-ui-xs leading-relaxed text-signal-warn">
                  configured path was not found, so ASE is using the fallback shell above.
                </div>
              )}
            </form>
          </SettingCard>
          <div className="mt-2">
            <SettingCard
              title="queue concurrency"
              description="Maximum tasks ASE can run from the queue at the same time."
            >
              <div className="grid grid-cols-[1fr_42px] items-center gap-4">
                <Slider
                  value={[concurrency]}
                  min={1}
                  max={8}
                  step={1}
                  disabled={setQueueConcurrency.isPending}
                  onValueCommit={([value]) => {
                    if (value && value !== concurrency) {
                      setQueueConcurrency.mutate({ value });
                    }
                  }}
                />
                <div className="rounded border border-ink-800/50 bg-ink-950/50 px-2 py-1 text-center font-mono text-ui-xs text-ink-200">
                  {concurrency}
                </div>
              </div>
            </SettingCard>
          </div>

          <div className="mt-8">
            <SectionTitle index="05" title="Git" />
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

          <div className="mt-8">
            <SectionTitle index="06" title="Kanban" />
            <ToggleCard
              checked={kanbanAutoClear.data ?? true}
              disabled={setKanbanAutoClear.isPending}
              onChange={(v) => setKanbanAutoClear.mutate({ value: v })}
              title="auto-clear manual lanes"
              description="When a task finishes, sessions return to their automatic lane unless this is turned off."
            />
            <div className="mt-2">
              <SettingCard
                title="default board view"
                description="Choose whether the Kanban page opens as draggable lanes or a compact table."
              >
                <ToggleGroup
                  type="single"
                  value={kanbanDefaultView.data ?? 'board'}
                  onValueChange={(value) => {
                    if (value === 'board' || value === 'list') {
                      setKanbanDefaultView.mutate({ value });
                    }
                  }}
                  disabled={setKanbanDefaultView.isPending}
                  className="justify-start gap-1"
                >
                  {(['board', 'list'] as const).map((view) => (
                    <ToggleGroupItem
                      key={view}
                      value={view}
                      size="sm"
                      variant="outline"
                      className="font-mono uppercase tracking-widest2 data-[state=on]:border-amber/30 data-[state=on]:bg-amber/8 data-[state=on]:text-amber"
                    >
                      {view}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </SettingCard>
            </div>
            <div className="mt-2">
              <SettingCard
                title="linear integration"
                description="Set your Linear API key to import issues into the Kanban board."
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={linearApiKeyDraft}
                    onChange={(e) => setLinearApiKeyDraft(e.target.value)}
                    className="font-mono text-ui-sm"
                    placeholder="lin_api_..."
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!linearApiKeyDraft.trim() || setLinearApiKey.isPending}
                      onClick={() => setLinearApiKey.mutate({ value: linearApiKeyDraft.trim() })}
                    >
                      save
                    </Button>
                  </div>
                </div>
              </SettingCard>
            </div>
          </div>

          <div className="mt-8">
            <SectionTitle index="07" title="System" />
            <Rows
              rows={[
                ['app.version', health.data?.app.version ?? '...'],
                ['provider', activeProvider.data ?? '...'],
                ['db.path', health.data?.db.path ?? '...'],
                ['logs.path', openLogs.data?.path ?? '...'],
              ]}
            />
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-4">
      <div className="font-mono text-ui-sm font-medium text-ink-50">{title}</div>
      <div className="mt-1 font-mono text-ui-xs leading-relaxed text-ink-400">{description}</div>
      <div className="mt-4">{children}</div>
    </div>
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
    <Label className="group flex cursor-pointer items-start gap-3.5 rounded-lg border border-ink-800/40 bg-ink-900/15 p-4 font-normal transition-all hover:border-ink-700/50 hover:bg-ink-900/25">
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5 shrink-0"
      />
      <div>
        <div className="font-mono text-ui-sm font-medium text-ink-50">{title}</div>
        <div className="mt-1 font-mono text-ui-xs leading-relaxed text-ink-400">{description}</div>
      </div>
    </Label>
  );
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber/10 font-mono text-ui-2xs text-amber">
        {index}
      </span>
      <h2 className="font-mono text-ui-base font-medium uppercase tracking-widest2 text-ink-100">
        {title}
      </h2>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-800/40 bg-ink-900/15">
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className={`grid grid-cols-[140px_1fr] gap-4 px-4 py-2.5 ${i ? 'border-t border-ink-800/30' : ''}`}
        >
          <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">{k}</div>
          <div className="truncate font-mono text-ui-xs text-ink-200">{v}</div>
        </div>
      ))}
    </div>
  );
}
