import { SidebarListItem } from '../ui/sidebar-list-item';

type Skill = {
  name: string;
  description: string;
  enabled: boolean;
  builtin: boolean;
};

type SkillSidebarProps = {
  skills: Skill[];
  focusedName: string | null;
  onSelect: (name: string) => void;
};

export function SkillSidebar({ skills, focusedName, onSelect }: SkillSidebarProps) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
        registry · {skills.length}
      </div>
      <div className="flex-1 space-y-px overflow-y-auto pr-1">
        {skills.map((skill) => (
          <SidebarListItem
            key={skill.name}
            title={skill.name}
            isActive={focusedName === skill.name}
            onSelect={() => onSelect(skill.name)}
            status={{ active: skill.enabled }}
            subtitle={skill.description?.trim() || undefined}
            tags={skill.builtin ? [{ label: 'builtin' }] : undefined}
          />
        ))}
        {skills.length === 0 && (
          <div className="font-mono text-ui-sm text-ink-500">
            no skills found — create one or add a folder under userData/skills
          </div>
        )}
      </div>
    </aside>
  );
}
