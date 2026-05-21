import { useMemo, useState } from 'react';
import { PageShell } from '../components/PageShell';
import { trpc } from '../trpc';
import { cn } from '../lib/utils';

export function Skills() {
  const utils = trpc.useUtils();
  const skills = trpc.skill.list.useQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const refresh = trpc.skill.refresh.useMutation({
    onSuccess: () => utils.skill.list.invalidate(),
  });
  const toggle = trpc.skill.toggle.useMutation({
    onSuccess: () => utils.skill.list.invalidate(),
  });
  const reveal = trpc.skill.reveal.useMutation();
  const remove = trpc.skill.delete.useMutation({
    onSuccess: () => {
      setSelected(null);
      utils.skill.list.invalidate();
    },
  });

  const focused = useMemo(
    () => skills.data?.find((s) => s.name === selected) ?? skills.data?.[0] ?? null,
    [skills.data, selected],
  );

  return (
    <PageShell
      path="skills"
      title="Skills"
      subtitle="Markdown-defined capabilities the planner can attach to a task. Edit on disk; ASE re-reads on refresh."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="rounded-md border border-ink-700/60 px-3 py-1.5 font-mono text-ui-xs uppercase tracking-widest2 text-ink-300 transition-all hover:border-ink-600 hover:text-ink-200 disabled:opacity-40"
          >
            {refresh.isPending ? 'syncing…' : 'refresh'}
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="rounded-md bg-amber/90 px-3 py-1.5 font-mono text-ui-xs font-medium uppercase tracking-widest2 text-ink-950 shadow-glow-sm transition-all hover:bg-amber hover:shadow-glow"
          >
            + new skill
          </button>
        </div>
      }
    >
      <div className="grid h-[calc(100vh-220px)] grid-cols-[280px_1fr] gap-6">
        <aside className="flex min-h-0 flex-col">
          <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
            registry · {skills.data?.length ?? 0}
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto">
            {skills.data?.map((s) => (
              <button
                key={s.name}
                onClick={() => setSelected(s.name)}
                className={cn(
                  'flex w-full flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-all',
                  focused?.name === s.name
                    ? 'border-amber/20 bg-amber/5 shadow-sm shadow-amber/5'
                    : 'border-ink-800/40 bg-ink-900/20 hover:border-ink-700/60 hover:bg-ink-900/30',
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-mono text-ui-sm font-medium text-ink-50">{s.name}</span>
                  <span
                    className={cn(
                      'font-mono text-ui-2xs uppercase tracking-widest2',
                      s.enabled ? 'text-emerald-400' : 'text-ink-500',
                    )}
                  >
                    {s.enabled ? 'on' : 'off'}
                  </span>
                </div>
                <div className="mt-0.5 line-clamp-2 font-mono text-ui-xs text-ink-400">
                  {s.description}
                </div>
                {s.builtin && (
                  <span className="mt-1 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
                    builtin
                  </span>
                )}
              </button>
            ))}
            {skills.data?.length === 0 && (
              <div className="font-mono text-ui-sm text-ink-500">
                no skills found — create one or add a folder under userData/skills
              </div>
            )}
          </div>
        </aside>

        <main className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
          {focused ? (
            <div>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-ui-xs uppercase tracking-widest2 text-amber">
                    skill
                  </div>
                  <div className="mt-1 text-ui-lg font-medium tracking-tight text-ink-50">{focused.name}</div>
                  <div className="mt-1 font-mono text-ui-sm text-ink-300">
                    {focused.description}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-700/50 px-3 py-1.5 transition-colors hover:border-ink-600">
                    <input
                      type="checkbox"
                      checked={focused.enabled}
                      onChange={(e) =>
                        toggle.mutate({ name: focused.name, enabled: e.target.checked })
                      }
                      className="h-3.5 w-3.5 accent-amber"
                    />
                    <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-200">
                      enabled
                    </span>
                  </label>
                  <button
                    onClick={() => reveal.mutate({ name: focused.name })}
                    className="btn-secondary !py-1.5"
                  >
                    open folder
                  </button>
                  {!focused.builtin && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete skill "${focused.name}"? This removes the folder.`)) {
                          remove.mutate({ name: focused.name });
                        }
                      }}
                      className="btn-danger !py-1.5"
                    >
                      delete
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-4">
                <Field label="when_to_use" value={focused.whenToUse || '—'} />
                <Field label="tags" value={focused.tags.join(', ') || '—'} />
                <Field label="path" value={focused.path} mono />
                <Field label="updated" value={new Date(focused.updatedAt).toLocaleString()} />
              </div>

              <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
                body
              </div>
              <pre className="max-h-[60vh] overflow-y-auto rounded-lg border border-ink-800/40 bg-ink-950/80 p-4 font-mono text-ui-xs leading-relaxed text-ink-100">
                {focused.body}
              </pre>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
              select a skill
            </div>
          )}
        </main>
      </div>

      {showNew && <NewSkillModal onClose={() => setShowNew(false)} />}
    </PageShell>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-3">
      <div className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">{label}</div>
      <div
        className={cn(
          'mt-1 break-all',
          mono ? 'font-mono text-ui-sm' : 'font-mono text-ui-sm',
          'text-ink-100',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function NewSkillModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [whenToUse, setWhenToUse] = useState('');
  const [tags, setTags] = useState('');

  const create = trpc.skill.create.useMutation({
    onSuccess: () => {
      utils.skill.list.invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[520px] max-w-[90vw] rounded-xl border border-amber/20 bg-ink-900 shadow-2xl animate-scale-in">
        <div className="border-b border-ink-800/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber/10 px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-amber">
              new skill
            </span>
          </div>
        </div>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!id || !name || !description) return;
            create.mutate({
              id: id.trim(),
              name: name.trim(),
              description: description.trim(),
              whenToUse: whenToUse.trim() || undefined,
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            });
          }}
        >
          <Input label="id (folder name)" value={id} onChange={setId} placeholder="my-skill" mono />
          <Input label="name" value={name} onChange={setName} placeholder="My Skill" />
          <Input
            label="description"
            value={description}
            onChange={setDescription}
            placeholder="What this skill does."
          />
          <Input
            label="when_to_use"
            value={whenToUse}
            onChange={setWhenToUse}
            placeholder="When the user asks to…"
          />
          <Input
            label="tags (comma-separated)"
            value={tags}
            onChange={setTags}
            placeholder="testing, refactor"
            mono
          />
          {create.error && (
            <div className="font-mono text-ui-xs text-signal-err">{create.error.message}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={!id || !name || !description || create.isPending}
              className="btn-primary"
            >
              {create.isPending ? 'creating…' : 'create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
      'w-full rounded-md border border-ink-700/50 bg-ink-950/80 px-3 py-1.5 font-mono text-ui-xs text-ink-100 placeholder:text-ink-600 transition-colors focus:border-amber/30 focus:outline-none',
        )}
      />
    </label>
  );
}
