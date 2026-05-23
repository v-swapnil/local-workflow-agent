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
Your job: understand the user's goal, explore the codebase using read-only tools,
and produce a detailed, actionable plan in Markdown.

# Available tools
You have read-only tools: read_file, list_dir, grep, glob, git_status, git_diff, read_memories.
- Use glob to find files by name pattern.
- Use grep to search file contents by regex.
- Use read_file with offset/limit to read specific sections of large files.
- Call multiple tools in parallel when you need independent pieces of information.

# Workflow
1. Explore the codebase — list directories, glob for relevant files, grep for patterns,
   read key files. Batch parallel reads when you know multiple files you need.
2. Once you have enough context, output your final plan as a text response (no tool call).

# Plan format
- Output ONLY Markdown. No JSON, no fences wrapping the whole output.
- Numbered steps that are small, verifiable, and ordered.
- Prefer fewer larger steps over many tiny ones (1-6 steps).
- Reference specific files and line numbers you discovered (e.g. \`src/foo.ts:42\`).
- Be specific: which files to change, what approach, what to add/remove.
- Include tests when the goal involves code changes.`;

export function plannerUser(
  prompt: string,
  env: EnvironmentContext,
  memory?: string | null,
): string {
  return `USER GOAL:
${prompt}

${memory?.trim() ? `SESSION MEMORY:\n${memory.trim()}\n` : ''}
${formatEnvContext(env)}

Explore the codebase, then produce the plan.`;
}

/* ───────── Executor ───────── */

export const EXECUTOR_SYSTEM = `You are the EXECUTOR agent. You carry out a plan by calling tools.

# Tool usage
- You can call one or more tools per turn. When multiple independent operations
  are needed (e.g. reading several files, or running git status while reading a file),
  batch them into a single response with multiple tool calls for parallel execution.
- Use \`edit\` for targeted changes to existing files (oldString/newString).
- Use \`write_file\` only for creating new files.
- Use \`apply_patch\` for multi-file unified diffs.
- Use \`read_file\` before editing to verify current content. Reference line numbers from the output.
- Use \`grep\` and \`glob\` to find files and patterns before making changes.
- Use \`run_shell\` for builds, linters, and other commands.
- Use \`run_tests\` to verify changes work correctly.

# Workflow
- Work through the plan steps in order.
- Verify assumptions by reading files before editing.
- After making changes, run tests or linters when appropriate.
- When all steps are complete, respond with the JSON: {"done": true}

# Conventions
- Follow existing code style and conventions in the project.
- Do not add comments unless the code is non-obvious.
- Keep changes minimal and correct.`;

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
            `(${i + 1}) tool=${o.tool} ok=${o.ok}\nargs=${JSON.stringify(o.args)}\nout=${o.error ?? o.output}`,
        )
        .join('\n---\n')
    : '(no prior observations)';

  return `GOAL:
${goal}

${memory?.trim() ? `SESSION MEMORY:\n${memory.trim()}\n` : ''}
${formatEnvContext(env)}

PLAN:
${plan}

OBSERVATIONS:
${histStr}

Call tools or respond with {"done": true}.`;
}
