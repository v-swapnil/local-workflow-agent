import { LinearClient } from '@linear/sdk';
import { getSetting, SETTING_KEYS } from '../settings';

export async function listIssues() {
  const apiKey = await getSetting(SETTING_KEYS.LINEAR_API_KEY);
  const linear = new LinearClient({ apiKey });

  const issues = await linear.issues({
    filter: {
      state: {
        type: {
          eq: 'unstarted',
        },
      },
    },
  });
  const plainIssues = [];

  for (const issue of issues.nodes) {
    plainIssues.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      completedAt: issue.completedAt,
      createdAt: issue.createdAt,
      startedAt: issue.startedAt,
      dueDate: issue.dueDate,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      url: issue.url,
      status: 'unstarted',
    });
  }

  return plainIssues;
}
