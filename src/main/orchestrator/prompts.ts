import type { Observation } from '@shared/agent';

/* ───────── Environment context ───────── */

export interface EnvironmentContext {
  directory: string; // working directory (workspace path)
  worktree: string; // git worktree root (or same as directory)
  isGitRepo: boolean;
  platform: string; // e.g. "darwin", "linux", "win32"
  shell: string | null;
  model: string;
  git: {
    branch: string | null;
    changedFiles: string[];
  };
}

function formatEnvContext(env: EnvironmentContext): string {
  const lines = [
    `<env>`,
    `  Working directory: ${env.directory}`,
    `  Workspace root folder: ${env.worktree}`,
    `  Is directory a git repo: ${env.isGitRepo ? 'yes' : 'no'}`,
    `  Platform: ${env.platform}`,
    `  Shell: ${env.shell ?? 'unknown'}`,
    `  Model: ${env.model}`,
    `  Today's date: ${new Date().toDateString()}`,
  ];
  if (env.isGitRepo) {
    lines.push(`  Git branch: ${env.git.branch ?? 'HEAD detached'}`);
    if (env.git.changedFiles.length) {
      const capped = env.git.changedFiles.slice(0, 30);
      lines.push(`  Changed files (${env.git.changedFiles.length}):`);
      for (const f of capped) lines.push(`    ${f}`);
      if (env.git.changedFiles.length > 30)
        lines.push(`    ... and ${env.git.changedFiles.length - 30} more`);
    }
  }
  lines.push(`</env>`);
  return lines.join('\n');
}

/* ───────── Planner ───────── */

export const PLANNER_SYSTEM = `You are the PLANNER agent in an autonomous coding system.
Your job: read the user's goal and produce a detailed, concrete plan in Markdown.

Rules:
- Output ONLY Markdown. No JSON, no fences wrapping the whole output.
- The plan should contain numbered steps that are small, verifiable, and ordered.
- Prefer fewer larger steps over many tiny ones (1-6 steps).
- Include creating or updating tests when the goal involves code.
- Do not invent files that do not exist; rely on the executor to inspect the workspace.
- Be specific about which files to change and what approach to take.`;

export function plannerUser(
  prompt: string,
  env: EnvironmentContext,
  memory?: string | null,
): string {
  return `USER GOAL:
${prompt}

${memory?.trim() ? `SESSION MEMORY:\n${memory.trim()}\n` : ''}

Here is some useful information about the environment you are running in:
${formatEnvContext(env)}

Produce the plan now.`;
}

/* ───────── Executor ───────── */

export const EXECUTOR_SYSTEM = `You are the EXECUTOR agent. You carry out a plan by calling tools.

You will be given:
- The full plan (in Markdown)
- A history of prior tool calls and their observations

On each turn you MUST either:
1. Call exactly ONE tool using the native tool-calling interface, OR
2. Reply with a text message containing ONLY the JSON: {"done": true} to declare the task complete.

Rules:
- Prefer reading and listing before writing. Verify assumptions.
- Use \`apply_patch\` for edits to existing files; use \`write_file\` for new files.
- Work through the plan steps in order. When all steps are satisfied, respond with {"done": true}.
- Run tests when appropriate to verify your changes work correctly.
- Keep file contents minimal and correct.`;

export function executorUser(
  goal: string,
  plan: string,
  history: Observation[],
  env: EnvironmentContext,
  memory?: string | null,
): string {
  const histStr = history.length
    ? history
        .map(
          (o, i) =>
            `(${i + 1}) tool=${o.tool} ok=${o.ok}\nargs=${JSON.stringify(o.args).slice(0, 400)}\nout=${(o.error ?? o.output).slice(0, 800)}`,
        )
        .join('\n---\n')
    : '(no prior observations)';

  return `OVERALL GOAL:
${goal}

${memory?.trim() ? `SESSION MEMORY:\n${memory.trim()}\n` : ''}

Here is some useful information about the environment you are running in:
${formatEnvContext(env)}

PLAN:
${plan}

OBSERVATIONS SO FAR:
${histStr}

Call a tool or respond with {"done": true}.`;
}
