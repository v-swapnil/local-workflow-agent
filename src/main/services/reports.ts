import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getTask, getSession, listSteps } from './store.js';
import { getWorkspace } from './workspaces';
import { reportsDir } from '../util/paths.js';

export interface ExportedTaskReport {
  folder: string;
  jsonPath: string;
  markdownPath: string;
}

export async function exportTaskReport(taskId: string): Promise<ExportedTaskReport> {
  const task = getTask(taskId);
  const session = getSession(task.sessionId);
  const steps = listSteps(taskId);

  let workspace: { id: string; name: string; path: string } | null = null;
  try {
    const ws = await getWorkspace(session.workspaceId);
    workspace = { id: ws.id, name: ws.name, path: ws.path };
  } catch {
    workspace = null;
  }

  const payload = {
    exportedAt: Date.now(),
    task,
    session,
    workspace,
    plan: task.plan,
    result: tryParseJson(task.result),
    steps: steps.map((s) => ({
      ...s,
      input: tryParseJson(s.inputJson),
      output: tryParseJson(s.outputJson),
    })),
  };

  const folder = reportsDir();
  const stamp = fmtStamp(payload.exportedAt);
  const base = `${stamp}-${task.id}`;
  const jsonPath = join(folder, `${base}.json`);
  const markdownPath = join(folder, `${base}.md`);

  await writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  await writeFile(markdownPath, toMarkdown(payload), 'utf8');

  return { folder, jsonPath, markdownPath };
}

function tryParseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function fmtStamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}${m}${day}-${hh}${mm}${ss}`;
}

function toMarkdown(payload: {
  exportedAt: number;
  task: {
    id: string;
    prompt: string;
    status: string;
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    iterations: number;
    maxIterations: number;
  };
  session: { id: string; title: string; workspaceId: string };
  workspace: { id: string; name: string; path: string } | null;
  steps: Array<{
    id: string;
    idx: number;
    agent: string;
    tool: string | null;
    status: string;
    startedAt: number | null;
    finishedAt: number | null;
  }>;
  result: unknown;
}): string {
  const lines: string[] = [];
  lines.push('# ASE Task Report');
  lines.push('');
  lines.push(`- Exported: ${new Date(payload.exportedAt).toISOString()}`);
  lines.push(`- Task ID: ${payload.task.id}`);
  lines.push(`- Session: ${payload.session.title} (${payload.session.id})`);
  lines.push(`- Workspace ID: ${payload.session.workspaceId}`);
  if (payload.workspace) {
    lines.push(`- Workspace: ${payload.workspace.name}`);
    lines.push(`- Workspace Path: ${payload.workspace.path}`);
  }
  lines.push(`- Status: ${payload.task.status}`);
  lines.push(`- Iterations: ${payload.task.iterations}/${payload.task.maxIterations}`);
  lines.push('');
  lines.push('## Prompt');
  lines.push('');
  lines.push('```text');
  lines.push(payload.task.prompt);
  lines.push('```');
  lines.push('');
  lines.push('## Timeline');
  lines.push('');
  lines.push('| # | Agent | Tool | Status | Started | Finished |');
  lines.push('|---|---|---|---|---|---|');
  for (const s of payload.steps) {
    lines.push(
      `| ${s.idx} | ${s.agent} | ${s.tool ?? '-'} | ${s.status} | ${fmtIso(s.startedAt)} | ${fmtIso(s.finishedAt)} |`,
    );
  }
  lines.push('');
  lines.push('## Final Result');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(payload.result ?? {}, null, 2));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function fmtIso(ts: number | null): string {
  return ts ? new Date(ts).toISOString() : '-';
}
