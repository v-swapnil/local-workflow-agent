import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../trpc';
import { SkillSidebar } from '../components/skills/SkillSidebar';
import { SkillDetail } from '../components/skills/SkillDetail';

export function Skills() {
  const utils = trpc.useUtils();
  const skills = trpc.skill.list.useQuery();
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = trpc.skill.refresh.useMutation({
    onSuccess: () => utils.skill.list.invalidate(),
  });

  // Auto refresh skills when the app starts, so that any new skills added on disk are picked up.
  useEffect(() => {
    refresh.mutate();
  }, []);

  const toggle = trpc.skill.toggle.useMutation({
    onSuccess: () => utils.skill.list.invalidate(),
  });

  const focused = useMemo(
    () => skills.data?.find((skill) => skill.name === selected) ?? skills.data?.[0] ?? null,
    [skills.data, selected],
  );

  return (
    <div className="grid h-full grid-cols-[280px_1fr] gap-6 p-4">
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
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
            select a skill
          </div>
        )}
      </main>
    </div>
  );
}
