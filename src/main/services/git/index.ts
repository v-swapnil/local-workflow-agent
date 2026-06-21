// Barrel — re-exports everything from the split git modules.
// All existing import sites (e.g. `import { ... } from './git.js'`) continue to work.
export type { GitFileStatus, GitStatus, GitDiff } from './gitCore.js';
export { ensureRepo, getWorktreeRoot } from './gitCore.js';
export { workspaceStatus, workspaceStatusAtPath } from './gitStatus.js';
export {
  workspaceDiff,
  workspaceDiffAtPath,
  showFileAtHead,
  showFileAtHeadAtPath,
  fileDiff,
  fileDiffAtPath,
  workspaceChangeStatsAtPath,
} from './gitDiff.js';
export type { GitFileStat } from './gitDiff.js';
export {
  createBranch,
  commitAll,
  currentBranch,
  stageFiles,
  unstageFiles,
  stageAll,
  unstageAll,
  commitStaged,
  pushBranch,
  checkGhAuth,
  createPullRequest,
  getPrStatus,
} from './gitOperations.js';
