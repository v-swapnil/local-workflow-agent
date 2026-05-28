import { cn } from '../../lib/utils';

type Skill = {
  name: string;
  description: string;
  enabled: boolean;
  builtin: boolean;
  whenToUse?: string | null;
  tags: string[];
  path: string;
  updatedAt: number;
  body: string;
};

type SkillDetailProps = {
  skill: Skill;
  onToggle: (enabled: boolean) => void;
  onReveal: () => void;
  onDelete: () => void;
};

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-3">
      <div className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">{label}</div>
      <div className={cn('mt-1 break-all font-mono text-ui-sm text-ink-100')}>{value}</div>
    </div>
  );
}

export function SkillDetail({ skill, onToggle, onReveal, onDelete }: SkillDetailProps) {
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-ui-xs uppercase tracking-widest2 text-amber">skill</div>
          <div className="mt-1 text-ui-lg font-medium tracking-tight text-ink-50">{skill.name}</div>
          <div className="mt-1 font-mono text-ui-sm text-ink-300">{skill.description}</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-700/50 px-3 py-1.5 transition-colors hover:border-ink-600">
            <input
              type="checkbox"
              checked={skill.enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="h-3.5 w-3.5 accent-amber"
            />
            <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-200">
              enabled
            </span>
          </label>
          <button onClick={onReveal} className="btn-secondary !py-1.5">
            open folder
          </button>
          {!skill.builtin && (
            <button onClick={onDelete} className="btn-danger !py-1.5">
              delete
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Field label="when_to_use" value={skill.whenToUse || '—'} />
        <Field label="tags" value={skill.tags.join(', ') || '—'} />
        <Field label="path" value={skill.path} mono />
        <Field label="updated" value={new Date(skill.updatedAt).toLocaleString()} />
      </div>

      <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">body</div>
      <pre className="max-h-[60vh] overflow-y-auto rounded-lg border border-ink-800/40 bg-ink-950/80 p-4 font-mono text-ui-xs leading-relaxed text-ink-100">
        {skill.body}
      </pre>
    </div>
  );
}
