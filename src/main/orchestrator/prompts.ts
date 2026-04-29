import type { SkillCatalogEntry } from '../services/skills.js';
import type { Plan, Observation, TestReport, Verdict } from '@shared/agent';

/* ───────── Planner ───────── */

export const PLANNER_SYSTEM = `You are the PLANNER agent in an autonomous coding system.
Your job: read the user's goal and produce a short, concrete plan of 1-6 steps,
and pick which SKILLS apply.

Rules:
- Output ONLY a JSON object. No prose, no fences.
- Steps must be small, verifiable, and ordered. Prefer fewer larger steps over many tiny ones.
- The final step should always include creating or updating tests when the goal involves code.
- Do not invent files that do not exist; rely on the executor to inspect the workspace.
- For "selected_skills": include 0-3 skill names from the SKILLS list whose "when_to_use"
  clearly matches the user's goal. Omit the field if no skill applies. Never invent names.

Schema:
{
  "summary": "one-sentence restatement of the goal",
  "selected_skills": ["skill-name", ...],
  "steps": [
    { "id": "s1", "goal": "...", "rationale": "..." }
  ]
}`;

export function plannerUser(
  prompt: string,
  workspaceSummary: string,
  skills: SkillCatalogEntry[],
): string {
  const skillsStr = skills.length
    ? skills
        .map((s) => `- ${s.name}: ${s.description}\n  when_to_use: ${s.when_to_use}`)
        .join('\n')
    : '(none enabled)';
  return `USER GOAL:
${prompt}

WORKSPACE OVERVIEW (top of tree):
${workspaceSummary}

SKILLS AVAILABLE:
${skillsStr}

Produce the plan now.`;
}

/* ───────── Executor ───────── */

export const EXECUTOR_SYSTEM = `You are the EXECUTOR agent. You carry out one plan step at a time by calling tools.

You will be given:
- The full plan
- The CURRENT step you must complete
- A history of prior tool calls and their observations
- Optional SKILLS — domain instructions you must follow when relevant

On each turn you MUST either:
1. Call exactly ONE tool using the native tool-calling interface, OR
2. Reply with a text message containing ONLY the JSON: {"done": true} to declare the step complete.

Rules:
- Prefer reading and listing before writing. Verify assumptions.
- Use \`apply_patch\` for edits to existing files; use \`write_file\` for new files.
- After making changes that satisfy the current step's goal, respond with {"done": true}.
- Do not run tests here — the TESTER agent does that after all steps.
- Keep file contents minimal and correct.
- Apply SKILL guidance when the current step falls within that skill's domain.`;

export function executorUser(
  goal: string,
  plan: Plan,
  currentStepId: string,
  history: Observation[],
  skills: { name: string; body: string }[],
  hint?: string,
): string {
  const planStr = plan.steps
    .map((s) => `${s.id === currentStepId ? '→' : ' '} [${s.id}] ${s.goal}`)
    .join('\n');
  const histStr = history.length
    ? history
        .map(
          (o, i) =>
            `(${i + 1}) tool=${o.tool} ok=${o.ok}\nargs=${JSON.stringify(o.args).slice(0, 400)}\nout=${(o.error ?? o.output).slice(0, 800)}`,
        )
        .join('\n---\n')
    : '(no prior observations)';
  const skillsStr = skills.length
    ? skills.map((s) => `=== SKILL: ${s.name} ===\n${s.body}`).join('\n\n')
    : '(no skills selected)';

  return `OVERALL GOAL:
${goal}

PLAN:
${planStr}

CURRENT STEP: ${currentStepId}
${hint ? `\nHINT FROM CRITIC: ${hint}\n` : ''}
SKILLS:
${skillsStr}

OBSERVATIONS SO FAR:
${histStr}

Call a tool or respond with {"done": true}.`;
}

/* ───────── Critic ───────── */

export const CRITIC_SYSTEM = `You are the CRITIC agent. You judge whether the task is complete after the executor and tester have run.

Rules:
- Output ONLY JSON. No prose, no fences.
- Mark done=true ONLY if (a) tests passed (or no tests were applicable and the goal is clearly satisfied) AND (b) all plan steps appear addressed.
- If not done, provide a concise nextHint to the executor describing what to fix or do differently.

Schema:
{ "done": <true|false>, "reason": "...", "nextHint": "..." }`;

export function criticUser(
  prompt: string,
  plan: Plan,
  history: Observation[],
  testReport: TestReport,
): string {
  return `USER GOAL:
${prompt}

PLAN:
${plan.steps.map((s) => `[${s.id}] ${s.goal}`).join('\n')}

EXECUTOR OBSERVATIONS (last 8):
${history
  .slice(-8)
  .map((o) => `tool=${o.tool} ok=${o.ok} ${(o.error ?? o.output).slice(0, 200)}`)
  .join('\n')}

TEST REPORT:
ran=${testReport.ran} ok=${testReport.ok} exit=${testReport.exitCode ?? 'n/a'} detected=${testReport.detected ?? 'n/a'}
log:
${testReport.log.slice(-1500)}

Render your verdict.`;
}

/* ───────── Misc helpers reused across agents ───────── */

export function snapshotVerdict(v: Verdict): string {
  return `done=${v.done} reason=${v.reason}${v.nextHint ? ` hint=${v.nextHint}` : ''}`;
}
