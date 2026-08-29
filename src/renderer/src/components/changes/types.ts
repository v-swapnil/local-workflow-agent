export type ChangeKind =
  | 'modified'
  | 'created'
  | 'deleted'
  | 'renamed'
  | 'conflicted'
  | 'untracked';

export interface ChangedFile {
  path: string;
  originalPath?: string;
  kind: ChangeKind;
  section: 'staged' | 'working';
}

export interface ActiveChange {
  path: string;
  kind: ChangeKind;
  originalPath?: string;
  staged?: boolean;
}

export interface GitStatus {
  files?: Array<{
    path: string;
    from?: string;
    index: string;
    working_dir: string;
  }>;
  clean?: boolean;
  staged?: string[];
  not_added?: string[];
  modified?: string[];
  created?: string[];
  deleted?: string[];
  conflicted?: string[];
  renamed?: { from: string; to: string }[];
}
