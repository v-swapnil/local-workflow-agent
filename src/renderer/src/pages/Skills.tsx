import { useMemo, useState } from 'react';
import { PageShell } from '../components/PageShell';
import { trpc } from '../trpc';
import { SkillSidebar } from '../components/skills/SkillSidebar';
import { SkillDetail } from '../components/skills/SkillDetail';
import { NewSkillModal } from '../components/skills/NewSkillModal';
import { Button } from '../components/ui/button';

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
    () => skills.data?.find((skill) => skill.name === selected) ?? skills.data?.[0] ?? null,
    [skills.data, selected],
  );

  return (
    <PageShell
      path="skills"
      title="Skills"
      subtitle="Markdown-defined capabilities the planner can attach to a task. Edit on disk; ASE re-reads on refresh."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="font-mono uppercase tracking-widest2"
          >
            {refresh.isPending ? 'syncing…' : 'refresh'}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowNew(true)}
          >
            + new skill
          </Button>
        </div>
      }
    >
      <div className="grid h-[calc(100vh-220px)] grid-cols-[280px_1fr] gap-6">
        <SkillSidebar
          skills={skills.data ?? []}
          focusedName={focused?.name ?? null}
          onSelect={setSelected}
        />

        <main className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
          {focused ? (
            <SkillDetail
              skill={focused}
              onToggle={(enabled) => toggle.mutate({ name: focused.name, enabled })}
              onReveal={() => reveal.mutate({ name: focused.name })}
              onDelete={() => {
                if (confirm(`Delete skill "${focused.name}"? This removes the folder.`)) {
                  remove.mutate({ name: focused.name });
                }
              }}
            />
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
