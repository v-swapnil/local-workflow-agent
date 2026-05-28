import { type StatusResultRenamed, type StatusResult } from 'simple-git';
import { getWorkspace } from './workspaces.js';
import { gitFor, isRepo } from './gitCore.js';
import type { GitStatus } from './gitCore.js';

const EMPTY_STATUS: GitStatus = {
  isRepo: false,
  branch: null,
  ahead: 0,
  behind: 0,
  staged: [],
  modified: [],
  not_added: [],
  created: [],
  renamed: [],
  deleted: [],
  conflicted: [],
  files: [],
  clean: true,
};

export async function workspaceStatus(workspaceId: string): Promise<GitStatus> {
  return workspaceStatusAtPath((await getWorkspace(workspaceId)).path);
}

export async function workspaceStatusAtPath(path: string): Promise<GitStatus> {
  if (!(await isRepo(path))) return EMPTY_STATUS;
  const status: StatusResult = await gitFor(path).status();
  return {
    isRepo: true,
    branch: status.current,
    ahead: status.ahead,
    behind: status.behind,
    staged: status.staged,
    created: status.created,
    renamed: status.renamed,
    modified: status.modified,
    not_added: status.not_added,
    deleted: status.deleted,
    conflicted: status.conflicted,
    files: status.files.map((fileEntry) => ({
      path: fileEntry.path,
      index: fileEntry.index,
      working_dir: fileEntry.working_dir,
      from: fileEntry.from,
    })),
    clean: status.isClean(),
  };
}
