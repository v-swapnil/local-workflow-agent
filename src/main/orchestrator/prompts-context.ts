import { listSessionMemories, listWorkspaceMemories } from '@main/services/memories';
import { RunCtx } from './runCtx';
import { EnvironmentContext, getEnvironmentContext } from '@main/services/env';
import { MemoryRecord } from '@shared/schema';

function formatEnvContext(env: EnvironmentContext): string {
  const lines = [
    `# Environment`,
    ` - Working directory: ${env.directory}`,
    ` - Platform: ${env.platform}`,
    ` - Shell: ${env.shell ?? 'unknown'}`,
    ` - Model: ${env.model}`,
    ` - Today's date: ${new Date().toDateString()}`,
  ];
  if (env.isGitRepo) {
    lines.push(` - Git branch: ${env.git.branch ?? 'HEAD detached'}`);
    if (env.git.changedFiles.length) {
      lines.push(` - Changed files: ${env.git.changedFiles.join(', ')}`);
    }
  }
  return lines.join('\n');
}

function formatMemoryContext(scope: 'session' | 'workspace', memories: MemoryRecord[]): string {
  const lines = [`<memories scope="${scope}">`];
  for (const memory of memories) {
    const type = memory.type;
    const content = memory.content
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
    lines.push(`  <memory type="${type}">${content}</memory>`);
  }
  lines.push('</memories>');
  return lines.join('\n');
}

export async function buildPromptContext(ctx: RunCtx): Promise<string> {
  const env = await getEnvironmentContext(ctx);
  const sessionMemories = listSessionMemories(ctx.sessionId);
  const workspaceMemories = listWorkspaceMemories(ctx.workspaceId);

  const parts = [
    formatEnvContext(env),
    formatMemoryContext('workspace', workspaceMemories),
    formatMemoryContext('session', sessionMemories),
  ];

  return parts.filter(Boolean).join('\n');
}
