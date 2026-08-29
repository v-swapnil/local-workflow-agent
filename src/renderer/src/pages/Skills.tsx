import { useEffect, useState } from 'react';
import { trpc } from '../trpc';
import { SkillSidebar } from '../components/skills/SkillSidebar';
import { SkillDetail } from '../components/skills/SkillDetail';

export function Skills() {
  const utils = trpc.useUtils();
  const skills = trpc.skill.list.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refresh = trpc.skill.refresh.useMutation({
    onSuccess: () => utils.skill.list.invalidate(),
  });

  // Auto refresh skills when the Skills page opens, so that any new skills added on disk are picked up.
  useEffect(() => {
    refresh.mutate();
  }, []);

  const details = trpc.skill.get.useQuery(
    { id: selectedId || 0 },
    { enabled: selectedId !== null },
  );

  const toggle = trpc.skill.toggle.useMutation({
    onSuccess: () => {
      utils.skill.list.invalidate();
      utils.skill.get.invalidate();
    },
  });

  return (
    <div className="grid h-full grid-cols-[280px_1fr] gap-6 p-4">
      <SkillSidebar skills={skills.data ?? []} selectedId={selectedId} onSelect={setSelectedId} />

      <main className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
        {details.data ? (
          <SkillDetail
            skill={details.data}
            onToggle={(enabled) => toggle.mutate({ id: details.data?.id || 0, enabled })}
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
