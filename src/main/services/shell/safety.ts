import { parseCommand } from './parser.js';

export type SafetyTier = 'auto_approve' | 'prompt' | 'deny';

export interface ClassificationResult {
  tier: SafetyTier;
  subCommands: Array<{ text: string; executable: string; tier: SafetyTier; reason: string }>;
  denyReason: string | null;
}

const AUTO_APPROVE_COMMANDS = new Set([
  // Filesystem read-only
  'cat', 'head', 'tail', 'less', 'more', 'file', 'stat',
  'ls', 'dir', 'pwd', 'basename', 'dirname', 'realpath', 'readlink',
  'which', 'whereis', 'type', 'command',
  // Text processing
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack',
  'wc', 'sort', 'uniq', 'tr', 'cut', 'paste', 'fold',
  'awk', 'rev', 'nl', 'tac', 'column', 'fmt', 'expand', 'unexpand',
  'diff', 'comm', 'cmp',
  // System info
  'echo', 'printf', 'date', 'cal', 'uname', 'whoami', 'id', 'hostname',
  'env', 'printenv', 'locale',
  'du', 'df', 'uptime', 'nproc', 'sw_vers',
  // Search
  'fd', 'tree',
  // Misc safe
  'true', 'false', 'seq', 'expr', 'bc', 'jq', 'yq',
  'base64', 'md5', 'sha256sum', 'shasum', 'xxd', 'od', 'hexdump',
  'test', '[',
  'sleep',
]);

const CONDITIONAL_APPROVE: Record<string, (args: string[]) => SafetyTier> = {
  git: (args) => {
    const READ_ONLY_SUBS = new Set([
      'status', 'log', 'diff', 'show', 'branch', 'tag', 'remote',
      'stash', 'ls-files', 'ls-tree', 'rev-parse', 'describe',
      'shortlog', 'reflog', 'blame', 'config', 'worktree',
    ]);
    return args[0] && READ_ONLY_SUBS.has(args[0]) ? 'auto_approve' : 'prompt';
  },

  sed: (args) => {
    if (args.some((a) => a === '-i' || a.startsWith('-i') || a === '--in-place')) {
      return 'prompt';
    }
    return 'auto_approve';
  },

  find: (args) => {
    const dangerous = ['-exec', '-execdir', '-ok', '-okdir', '-delete'];
    return args.some((a) => dangerous.includes(a)) ? 'prompt' : 'auto_approve';
  },

  xargs: () => 'prompt',
};

interface DenyPattern {
  test: (executable: string, args: string[], fullText: string) => boolean;
  reason: string;
}

const DENY_PATTERNS: DenyPattern[] = [
  {
    test: (exe) => exe === 'sudo' || exe === 'su' || exe === 'doas',
    reason: 'Privilege escalation commands are blocked',
  },
  {
    test: (exe, args) => {
      if (exe !== 'rm') return false;
      const hasRecursive = args.some((a) => /^-[a-zA-Z]*r/i.test(a) || a === '--recursive');
      const hasForce = args.some((a) => /^-[a-zA-Z]*f/.test(a) || a === '--force');
      const targetsDanger = args.some(
        (a) =>
          a === '/' ||
          a === '~' ||
          a === '$HOME' ||
          (a.startsWith('/') && a.split('/').filter(Boolean).length <= 1),
      );
      return (hasRecursive || hasForce) && targetsDanger;
    },
    reason: 'Recursive deletion of root or home directory is blocked',
  },
  {
    test: (_exe, _args, text) => /:\(\)\s*\{.*\|.*&\s*\}\s*;?\s*:/.test(text),
    reason: 'Fork bomb pattern detected',
  },
  {
    test: (_exe, _args, text) =>
      /\b(curl|wget)\b.*\|\s*(bash|sh|zsh|dash)\b/.test(text),
    reason: 'Piping downloaded content to shell is blocked',
  },
  {
    test: (exe) => ['mkfs', 'fdisk', 'parted', 'dd'].includes(exe),
    reason: 'Disk manipulation commands are blocked',
  },
  {
    test: (exe) => exe === 'eval',
    reason: 'eval is blocked — use direct commands instead',
  },
  {
    test: (exe) => ['shutdown', 'reboot', 'halt', 'poweroff', 'init'].includes(exe),
    reason: 'System control commands are blocked',
  },
];

function classifyOne(
  text: string,
  executable: string,
  args: string[],
  fullCommand: string,
): { tier: SafetyTier; reason: string } {
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(executable, args, fullCommand)) {
      return { tier: 'deny', reason: pattern.reason };
    }
  }

  if (executable in CONDITIONAL_APPROVE) {
    const tier = CONDITIONAL_APPROVE[executable]!(args);
    return { tier, reason: tier === 'auto_approve' ? 'Safe command' : 'Requires approval' };
  }

  if (AUTO_APPROVE_COMMANDS.has(executable)) {
    return { tier: 'auto_approve', reason: 'Safe command' };
  }

  return { tier: 'prompt', reason: 'Unknown command requires approval' };
}

export function classifyCommand(command: string): ClassificationResult {
  const parsed = parseCommand(command);

  const results = parsed.subCommands.map((sub) => {
    const { tier, reason } = classifyOne(sub.text, sub.executable, sub.args, command);
    return { text: sub.text, executable: sub.executable, tier, reason };
  });

  // If no sub-commands parsed, default to prompt
  if (results.length === 0) {
    return {
      tier: 'prompt',
      subCommands: [{ text: command, executable: '', tier: 'prompt', reason: 'Could not parse command' }],
      denyReason: null,
    };
  }

  const hasDeny = results.some((r) => r.tier === 'deny');
  const hasPrompt = results.some((r) => r.tier === 'prompt');
  const tier: SafetyTier = hasDeny ? 'deny' : hasPrompt ? 'prompt' : 'auto_approve';
  const denyReason = hasDeny ? (results.find((r) => r.tier === 'deny')?.reason ?? null) : null;

  return { tier, subCommands: results, denyReason };
}
