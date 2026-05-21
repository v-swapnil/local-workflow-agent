import { useMemo, useRef, useState } from 'react';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { cn } from '../lib/utils';

type ToolName =
  | 'read_file'
  | 'write_file'
  | 'apply_patch'
  | 'list_dir'
  | 'grep'
  | 'run_shell'
  | 'run_tests';

const PRESETS: Record<ToolName, string> = {
  read_file: `{\n  "path": "README.md"\n}`,
  write_file: `{\n  "path": "hello.txt",\n  "content": "hello from ase\\n"\n}`,
  apply_patch: `{\n  "patch": "--- a/hello.txt\\n+++ b/hello.txt\\n@@ -1 +1,2 @@\\n hello from ase\\n+second line\\n"\n}`,
  list_dir: `{\n  "path": "",\n  "depth": 2\n}`,
  grep: `{\n  "pattern": "TODO",\n  "isRegex": false\n}`,
  run_shell: `{\n  "cmd": "node",\n  "args": ["-e", "console.log('hi from sandbox', process.cwd())"],\n  "timeoutMs": 5000\n}`,
  run_tests: `{\n  "timeoutMs": 60000\n}`,
};

const STREAMING: ToolName[] = ['run_shell', 'run_tests'];

interface LogLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

export function ToolPlayground() {
  const { workspaceId } = useActiveWorkspace();
  const [tool, setTool] = useState<ToolName>('list_dir');
  const [args, setArgs] = useState(PRESETS.list_dir);
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

  async function run() {
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
  }

  const resultPretty = useMemo(() => {
    if (result === null || result === undefined) return '';
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }, [result]);

  return (
    <div className="grid grid-cols-[200px_1fr] gap-6">
      <aside>
        <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
          tool
        </div>
        <div className="flex flex-col rounded-lg border border-ink-800/40 bg-ink-900/15">
          {(Object.keys(PRESETS) as ToolName[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTool(t);
                setArgs(PRESETS[t]);
                setResult(null);
                setLogs([]);
                setError(null);
                setDuration(null);
              }}
              className={cn(
                'border-b border-ink-800/30 px-3 py-2 text-left font-mono text-ui-xs last:border-b-0',
                tool === t ? 'bg-ink-800/50 text-amber' : 'text-ink-300 hover:bg-ink-800/30',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </aside>

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
          <textarea
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            spellCheck={false}
            rows={8}
            className="w-full resize-y rounded-md border border-ink-700/50 bg-ink-950/80 p-3 font-mono text-ui-xs text-ink-100 transition-colors focus:border-amber/30 focus:outline-none"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={run}
              disabled={running || !workspaceId}
              className="btn-primary !py-1.5"
            >
              {running ? 'running…' : 'invoke →'}
            </button>
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
          <pre className="h-64 overflow-auto rounded-lg border border-ink-800/40 bg-ink-950/80 p-3 font-mono text-ui-xs leading-relaxed text-ink-100">
            {resultPretty || (running ? '…' : '// no result yet')}
          </pre>
        </div>
      </section>
    </div>
  );
}
