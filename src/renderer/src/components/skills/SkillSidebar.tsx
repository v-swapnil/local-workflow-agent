import { SkillRecord } from '@shared/schema';
import { SidebarListItem } from '../ui/sidebar-list-item';

type SkillSidebarProps = {
  skills: SkillRecord[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function SkillSidebar({ skills, selectedId, onSelect }: SkillSidebarProps) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex-1 space-y-px overflow-y-auto pr-1">
        {skills.map((skill) => (
          <SidebarListItem
            key={skill.id}
            title={skill.name}
            isActive={selectedId === skill.id}
            onSelect={() => onSelect(skill.id)}
            status={{ active: skill.enabled }}
            description={skill.description?.trim() || undefined}
          />
        ))}
        {skills.length === 0 && (
          <div className="font-mono text-ui-sm text-ink-500">
            no skills found — add a skill folder under skills/, .claude/skills, .github/skills, or
            userData/skills
          </div>
        )}
      </div>
    </aside>
  );
}
