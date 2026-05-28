export function Pill({ ok, label }: { ok?: boolean; label: string }) {
  const color =
    ok === undefined
      ? 'border-ink-700 text-ink-400'
      : ok
        ? 'border-signal-ok text-signal-ok'
        : 'border-signal-err text-signal-err';
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 ${color}`}
    >
      {label}
    </span>
  );
}
