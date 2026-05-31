import { trpc } from '../trpc';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { useUI } from '../store/ui';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Separator } from './ui/separator';
import { Sun, Moon, Bot } from 'lucide-react';

export function TitleBar() {
  const utils = trpc.useUtils();
  const health = trpc.health.useQuery(undefined, { refetchInterval: 8000 });
  const setTheme = trpc.settings.setTheme.useMutation({
    onSuccess: () => utils.settings.theme.invalidate(),
  });
  const theme = useUI((s) => s.theme);
  const setThemeLocal = useUI((s) => s.setTheme);
  const providerHealth = trpc.llm.health.useQuery(undefined, { refetchInterval: 8000 });
  const version = health.data?.app.version ?? '';

  return (
    <div className="app-drag relative z-30 flex h-11 items-center justify-between border-b border-ink-800/60 bg-ink-950/90 pl-4 pr-4 backdrop-blur-md">
      <div className="flex items-center gap-2.5 font-mono text-ui-xs tracking-widest2 text-ink-500">
        <span className="uppercase">autonomous software engineer</span>
        {version && (
          <Badge variant="outline" className="border-ink-700/60 bg-ink-800/60 font-mono text-ui-2xs text-ink-500">{version}</Badge>
        )}
      </div>
      <div className="app-no-drag flex items-center gap-2">
        <ModelBadge />
        <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
          <Button
            variant="ghost"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              setThemeLocal(next);
              setTheme.mutate({ value: next });
            }}
            className="group h-7 w-7 rounded-md border border-ink-800/60 bg-ink-900/40 text-ink-400 hover:border-ink-700 hover:bg-ink-800/60 hover:text-ink-200"
          >
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5 transition-transform group-hover:rotate-45" strokeWidth={1.3} />
          ) : (
            <Moon className="h-3.5 w-3.5" strokeWidth={1.3} />
          )}
        </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="font-mono text-ui-2xs">Toggle theme (⌘⇧L)</TooltipContent>
        </Tooltip>
        </TooltipProvider>
        <WorkspaceSwitcher />
        <Separator orientation="vertical" className="mx-1 h-4 bg-ink-800/60" />
        <StatusDot
          label={providerHealth.data?.provider ?? 'llm'}
          ok={providerHealth.data?.ok}
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
      <Bot className="h-3 w-3 text-ink-500" strokeWidth={1.3} />
      <span className="normal-case text-ink-200">{active.data ?? '…'}</span>
    </div>
  );
}
