import { useRef, useState } from 'react';
import { trpc } from '../trpc';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export function DebugChat() {
  const activeModel = trpc.llm.activeModel.useQuery();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<{ active: boolean; buf: string }>({
    active: false,
    buf: '',
  });
  const [subKey, setSubKey] = useState<number | null>(null);
  const subPayload = useRef<{
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  } | null>(null);

  trpc.llm.chatStream.useSubscription(
    {
      messages: subPayload.current?.messages ?? [{ role: 'user' as const, content: '' }],
    },
    {
      enabled: subKey !== null,
      onData: (chunk) => {
        if (chunk.type === 'delta') {
          setStreaming((s) => ({ active: true, buf: s.buf + chunk.content }));
        } else if (chunk.type === 'done') {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: chunk.content, ts: Date.now() },
          ]);
          setStreaming({ active: false, buf: '' });
          setSubKey(null);
        } else if (chunk.type === 'error') {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `[error] ${chunk.error}`, ts: Date.now() },
          ]);
          setStreaming({ active: false, buf: '' });
          setSubKey(null);
        }
      },
      onError: (err) => {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `[error] ${err.message}`, ts: Date.now() },
        ]);
        setStreaming({ active: false, buf: '' });
        setSubKey(null);
      },
    },
  );

  function send() {
    const text = draft.trim();
    if (!text || streaming.active) return;
    const nextUser: Msg = { role: 'user', content: text, ts: Date.now() };
    const next = [...messages, nextUser];
    setMessages(next);
    setDraft('');
    subPayload.current = {
      messages: next.map((m) => ({ role: m.role, content: m.content })),
    };
    setSubKey(Date.now());
    setStreaming({ active: true, buf: '' });
  }

  return (
    <div className="flex h-[460px] flex-col overflow-hidden rounded border border-ink-800 bg-ink-900/40">
      <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2 font-mono text-ui-xs uppercase tracking-widest2">
        <span className="text-ink-400">debug chat</span>
        <span className="text-ink-500">
          model: <span className="text-amber">{activeModel.data ?? '—'}</span>
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !streaming.active && (
          <div className="font-mono text-ui-sm text-ink-500">
            send a message to test the active model end-to-end.
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}
        {streaming.active && (
          <Bubble msg={{ role: 'assistant', content: streaming.buf, ts: Date.now() }} streaming />
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-ink-800 bg-ink-950 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="ask the model… (⌘+enter)"
          className="flex-1 resize-none rounded border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-ui-base text-ink-100 placeholder:text-ink-500 focus:border-amber focus:outline-none"
        />
        <button
          onClick={send}
          disabled={streaming.active || !draft.trim()}
          className="rounded border border-amber bg-amber/10 px-4 py-2 font-mono text-ui-sm uppercase tracking-widest2 text-amber hover:bg-amber/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          send
        </button>
      </div>
    </div>
  );
}

function Bubble({ msg, streaming }: { msg: Msg; streaming?: boolean }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded px-3 py-2 text-ui-lg leading-relaxed ${
          isUser
            ? 'border border-amber/30 bg-amber/5 text-ink-100'
            : 'border border-ink-800 bg-ink-900 text-ink-100'
        }`}
      >
        <div className="mb-1 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
          {isUser ? 'you' : 'assistant'}
          {streaming && <span className="ml-2 animate-pulse text-amber">streaming…</span>}
        </div>
        <div className="font-sans">
          {msg.content}
          {streaming && <span className="ml-0.5 text-amber">▍</span>}
        </div>
      </div>
    </div>
  );
}
