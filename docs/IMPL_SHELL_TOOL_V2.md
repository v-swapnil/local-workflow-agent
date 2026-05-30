# Shell Tool v2 — Implementation Plan

> Redesign of `run_shell` from a restrictive sandboxed exec to a full shell-mode tool
> with tree-sitter safety analysis, tiered approval, and rich output handling.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State](#2-current-state)
3. [Architecture](#3-architecture)
4. [Phase 1 — Shell Execution Engine](#phase-1--shell-execution-engine)
5. [Phase 2 — Tree-Sitter Command Parsing](#phase-2--tree-sitter-command-parsing)
6. [Phase 3 — Safety Tiers & Approval Integration](#phase-3--safety-tiers--approval-integration)
7. [Phase 4 — Output Handling & Truncation](#phase-4--output-handling--truncation)
8. [Phase 5 — Tool Definition & Registry](#phase-5--tool-definition--registry)
9. [Phase 6 — Settings & Dynamic Description](#phase-6--settings--dynamic-description)
10. [Phase 7 — Frontend Approval UX Enhancement](#phase-7--frontend-approval-ux-enhancement)
11. [Phase 8 — Cleanup & Migration](#phase-8--cleanup--migration)
12. [File Inventory](#file-inventory)
13. [Testing Strategy](#testing-strategy)
14. [Risks & Mitigations](#risks--mitigations)

---

## 1. Overview

### Problem

The current `run_shell` tool uses `spawn(cmd, args, { shell: false })` with a hardcoded
allowlist of ~30 commands. LLMs cannot run pipelines (`grep | wc`), chained commands
(`npm install && npm test`), redirections, or any command outside the allowlist. This
makes the tool near-useless for real development tasks.

### Solution

Replace the tool with a shell-mode execution engine that:

- Runs commands via the user's shell (`bash -c`, `zsh -c`, etc.)
- Uses tree-sitter to parse bash AST and classify sub-commands into safety tiers
- Auto-approves safe read-only commands, prompts for everything else, blocks destructive patterns
- Returns rich output with truncation and full-output temp files
- Is configurable via app settings (shell path, timeout defaults)

### Design Decisions (from brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Execution mode | Shell mode (`-l -c command`) — single `command` string |
| 2 | Shell resolution | Configurable in settings, default: `$SHELL` → `/bin/bash` → `/bin/sh` |
| 3 | Security model | Tiered: auto-approve / prompt / denylist |
| 4 | Command parsing | Tree-sitter bash grammar |
| 5 | Input schema | `{ command, description, timeoutMs?, workdir? }` |
| 6 | Output limit | 50 KB inline, tail-truncated, overflow saved to temp file |
| 7 | Timeout | Wall-clock 120s default, 10 min max |
| 8 | Environment | Full parent env, no filtering |
| 9 | Kill strategy | SIGTERM → 2s grace → SIGKILL |
| 10 | ANSI codes | Strip everywhere |
| 11 | Approval | `needsApproval: false`; approval logic inside tool based on parsed tier |
| 12 | Replaces | `sandbox.ts` (`runSandboxed`) removed entirely |

---

## 2. Current State

### Files to modify/replace

| File | Action |
|------|--------|
| `src/main/services/sandbox.ts` | **Delete** — replaced by `shell/exec.ts` |
| `src/main/services/tools/shell.ts` | **Rewrite** — new schema, delegates to shell module |
| `src/main/services/tools/registry.ts` | **Modify** — update import, keep tool name `run_shell` |
| `src/main/services/approvals.ts` | **Modify** — add pattern-based session approval |
| `src/main/services/settings.ts` | **Modify** — add `SHELL_PATH`, `SHELL_TIMEOUT` keys |
| `src/main/ipc/settings.ts` | **Modify** — expose new shell settings to frontend |
| `src/main/orchestrator/prompts.ts` | **Modify** — update `run_shell` usage guidance |
| `src/shared/agent.ts` | **No change** — `ToolName` already has `'run_shell'` |
| `src/renderer/src/pages/sessions/ApprovalModal.tsx` | **Modify** — enhanced display for shell commands |

### Files to create

| File | Purpose |
|------|---------|
| `src/main/services/shell/exec.ts` | Core execution engine |
| `src/main/services/shell/parser.ts` | Tree-sitter bash command parsing |
| `src/main/services/shell/safety.ts` | Tier classification (auto-approve / prompt / deny) |
| `src/main/services/shell/truncate.ts` | Output truncation + temp file management |
| `src/main/services/shell/env.ts` | Shell resolution + environment preparation |
| `src/main/services/shell/description.ts` | Dynamic tool description template |
| `src/main/services/shell/index.ts` | Barrel export |

---

## 3. Architecture

```
LLM tool call: run_shell({ command, description, workdir?, timeoutMs? })
         │
         ▼
┌─── tools/shell.ts (thin wrapper) ───┐
│  1. Validate input via zod schema   │
│  2. Resolve working directory       │
│  3. Call safety.classify(command)    │
│  4. Handle approval based on tier   │
│  5. Call exec.runShell(...)          │
│  6. Format result for LLM           │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
  shell/safety.ts   shell/exec.ts
       │               │
       ▼               ├── shell/env.ts      (resolve shell, build args)
  shell/parser.ts      ├── shell/truncate.ts (output handling)
  (tree-sitter AST)    └── tree-kill         (process cleanup)
```

### Data Flow

```
command string
  → parser.ts: parse with tree-sitter-bash → AST
  → parser.ts: extract sub-commands from &&, ||, ;, | chains
  → safety.ts: classify each sub-command → auto-approve | prompt | deny
  → tools/shell.ts: if any sub-command denied → reject immediately
  → tools/shell.ts: if any sub-command needs prompt → requestApproval()
  → tools/shell.ts: if all auto-approved → proceed
  → env.ts: resolve shell path, build spawn args
  → exec.ts: spawn shell process, stream output, handle timeout
  → truncate.ts: if output > 50KB → save to temp file, truncate inline
  → strip ANSI from output
  → return ShellResult to LLM
```

---

## Phase 1 — Shell Execution Engine

### File: `src/main/services/shell/exec.ts`

Core execution function that replaces `runSandboxed()`.

#### Interface

```typescript
import type { ShellResult, ShellExecOptions } from './types.js';

export async function runShell(opts: ShellExecOptions): Promise<ShellResult>;
```

#### Types (in a shared types.ts or inline)

```typescript
export interface ShellExecOptions {
  command: string;
  cwd: string;
  timeoutMs?: number;          // default 120_000, max 600_000
  signal?: AbortSignal;
  onLog?: (chunk: { stream: 'stdout' | 'stderr'; text: string }) => void;
}

export interface ShellResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** Combined interleaved stdout+stderr, ANSI stripped, truncated to 50KB */
  output: string;
  durationMs: number;
  timedOut: boolean;
  killedByUser: boolean;
  truncated: boolean;
  /** Path to temp file with full output (only set when truncated) */
  fullOutputPath: string | null;
}
```

#### Implementation Details

1. **Shell resolution**: Call `resolveShell()` from `env.ts` to get shell path and args.

2. **Spawn**:
   ```typescript
   const { shellPath, shellArgs } = await resolveShell(command);
   const child = spawn(shellPath, shellArgs, {
     cwd,
     env: process.env,                      // Full parent env, no filtering
     stdio: ['ignore', 'pipe', 'pipe'],     // No stdin
     detached: process.platform !== 'win32', // Process group on Unix
   });
   ```

3. **Output collection** — interleave stdout and stderr in arrival order:
   ```typescript
   const chunks: string[] = [];
   let totalBytes = 0;

   child.stdout.on('data', (buf: Buffer) => {
     const text = stripAnsi(buf.toString('utf8'));
     chunks.push(text);
     totalBytes += Buffer.byteLength(text);
     opts.onLog?.({ stream: 'stdout', text });
   });

   child.stderr.on('data', (buf: Buffer) => {
     const text = stripAnsi(buf.toString('utf8'));
     chunks.push(text);
     totalBytes += Buffer.byteLength(text);
     opts.onLog?.({ stream: 'stderr', text });
   });
   ```

4. **ANSI stripping** — use a simple regex (no dependency needed):
   ```typescript
   // eslint-disable-next-line no-control-regex
   const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b[()][AB012]|\x1b\[[\?]?[0-9;]*[hlmsr]/g;

   function stripAnsi(text: string): string {
     return text.replace(ANSI_RE, '');
   }
   ```

5. **Timeout** — wall-clock with SIGTERM → SIGKILL escalation:
   ```typescript
   const timeoutMs = Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

   const timer = setTimeout(() => {
     timedOut = true;
     killGracefully(child.pid);
   }, timeoutMs);
   ```

6. **Kill strategy** — SIGTERM first, SIGKILL after 2s:
   ```typescript
   import treeKill from 'tree-kill';

   function killGracefully(pid: number | undefined): void {
     if (pid === undefined) return;
     treeKill(pid, 'SIGTERM', () => {
       // If still alive after 2s, force kill
       setTimeout(() => {
         treeKill(pid, 'SIGKILL', () => { /* swallow */ });
       }, 2000);
     });
   }
   ```

7. **Abort signal** — handle user cancellation:
   ```typescript
   const onAbort = () => {
     killedByUser = true;
     killGracefully(child.pid);
   };
   if (opts.signal) {
     if (opts.signal.aborted) { onAbort(); }
     else { opts.signal.addEventListener('abort', onAbort, { once: true }); }
   }
   ```

8. **Result assembly** — on process close:
   ```typescript
   child.on('close', (code, sig) => {
     clearTimeout(timer);
     opts.signal?.removeEventListener('abort', onAbort);

     const rawOutput = chunks.join('');
     const { text, truncated, fullOutputPath } = truncateOutput(rawOutput);

     resolve({
       ok: code === 0 && !timedOut && !killedByUser,
       exitCode: code,
       signal: sig,
       output: text,
       durationMs: Date.now() - t0,
       timedOut,
       killedByUser,
       truncated,
       fullOutputPath,
     });
   });
   ```

#### Constants

```typescript
const DEFAULT_TIMEOUT_MS = 120_000;   // 2 minutes
const MAX_TIMEOUT_MS = 600_000;       // 10 minutes
```

---

## Phase 2 — Tree-Sitter Command Parsing

### File: `src/main/services/shell/parser.ts`

### Dependency

Add `tree-sitter-bash` to `package.json`:
```bash
pnpm add tree-sitter-bash
```

### Interface

```typescript
export interface ParsedCommand {
  /** The full original command text */
  raw: string;
  /** Individual sub-commands extracted from chains (&&, ||, ;, |) */
  subCommands: SubCommand[];
}

export interface SubCommand {
  /** The command text */
  text: string;
  /** The executable name (first token), e.g. 'grep', 'npm', 'git' */
  executable: string;
  /** Arguments following the executable */
  args: string[];
  /** Operator connecting to next command (&&, ||, ;, |) or null for last */
  chainOp: '&&' | '||' | ';' | '|' | null;
}

export function parseCommand(command: string): ParsedCommand;
```

### Implementation Details

1. **Parser setup** — follows existing pattern in `codesearch/language.ts`:
   ```typescript
   import Parser from 'tree-sitter';
   import Bash from 'tree-sitter-bash';

   let cachedParser: Parser | null = null;

   function getBashParser(): Parser {
     if (cachedParser) return cachedParser;
     const p = new Parser();
     p.setLanguage(Bash);
     cachedParser = p;
     return p;
   }
   ```

2. **AST traversal** — walk the tree to extract commands from:
   - `command` nodes → individual commands
   - `pipeline` nodes → piped chains
   - `list` nodes → `&&` / `||` chains
   - `compound_statement` nodes → `;` separated

3. **Sub-command extraction**:
   ```typescript
   function extractSubCommands(node: Parser.SyntaxNode): SubCommand[] {
     const commands: SubCommand[] = [];

     function visit(node: Parser.SyntaxNode): void {
       switch (node.type) {
         case 'command': {
           const parts = node.namedChildren
             .filter(n => n.type === 'word' || n.type === 'string' || n.type === 'raw_string')
             .map(n => n.text);
           if (parts.length > 0) {
             commands.push({
               text: node.text,
               executable: parts[0],
               args: parts.slice(1),
               chainOp: null, // set by parent
             });
           }
           break;
         }
         case 'pipeline':
         case 'list':
           for (const child of node.children) {
             if (child.isNamed) visit(child);
             // Capture operators between named children
           }
           break;
         default:
           for (const child of node.namedChildren) visit(child);
       }
     }

     visit(node);
     return commands;
   }
   ```

4. **Fallback** — if tree-sitter parsing fails (malformed command), fall back to
   simple string splitting on `&&`, `||`, `;`, `|` with the first whitespace-delimited
   token as the executable:
   ```typescript
   function fallbackParse(command: string): SubCommand[] {
     return command
       .split(/\s*(?:&&|\|\||;|\|)\s*/)
       .filter(Boolean)
       .map(part => {
         const tokens = part.trim().split(/\s+/);
         return {
           text: part.trim(),
           executable: tokens[0],
           args: tokens.slice(1),
           chainOp: null,
         };
       });
   }
   ```

5. **Edge cases**:
   - Subshells `$(...)` and backticks — extract inner command too
   - Redirections `>`, `>>`, `2>&1` — ignore for safety classification (they don't change the command)
   - Variable assignments `FOO=bar cmd` — the command is `cmd`, not `FOO=bar`
   - Glob patterns `*.ts` — not a command, ignore
   - String concatenation — `echo "hello " && rm file` → two sub-commands

---

## Phase 3 — Safety Tiers & Approval Integration

### File: `src/main/services/shell/safety.ts`

### Interface

```typescript
export type SafetyTier = 'auto_approve' | 'prompt' | 'deny';

export interface ClassificationResult {
  /** Overall tier — worst tier among all sub-commands */
  tier: SafetyTier;
  /** Per sub-command classification */
  subCommands: Array<{
    text: string;
    executable: string;
    tier: SafetyTier;
    reason: string;
  }>;
  /** Human-readable denial reason (only if tier === 'deny') */
  denyReason: string | null;
}

export function classifyCommand(command: string): ClassificationResult;
```

### Auto-Approved Commands (read-only / safe)

```typescript
const AUTO_APPROVE_COMMANDS = new Set([
  // Filesystem read-only
  'cat', 'head', 'tail', 'less', 'more', 'file', 'stat',
  'ls', 'dir', 'pwd', 'basename', 'dirname', 'realpath', 'readlink',
  'find', 'locate', 'which', 'whereis', 'type', 'command',

  // Text processing (read-only)
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack',
  'wc', 'sort', 'uniq', 'tr', 'cut', 'paste', 'fold',
  'sed',  // NOTE: classified as auto-approve only when NOT using -i (in-place)
  'awk', 'rev', 'nl', 'tac', 'column', 'fmt', 'expand', 'unexpand',
  'diff', 'comm', 'cmp',

  // System info
  'echo', 'printf', 'date', 'cal', 'uname', 'whoami', 'id', 'hostname',
  'env', 'printenv', 'locale',
  'du', 'df', 'free', 'uptime', 'top',  // top only if not interactive
  'nproc', 'lscpu', 'sw_vers',

  // Search/glob
  'fd', 'fzf', 'tree',

  // Misc safe
  'true', 'false', 'yes', 'seq', 'expr', 'bc', 'jq', 'yq',
  'base64', 'md5', 'sha256sum', 'shasum', 'xxd', 'od', 'hexdump',
  'man', 'help', 'info',
  'sleep',   // harmless but wastes time — auto-approve anyway
  'test', '[',
]);
```

### Auto-Approved with Argument Restrictions

Some commands are safe only with certain arguments:

```typescript
const CONDITIONAL_APPROVE: Record<string, (args: string[]) => SafetyTier> = {
  // git: read-only subcommands are safe
  git: (args) => {
    const sub = args[0];
    const readOnlySubs = new Set([
      'status', 'log', 'diff', 'show', 'branch', 'tag',
      'remote', 'stash', 'ls-files', 'ls-tree', 'rev-parse',
      'describe', 'shortlog', 'reflog', 'blame', 'config',
      'worktree',  // listing worktrees
    ]);
    if (sub && readOnlySubs.has(sub)) return 'auto_approve';
    return 'prompt';
  },

  // sed: safe without -i (in-place)
  sed: (args) => {
    if (args.some(a => a === '-i' || a.startsWith('-i') || a === '--in-place')) {
      return 'prompt';
    }
    return 'auto_approve';
  },

  // find: safe without -exec, -delete
  find: (args) => {
    const dangerous = ['-exec', '-execdir', '-ok', '-okdir', '-delete'];
    if (args.some(a => dangerous.includes(a))) return 'prompt';
    return 'auto_approve';
  },

  // xargs: always prompt (executes arbitrary commands)
  xargs: () => 'prompt',
};
```

### Deny List (blocked patterns)

```typescript
interface DenyPattern {
  test: (executable: string, args: string[], fullText: string) => boolean;
  reason: string;
}

const DENY_PATTERNS: DenyPattern[] = [
  {
    // sudo — privilege escalation
    test: (exe) => exe === 'sudo' || exe === 'su' || exe === 'doas',
    reason: 'Privilege escalation commands are blocked',
  },
  {
    // rm -rf / or rm -rf ~
    test: (exe, args) =>
      exe === 'rm' &&
      args.some(a => a.includes('-r') || a.includes('-f')) &&
      args.some(a => a === '/' || a === '~' || a === '$HOME' || a.startsWith('/') && a.split('/').length <= 2),
    reason: 'Recursive deletion of root or home directory is blocked',
  },
  {
    // Fork bomb patterns
    test: (_exe, _args, text) => /:\(\)\s*\{.*\|.*&\s*\}\s*;?\s*:/.test(text),
    reason: 'Fork bomb pattern detected',
  },
  {
    // Pipe to shell (curl | bash, wget | sh, etc.)
    // This is detected at the pipeline level, not sub-command level
    test: (_exe, _args, text) =>
      /\b(curl|wget)\b.*\|\s*(bash|sh|zsh|dash)\b/.test(text),
    reason: 'Piping downloaded content to shell is blocked',
  },
  {
    // Disk formatting
    test: (exe) => ['mkfs', 'fdisk', 'parted', 'dd'].includes(exe),
    reason: 'Disk manipulation commands are blocked',
  },
  {
    // eval with dynamic content
    test: (exe) => exe === 'eval',
    reason: 'eval is blocked — use direct commands instead',
  },
  {
    // Shutdown/reboot
    test: (exe) => ['shutdown', 'reboot', 'halt', 'poweroff', 'init'].includes(exe),
    reason: 'System control commands are blocked',
  },
];
```

### Classification Logic

```typescript
export function classifyCommand(command: string): ClassificationResult {
  const parsed = parseCommand(command);
  const results = parsed.subCommands.map(sub => {
    // 1. Check deny list first
    for (const pattern of DENY_PATTERNS) {
      if (pattern.test(sub.executable, sub.args, sub.text)) {
        return { text: sub.text, executable: sub.executable, tier: 'deny' as const, reason: pattern.reason };
      }
    }

    // 2. Check conditional approve
    if (sub.executable in CONDITIONAL_APPROVE) {
      const tier = CONDITIONAL_APPROVE[sub.executable](sub.args);
      return { text: sub.text, executable: sub.executable, tier, reason: tier === 'auto_approve' ? 'Safe command' : 'Requires approval' };
    }

    // 3. Check auto-approve set
    if (AUTO_APPROVE_COMMANDS.has(sub.executable)) {
      return { text: sub.text, executable: sub.executable, tier: 'auto_approve' as const, reason: 'Safe command' };
    }

    // 4. Default: prompt
    return { text: sub.text, executable: sub.executable, tier: 'prompt' as const, reason: 'Unknown command requires approval' };
  });

  // Overall tier is the worst among all sub-commands
  const hasDeny = results.some(r => r.tier === 'deny');
  const hasPrompt = results.some(r => r.tier === 'prompt');
  const tier: SafetyTier = hasDeny ? 'deny' : hasPrompt ? 'prompt' : 'auto_approve';
  const denyReason = hasDeny ? results.find(r => r.tier === 'deny')!.reason : null;

  return { tier, subCommands: results, denyReason };
}
```

### Approval Integration in `tools/shell.ts`

The tool's `run` function handles approval internally:

```typescript
run: async (input, ctx) => {
  const classification = classifyCommand(input.command);

  // Denied commands → reject immediately
  if (classification.tier === 'deny') {
    throw new Error(`Command blocked: ${classification.denyReason}`);
  }

  // Prompted commands → request approval (if not auto-approve globally)
  if (classification.tier === 'prompt' && ctx.taskId) {
    const decision = await requestApproval(ctx.taskId, 'run_shell', {
      command: input.command,
      description: input.description,
      workdir: input.workdir,
      classification: classification.subCommands,
    }, ctx.signal);

    if (decision === 'deny') {
      return { ok: false, output: 'Command denied by user', ... };
    }
  }

  // Execute
  return runShell({ ... });
}
```

### Pattern-Based Session Approval

Extend the existing `approve_session` behavior in `approvals.ts`. Currently it
remembers the *tool name* for the session. We need it to remember *command patterns*.

**Changes to `src/main/services/approvals.ts`:**

```typescript
// Add alongside existing taskAllow:
/** Per-task allowlist for command patterns (e.g. "npm install *", "git commit *") */
const taskShellPatterns = new Map<string, Set<string>>();

/** Extract approval pattern from a command — first 1-2 tokens + wildcard */
export function extractCommandPattern(command: string): string {
  // Parse to get first sub-command's executable + first arg
  // "npm install express" → "npm install"
  // "git commit -m 'fix'" → "git commit"
  // "ls -la" → "ls"
  const tokens = command.trim().split(/\s+/).slice(0, 2);
  return tokens.join(' ');
}

/** Check if a command matches an approved pattern */
export function matchesApprovedPattern(taskId: string, command: string): boolean {
  const patterns = taskShellPatterns.get(taskId);
  if (!patterns) return false;
  const cmdPattern = extractCommandPattern(command);
  return patterns.has(cmdPattern);
}

/** Record a pattern as approved for the task's session */
export function approvePatternForTask(taskId: string, command: string): void {
  let patterns = taskShellPatterns.get(taskId);
  if (!patterns) {
    patterns = new Set();
    taskShellPatterns.set(taskId, patterns);
  }
  patterns.add(extractCommandPattern(command));
}
```

Update `requestApproval` in the shell tool path to:
1. Check `matchesApprovedPattern()` before prompting
2. On `approve_session` decision, call `approvePatternForTask()`
3. Clear patterns in `clearTaskApprovals()`

---

## Phase 4 — Output Handling & Truncation

### File: `src/main/services/shell/truncate.ts`

### Interface

```typescript
export interface TruncationResult {
  /** The (possibly truncated) output text */
  text: string;
  /** Whether the output was truncated */
  truncated: boolean;
  /** Path to temp file with full output (null if not truncated) */
  fullOutputPath: string | null;
}

export function truncateOutput(raw: string): TruncationResult;

/** Clean up temp files older than `maxAgeMs` (default 24 hours) */
export function cleanupTruncationFiles(maxAgeMs?: number): void;
```

### Constants

```typescript
const MAX_INLINE_BYTES = 50 * 1024;        // 50 KB
const MAX_INLINE_LINES = 2000;             // 2000 lines
const TRUNCATION_DIR = 'shell-output';     // Under app data dir
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
```

### Implementation Details

1. **Tail truncation** — keep the LAST N lines/bytes (errors are at the end):
   ```typescript
   export function truncateOutput(raw: string): TruncationResult {
     const byteSize = Buffer.byteLength(raw, 'utf8');
     const lines = raw.split('\n');

     if (byteSize <= MAX_INLINE_BYTES && lines.length <= MAX_INLINE_LINES) {
       return { text: raw, truncated: false, fullOutputPath: null };
     }

     // Save full output to temp file
     const fullOutputPath = saveTempOutput(raw);

     // Tail truncate: keep last MAX_INLINE_LINES lines that fit in MAX_INLINE_BYTES
     let truncated = '';
     let bytes = 0;
     let startLine = lines.length;

     for (let i = lines.length - 1; i >= 0; i--) {
       const lineBytes = Buffer.byteLength(lines[i] + '\n', 'utf8');
       if (bytes + lineBytes > MAX_INLINE_BYTES || lines.length - i > MAX_INLINE_LINES) break;
       bytes += lineBytes;
       startLine = i;
     }

     truncated = lines.slice(startLine).join('\n');
     const header = `[Output truncated: showing last ${lines.length - startLine} of ${lines.length} lines. Full output: ${fullOutputPath}]\n\n`;

     return {
       text: header + truncated,
       truncated: true,
       fullOutputPath,
     };
   }
   ```

2. **Temp file management**:
   ```typescript
   import { mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
   import { join } from 'node:path';
   import { tmpdir } from 'node:os';
   import { nanoid } from 'nanoid';

   const truncDir = join(tmpdir(), 'ase-shell-output');

   function saveTempOutput(content: string): string {
     mkdirSync(truncDir, { recursive: true });
     const filePath = join(truncDir, `shell-${nanoid(8)}.txt`);
     writeFileSync(filePath, content, 'utf8');
     return filePath;
   }

   export function cleanupTruncationFiles(maxAgeMs = MAX_FILE_AGE_MS): void {
     try {
       const files = readdirSync(truncDir);
       const now = Date.now();
       for (const file of files) {
         const filePath = join(truncDir, file);
         const stat = statSync(filePath);
         if (now - stat.mtimeMs > maxAgeMs) {
           unlinkSync(filePath);
         }
       }
     } catch {
       // Directory may not exist yet — ignore
     }
   }
   ```

3. **Cleanup schedule** — call `cleanupTruncationFiles()` on app startup and
   periodically (e.g. every 6 hours via `setInterval`). Hook into existing app
   initialization in `src/main/index.ts`.

---

## Phase 5 — Tool Definition & Registry

### File: `src/main/services/tools/shell.ts` (rewrite)

```typescript
import { z } from 'zod';
import { resolve, isAbsolute } from 'node:path';
import { runShell } from '../shell/exec.js';
import { classifyCommand } from '../shell/safety.js';
import { getShellDescription } from '../shell/description.js';
import { requestApproval, matchesApprovedPattern, approvePatternForTask } from '../approvals.js';
import { logger } from '../logger.js';
import type { Tool } from './types.js';
import type { ShellResult } from '../shell/types.js';

const shellInputSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe('The shell command to execute. Supports pipes, chaining (&&, ||), redirections.'),
  description: z
    .string()
    .min(1)
    .describe('5-10 word description of what this command does and why.'),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(600_000)
    .optional()
    .describe('Timeout in milliseconds. Default 120000 (2 min), max 600000 (10 min).'),
  workdir: z
    .string()
    .optional()
    .describe('Working directory relative to workspace root. Must not escape workspace.'),
});

type ShellInput = z.infer<typeof shellInputSchema>;

export const runShellTool: Tool<ShellInput, ShellResult> = {
  name: 'run_shell',
  description: '', // Set dynamically — see below
  schema: shellInputSchema,
  needsApproval: false, // Approval handled internally based on command tier
  run: async (input, ctx) => {
    // 1. Resolve and validate working directory
    let cwd = ctx.workspacePath;
    if (input.workdir) {
      if (isAbsolute(input.workdir) || input.workdir.includes('..')) {
        throw new Error('workdir must be a relative path within the workspace (no ".." or absolute paths)');
      }
      cwd = resolve(ctx.workspacePath, input.workdir);
      if (!cwd.startsWith(ctx.workspacePath)) {
        throw new Error('workdir must not escape the workspace root');
      }
    }

    // 2. Classify command safety
    const classification = classifyCommand(input.command);

    // 3. Handle denied commands
    if (classification.tier === 'deny') {
      logger.warn({ command: input.command, reason: classification.denyReason }, 'shell command denied');
      return {
        ok: false,
        exitCode: null,
        signal: null,
        output: `Command blocked: ${classification.denyReason}`,
        durationMs: 0,
        timedOut: false,
        killedByUser: false,
        truncated: false,
        fullOutputPath: null,
      };
    }

    // 4. Handle prompted commands — check pattern cache first
    if (classification.tier === 'prompt' && ctx.taskId) {
      if (!matchesApprovedPattern(ctx.taskId, input.command)) {
        const decision = await requestApproval(
          ctx.taskId,
          'run_shell',
          {
            command: input.command,
            description: input.description,
            workdir: input.workdir ?? '.',
          },
          ctx.signal,
        );
        if (decision === 'deny') {
          return {
            ok: false,
            exitCode: null,
            signal: null,
            output: 'Command denied by user',
            durationMs: 0,
            timedOut: false,
            killedByUser: false,
            truncated: false,
            fullOutputPath: null,
          };
        }
        if (decision === 'approve_session') {
          approvePatternForTask(ctx.taskId, input.command);
        }
      }
    }

    // 5. Execute
    return runShell({
      command: input.command,
      cwd,
      timeoutMs: input.timeoutMs,
      signal: ctx.signal,
      onLog: ctx.onLog,
    });
  },
};
```

### Dynamic description

The `description` field is set dynamically at registration time (or via a getter).
Since the current registry expects a static `description` string, we have two options:

**Option A**: Generate description at import time (simple):
```typescript
// In tools/shell.ts, after the tool definition:
runShellTool.description = getShellDescription();
```

**Option B**: Make `listToolsForLLM()` call a function if description is a function.
This requires modifying the registry — more invasive.

**Recommendation**: Option A. Generate once at module load. If the user changes shell
settings, they restart the app (which re-imports the module).

### Registry Changes: `src/main/services/tools/registry.ts`

Minimal change — the import already exists:
```typescript
import { runShellTool } from './shell.js';
```
The tool name stays `'run_shell'`, the registry entry stays the same. No changes needed
to `registry.ts` beyond ensuring the import still works after the rewrite.

---

## Phase 6 — Settings & Dynamic Description

### File: `src/main/services/shell/env.ts`

#### Shell Resolution

```typescript
import { existsSync } from 'node:fs';
import { getSetting } from '../settings.js';
import { SETTING_KEYS } from '../settings.js';
import { platform } from 'node:os';

export interface ShellConfig {
  shellPath: string;
  shellArgs: string[];
}

export async function resolveShell(command: string): Promise<ShellConfig> {
  // 1. Check user setting
  const configured = await getSetting(SETTING_KEYS.SHELL_PATH);
  let shellPath: string;

  if (configured && existsSync(configured)) {
    shellPath = configured;
  } else {
    // 2. Fall back to $SHELL → /bin/bash → /bin/sh
    shellPath = process.env.SHELL ?? '/bin/bash';
    if (!existsSync(shellPath)) {
      shellPath = '/bin/bash';
      if (!existsSync(shellPath)) {
        shellPath = '/bin/sh';
      }
    }
  }

  // 3. Build args for login shell mode
  const shellName = shellPath.split('/').pop() ?? 'sh';
  const shellArgs = buildShellArgs(shellName, command);

  return { shellPath, shellArgs };
}

function buildShellArgs(shellName: string, command: string): string[] {
  switch (shellName) {
    case 'bash':
      // Login mode, source .bashrc, execute command
      return ['-l', '-c', command];

    case 'zsh':
      // Login mode (sources .zshenv, .zshrc), execute command
      return ['-l', '-c', command];

    case 'sh':
    case 'dash':
    case 'ksh':
      return ['-l', '-c', command];

    case 'fish':
      // Fish doesn't support -c with -l in the same way
      return ['-c', command];

    case 'pwsh':
    case 'powershell':
      return ['-NoProfile', '-NonInteractive', '-Command', command];

    default:
      return ['-c', command];
  }
}
```

### Settings Changes: `src/main/services/settings.ts`

Add new keys to `SETTING_KEYS`:

```typescript
export const SETTING_KEYS = {
  // ... existing keys ...
  SHELL_PATH: 'shell.path',
  SHELL_TIMEOUT: 'shell.defaultTimeout',
} as const;
```

### Settings Router: `src/main/ipc/settings.ts`

Add endpoints:

```typescript
shellPath: publicProcedure.query(async () => {
  return (await getSetting(SETTING_KEYS.SHELL_PATH)) ?? null;
}),

setShellPath: publicProcedure
  .input(z.object({ value: z.string().min(1) }))
  .mutation(async ({ input }) => {
    await setSetting(SETTING_KEYS.SHELL_PATH, input.value);
    return { ok: true as const };
  }),

shellTimeout: publicProcedure.query(async () => {
  const saved = await getSetting(SETTING_KEYS.SHELL_TIMEOUT);
  const n = saved ? parseInt(saved, 10) : 120000;
  return isNaN(n) || n < 1000 ? 120000 : Math.min(n, 600000);
}),

setShellTimeout: publicProcedure
  .input(z.object({ value: z.number().int().min(1000).max(600000) }))
  .mutation(async ({ input }) => {
    await setSetting(SETTING_KEYS.SHELL_TIMEOUT, String(input.value));
    return { ok: true as const };
  }),
```

### File: `src/main/services/shell/description.ts`

Dynamic tool description that tells the LLM how to use the tool effectively:

```typescript
import { platform, arch } from 'node:os';
import { resolveShell } from './env.js';

export async function getShellDescription(): Promise<string> {
  // Resolve shell to include in description
  const { shellPath } = await resolveShell('echo test');
  const shellName = shellPath.split('/').pop() ?? 'sh';
  const os = platform();
  const osName = os === 'darwin' ? 'macOS' : os === 'linux' ? 'Linux' : os === 'win32' ? 'Windows' : os;

  return `Execute a shell command in the workspace directory.

## Environment
- OS: ${osName} (${arch()})
- Shell: ${shellName} (${shellPath}), login mode
- Working directory: workspace root (override with workdir parameter)

## Command Guidelines
- Write commands for ${shellName} on ${osName}.
- Prefer pipelines over temp files: \`grep -r pattern src/ | head -20\` not redirect then read.
- Chain related commands: \`npm install && npm test\`.
- Quote variables and paths with spaces: \`"$var"\`, \`"path with spaces"\`.
- Use \`set -e\` prefix for multi-line scripts that should fail fast.

## Output
- stdout and stderr are combined in execution order.
- Output is truncated to 50KB (tail-preserved). If truncated, a temp file path with full output is provided.
- Use \`| head -n 50\` or \`| tail -n 50\` to limit output proactively.

## Git Safety
- NEVER use \`git push --force\` or \`git push -f\`.
- NEVER run \`git reset --hard\` on shared branches.
- NEVER amend published commits without explicit user request.
- Prefer \`git status\` and \`git diff\` (auto-approved) to check state before mutations.

## Security
- Read-only commands (ls, cat, grep, git status, etc.) run automatically.
- Other commands require user approval. Provide a clear \`description\` so the user understands the intent.
- Destructive commands (sudo, rm -rf /, eval) are blocked.

## Timeouts
- Default: 2 minutes. Max: 10 minutes.
- For long operations, set timeoutMs appropriately.`;
}
```

**Note**: Since `getShellDescription()` is async (reads settings), we need to
initialize it. Two approaches:

1. **Lazy init**: On first `listToolsForLLM()` call, await the description.
   Requires making `listToolsForLLM()` async.

2. **Eager init at startup**: Resolve shell config once at app startup,
   cache the description string, assign to `runShellTool.description`.

**Recommendation**: Eager init at startup. Add an `initShellTool()` function
called from `src/main/index.ts` after DB is ready:

```typescript
// In src/main/services/shell/index.ts
export async function initShellTool(): Promise<void> {
  const description = await getShellDescription();
  runShellTool.description = description;
}
```

---

## Phase 7 — Frontend Approval UX Enhancement

### File: `src/renderer/src/pages/sessions/ApprovalModal.tsx`

The current modal displays `req.tool` and `JSON.stringify(req.args)`. For shell
commands, we should show a more readable format.

#### Changes

1. **Detect shell commands**: Check if `req.tool === 'run_shell'`
2. **Show structured display**:
   - **Description**: The LLM's explanation (from `args.description`)
   - **Command**: The command string in a code block with monospace font
   - **Working directory**: If not default
3. **Keep generic display for other tools**

```tsx
export function ApprovalModal({ req, remaining, onDecide }: Props) {
  const isShell = req.tool === 'run_shell';
  const shellArgs = isShell ? (req.args as { command?: string; description?: string; workdir?: string }) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[560px] max-w-[90vw] rounded-xl border border-amber/20 bg-ink-900 shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-800/60 px-5 py-3">
          <div>
            <span className="rounded-full bg-amber/10 px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-amber">
              approval required
            </span>
            {remaining > 0 && (
              <span className="ml-2 font-mono text-ui-2xs text-ink-500">+{remaining} more</span>
            )}
            <div className="mt-1 font-mono text-ui-sm font-medium text-ink-50">{req.tool}</div>
          </div>
          <div className="font-mono text-ui-2xs tabular-nums text-ink-600">
            {new Date(req.ts).toLocaleTimeString([], { hour12: false })}
          </div>
        </div>

        {/* Body — shell-specific or generic */}
        {isShell && shellArgs ? (
          <div className="px-5 py-3 space-y-3">
            {shellArgs.description && (
              <div>
                <div className="font-mono text-ui-2xs uppercase text-ink-500 mb-1">intent</div>
                <div className="text-ui-sm text-ink-200">{shellArgs.description}</div>
              </div>
            )}
            {shellArgs.command && (
              <div>
                <div className="font-mono text-ui-2xs uppercase text-ink-500 mb-1">command</div>
                <pre className="max-h-[30vh] overflow-y-auto rounded-lg bg-ink-950 px-3 py-2 font-mono text-ui-xs leading-relaxed text-ink-100">
                  {shellArgs.command}
                </pre>
              </div>
            )}
            {shellArgs.workdir && shellArgs.workdir !== '.' && (
              <div>
                <div className="font-mono text-ui-2xs uppercase text-ink-500 mb-1">directory</div>
                <code className="text-ui-xs text-ink-300">{shellArgs.workdir}</code>
              </div>
            )}
          </div>
        ) : (
          <pre className="max-h-[40vh] overflow-y-auto px-5 py-3 font-mono text-ui-xs leading-relaxed text-ink-200">
            {argsPretty}
          </pre>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-ink-800/60 px-5 py-3">
          <button onClick={() => onDecide('deny')} className="btn-danger">deny</button>
          <button onClick={() => onDecide('approve_session')} className="btn-secondary">
            {isShell ? 'allow pattern' : 'allow this task'}
          </button>
          <button onClick={() => onDecide('approve')} className="btn-primary">approve once</button>
        </div>
      </div>
    </div>
  );
}
```

---

## Phase 8 — Cleanup & Migration

### 1. Delete `src/main/services/sandbox.ts`

This file is fully replaced by the `shell/` module. Remove it.

### 2. Update imports

Search for all imports of `sandbox.ts` and update them:
- `src/main/services/tools/shell.ts` — no longer imports from sandbox
- Any test files referencing sandbox

### 3. Update executor prompt

In `src/main/orchestrator/prompts.ts`, update the `EXECUTOR_SYSTEM` prompt:

```diff
- - Use \`run_shell\` for builds, linters, and other commands.
+ - Use \`run_shell\` for shell commands: builds, tests, linters, file operations, package management.
+   Provide a clear \`description\` explaining your intent. Read-only commands (ls, grep, git status)
+   run automatically; other commands require user approval.
```

### 4. Update `EnvironmentContext`

The `prompts.ts` already includes `shell: string | null` in `EnvironmentContext`.
Update the shell detection to use the same `resolveShell()` from `shell/env.ts`
so the LLM prompt and tool description are consistent.

### 5. Temp file cleanup on app startup

In `src/main/index.ts`, add:
```typescript
import { cleanupTruncationFiles } from './services/shell/truncate.js';
import { initShellTool } from './services/shell/index.js';

// After DB initialization:
cleanupTruncationFiles();
await initShellTool();
```

---

## File Inventory

### New Files (7)

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/main/services/shell/index.ts` | ~15 | Barrel export + `initShellTool()` |
| `src/main/services/shell/exec.ts` | ~120 | Core spawn + streaming + kill |
| `src/main/services/shell/parser.ts` | ~130 | Tree-sitter bash parsing |
| `src/main/services/shell/safety.ts` | ~180 | Tier classification |
| `src/main/services/shell/truncate.ts` | ~80 | Output truncation + temp files |
| `src/main/services/shell/env.ts` | ~80 | Shell resolution |
| `src/main/services/shell/description.ts` | ~60 | Dynamic tool description |

### Modified Files (6)

| File | Change |
|------|--------|
| `src/main/services/tools/shell.ts` | Rewrite: new schema, internal approval, delegates to shell/ |
| `src/main/services/approvals.ts` | Add pattern-based session approval for shell commands |
| `src/main/services/settings.ts` | Add `SHELL_PATH`, `SHELL_TIMEOUT` keys |
| `src/main/ipc/settings.ts` | Expose shell settings to frontend |
| `src/main/orchestrator/prompts.ts` | Update executor prompt for new shell tool |
| `src/renderer/src/pages/sessions/ApprovalModal.tsx` | Shell-specific approval display |

### Deleted Files (1)

| File | Reason |
|------|--------|
| `src/main/services/sandbox.ts` | Fully replaced by `shell/exec.ts` |

### New Dependency (1)

| Package | Version | Purpose |
|---------|---------|---------|
| `tree-sitter-bash` | `^0.23` | Bash grammar for command parsing |

---

## Testing Strategy

### Unit Tests

| Module | Test Cases |
|--------|-----------|
| `parser.ts` | Simple command, piped chain, `&&` chain, `\|\|` chain, semicolons, subshells, variable assignments, empty command, malformed command (fallback), redirections, quoted strings with special chars |
| `safety.ts` | Auto-approved commands, denied commands, conditional commands (git status vs git push, sed vs sed -i, find vs find -exec), mixed chains (safe && dangerous), unknown commands default to prompt |
| `truncate.ts` | Under limit (no truncation), over line limit, over byte limit, temp file creation, cleanup of old files |
| `env.ts` | Default shell resolution, configured shell, fallback chain, different shell args (bash, zsh, fish, pwsh) |
| `exec.ts` | Successful command, failed command (non-zero exit), timeout, abort signal, output streaming, large output truncation, ANSI stripping |

### Integration Tests

| Scenario | Steps |
|----------|-------|
| Safe command auto-runs | Call `run_shell({ command: 'echo hello' })` → no approval prompt, output = "hello" |
| Dangerous command blocked | Call `run_shell({ command: 'sudo rm -rf /' })` → immediate reject, no execution |
| Prompted command approved | Call with `npm install` → approval requested → approve → executes |
| Pattern approval | Approve `npm install` → subsequent `npm install foo` auto-approved |
| Chained command mixed | `ls && rm file` → ls auto-approved, rm needs prompt → whole command prompted |
| Timeout | Long-running command exceeds timeout → killed, partial output returned |
| Output truncation | Command producing > 50KB → truncated output + temp file path |
| Workdir validation | `workdir: '../../etc'` → rejected |

### Manual Testing Checklist

- [ ] LLM can run `npm install && npm test`
- [ ] LLM can run `grep -r "pattern" src/ | head -20`
- [ ] `git status` runs without approval prompt
- [ ] `rm -rf /` is immediately blocked
- [ ] `curl https://example.com` triggers approval
- [ ] Approving `npm install` pattern auto-approves `npm install express`
- [ ] Large build output is truncated with temp file link
- [ ] Shell respects user's `$SHELL` setting (nvm/pyenv work)
- [ ] Approval modal shows command + description for shell commands

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tree-sitter-bash fails to parse exotic syntax | Command falls through to prompt tier | Fallback regex parser ensures no command runs unclassified |
| Login shell mode hangs on interactive prompts | Spawn blocks forever | Timeout kills process; `stdin: 'ignore'` prevents interactive prompts |
| Full env leaks credentials to LLM output | LLM sees API keys in env output | Only affects `env`/`printenv` commands which are auto-approved but passive; LLM can already read `.env` files via `read_file` |
| User configures invalid shell path | Tool fails on every invocation | `resolveShell()` validates path exists, falls back to `/bin/bash` → `/bin/sh` |
| Pattern-based approval too broad | `npm *` approves `npm publish` | Pattern uses first 2 tokens (`npm install`), not just first (`npm`). `npm publish` requires separate approval |
| tree-sitter native module in Electron | Build/packaging issues | Already using tree-sitter for codesearch — same packaging pipeline works |
| Large temp files accumulate | Disk usage | 24-hour cleanup + cleanup on startup |

---

## Implementation Order

Recommended sequence (each phase is independently testable):

1. **Phase 1** — `shell/exec.ts` + `shell/env.ts` — get basic execution working
2. **Phase 2** — `shell/parser.ts` — add `tree-sitter-bash` dep, parse commands
3. **Phase 3** — `shell/safety.ts` — classify commands into tiers
4. **Phase 4** — `shell/truncate.ts` — output handling
5. **Phase 5** — `tools/shell.ts` rewrite — wire everything together
6. **Phase 6** — `shell/description.ts` + settings — dynamic description + config
7. **Phase 7** — Frontend — enhanced approval modal
8. **Phase 8** — Cleanup — delete sandbox.ts, update prompts, startup hooks

Total estimated new code: ~650 lines across 7 new files.
Total estimated modified code: ~100 lines across 6 existing files.
