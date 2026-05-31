import { useMemo, useRef, useState } from 'react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import type { ToolName } from '@shared/agent';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

const STREAMING: ToolName[] = ['run_shell'];

/** Build a default JSON args string from a JSON Schema `properties` object. */
function defaultArgsFromSchema(schema: Record<string, unknown>): string {
  const props = (schema as { properties?: Record<string, { type?: string }> }).properties;
  if (!props) return '{}';
  const obj: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    if (val.type === 'string') obj[key] = '';
    else if (val.type === 'number' || val.type === 'integer') obj[key] = 0;
    else if (val.type === 'boolean') obj[key] = false;
    else if (val.type === 'array') obj[key] = [];
    else obj[key] = null;
  }
  return JSON.stringify(obj, null, 2);
}

interface LogLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

export function ToolPlayground() {
  const { workspaceId } = useActiveWorkspace();
  const { data: tools } = trpc.tool.list.useQuery();

  const { readTools, writeTools } = useMemo(() => {
    const read: ToolName[] = [];
    const write: ToolName[] = [];
    for (const t of tools ?? []) {
      (t.readOnly ? read : write).push(t.name);
    }
    return { readTools: read, writeTools: write };
  }, [tools]);

  const presets = useMemo(() => {
    const map: Partial<Record<ToolName, string>> = {};
    for (const t of tools ?? []) {
      map[t.name] = defaultArgsFromSchema(t.argsSchema);
    }
    return map;
  }, [tools]);

  const [tool, setTool] = useState<ToolName>('list_dir');
  const [args, setArgs] = useState('{}');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [duration, setDuration] = useState<number | null>(null);

  const [streamKey, setStreamKey] = useState<number | null>(null);
  const subPayload = useRef<{ workspaceId: string; name: ToolName; args: unknown } | null>(null);

  const invoke = trpc.tool.invoke.useMutation();

  const isStreaming = STREAMING.includes(tool);

  trpc.tool.invokeStream.useSubscription(
    subPayload.current ?? { workspaceId: '', name: 'list_dir', args: {} },
    {
      enabled: streamKey !== null,
      onData: (msg) => {
        if (msg.type === 'log') {
          setLogs((prev) => [...prev, { stream: msg.stream, text: msg.text }]);
        } else {
          setRunning(false);
          setStreamKey(null);
          setDuration(msg.durationMs);
          if (msg.ok) {
            setResult(msg.output ?? null);
            setError(null);
          } else {
            setError(msg.error ?? 'unknown error');
            setResult(null);
          }
        }
      },
      onError: (err) => {
        setRunning(false);
        setStreamKey(null);
        setError(err.message);
      },
    },
  );

  const selectTool = (tool: ToolName) => {
    setTool(tool);
    setArgs(presets[tool] ?? '{}');
    setResult(null);
    setLogs([]);
    setError(null);
    setDuration(null);
  };

  const execToolCall = async () => {
    if (!workspaceId) {
      setError('no active workspace');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch (e) {
      setError(`invalid JSON: ${(e as Error).message}`);
      return;
    }
    setError(null);
    setResult(null);
    setLogs([]);
    setDuration(null);
    setRunning(true);

    if (isStreaming) {
      subPayload.current = { workspaceId, name: tool, args: parsed };
      setStreamKey(Date.now());
      return;
    }

    const t0 = Date.now();
    const res = await invoke.mutateAsync({ workspaceId, name: tool, args: parsed });
    setRunning(false);
    setDuration(Date.now() - t0);
    if (res.ok) {
      setResult(res.output ?? null);
    } else {
      setError(res.error ?? 'failed');
    }
  };

  const resultPretty = useMemo(() => {
    if (result === null || result === undefined) return '';
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }, [result]);

  return (
    <Tabs value={tool} onValueChange={(v) => selectTool(v as ToolName)} orientation="vertical" className="grid grid-cols-[200px_1fr] gap-6">
      <TabsList className="flex h-auto flex-col items-stretch rounded-lg border border-ink-800/40 bg-ink-900/15 p-0">
        <div className="px-3 py-1.5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500 border-b border-ink-800/30">
          read
        </div>
        {readTools.map((t) => (
          <TabsTrigger
            key={t}
            value={t}
            className="h-auto w-full justify-start rounded-none border-b border-ink-800/30 px-3 py-2 text-left font-mono text-ui-xs last:border-b-0 text-ink-300 data-[state=active]:bg-ink-800/50 data-[state=active]:text-amber data-[state=active]:shadow-none"
          >
            {t}
          </TabsTrigger>
        ))}
        <div className="px-3 py-1.5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500 border-b border-ink-800/30">
          write
        </div>
        {writeTools.map((t) => (
          <TabsTrigger
            key={t}
            value={t}
            className="h-auto w-full justify-start rounded-none border-b border-ink-800/30 px-3 py-2 text-left font-mono text-ui-xs last:border-b-0 text-ink-300 data-[state=active]:bg-ink-800/50 data-[state=active]:text-amber data-[state=active]:shadow-none"
          >
            {t}
          </TabsTrigger>
        ))}
      </TabsList>

      <section className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
              args (json)
            </div>
            <div className="font-mono text-ui-xs text-ink-500">
              workspace · <span className="text-amber">{workspaceId ?? 'none'}</span>
            </div>
          </div>
          <Textarea
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            spellCheck={false}
            rows={8}
            className="resize-y font-mono text-ui-xs"
          />
          <div className="mt-3 flex items-center gap-3">
            <Button
              variant="default"
              size="sm"
              onClick={execToolCall}
              disabled={running || !workspaceId}
            >
              {running ? 'running…' : 'invoke →'}
            </Button>
            {duration !== null && (
              <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
                {duration}ms
              </span>
            )}
            {error && <span className="font-mono text-ui-xs text-signal-err">{error}</span>}
          </div>
        </div>

        {isStreaming && (
          <div>
            <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
              live log
            </div>
            <div className="h-48 overflow-auto rounded-lg border border-ink-800/40 bg-ink-950/80 p-3 font-mono text-ui-xs leading-relaxed">
              {logs.length === 0 && <div className="text-ink-500">// no output yet</div>}
              {logs.map((l, i) => (
                <span
                  key={i}
                  className={l.stream === 'stderr' ? 'text-signal-err' : 'text-ink-200'}
                >
                  {l.text}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
            result
          </div>
          <pre className="h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-ink-800/40 bg-ink-950/80 p-3 font-mono text-ui-xs leading-relaxed text-ink-100">
            {resultPretty || (running ? '…' : '// no result yet')}
          </pre>
        </div>
      </section>
    </Tabs>
  );
}
