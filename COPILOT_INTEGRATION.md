# Copilot CLI Integration — Implementation Plan

## Overview

ASE supports two execution modes for running tasks:

1. **Ollama mode** (default) — Local LLM via Ollama + ASE's LangGraph agent loop
   (planner → executor → tester → critic)
2. **Copilot mode** — GitHub Copilot CLI via `@github/copilot-sdk`, using Copilot's
   built-in agentic runtime (GPT-5, Claude Sonnet 4.5, etc.)

The user selects the active provider in Settings. The task runner dispatches
accordingly.

## Architecture

```
Settings: provider = "ollama" | "copilot"

                    ┌─────────────────────┐
   runTask(id) ────►│    runner.ts         │
                    │  reads provider      │
                    └──────┬──────┬────────┘
                           │      │
              provider     │      │   provider
              == ollama    │      │   == copilot
                           ▼      ▼
                    ┌──────────┐ ┌──────────────────┐
                    │ graph.ts │ │ copilot-runner.ts │
                    │ LangGraph│ │ @github/copilot-  │
                    │ Planner  │ │ sdk session       │
                    │ Executor │ │                   │
                    │ Tester   │ │ plan mode +       │
                    │ Critic   │ │ agent execution   │
                    └──────────┘ └──────────────────┘
                        │                │
                        ▼                ▼
                    ┌──────────┐ ┌──────────────────┐
                    │ Ollama   │ │ Copilot CLI       │
                    │ (local)  │ │ (headless server) │
                    └──────────┘ └──────────────────┘
```

## Provider Setting

- `SETTING_KEYS.ACTIVE_PROVIDER` — `"ollama"` (default) or `"copilot"`
- `SETTING_KEYS.COPILOT_MODEL` — model for Copilot sessions (default: `"claude-sonnet-4.5"`)
- Stored in SQLite settings table, switchable from UI

## Copilot Mode Details

### CopilotService (`src/main/services/llm/copilot.ts`)

- Wraps `CopilotClient` from `@github/copilot-sdk`
- Singleton lifecycle: starts on first use, stops on app quit
- Auth: `GH_TOKEN` / `GITHUB_TOKEN` env, or Copilot CLI's stored OAuth
- `ping()` — `client.ping()`
- `listModels()` — hardcoded known list (SDK doesn't enumerate hosted models)

### CopilotRunner (`src/main/orchestrator/copilot-runner.ts`)

- Creates a Copilot session per task:
  - `cwd` = workspace path (Copilot tools operate in that directory)
  - `model` from settings
  - `systemMessage` with ASE skill instructions
  - `onPermissionRequest` bridges to ASE's approval system
  - `streaming: true` for live events
- Sends task prompt via `session.sendAndWait()`
- Maps SDK events → ASE taskBus events:
  - `assistant.message_delta` → `llm.delta`
  - `tool.execution_start` → `step.started`
  - `tool.execution_complete` → `step.finished`
  - `session.idle` → `task.finished`
- Copilot's built-in tools (edit_file, shell, etc.) handle file ops directly
- After completion: git auto-commit if enabled, finalize task result

### Runner Dispatch (`src/main/orchestrator/runner.ts`)

```ts
const provider = (await getSetting(SETTING_KEYS.ACTIVE_PROVIDER)) ?? 'ollama';
if (provider === 'copilot') {
  return await runTaskViaCopilot(taskId, session, ctrl);
} else {
  // existing LangGraph flow
}
```

## Files Changed

| Action | File | Description |
|--------|------|-------------|
| Create | `src/main/services/llm/copilot.ts` | CopilotService singleton |
| Create | `src/main/orchestrator/copilot-runner.ts` | Task execution via Copilot SDK |
| Modify | `src/main/services/llm/index.ts` | Add copilot to provider registry |
| Modify | `src/main/services/settings.ts` | Add ACTIVE_PROVIDER, COPILOT_MODEL |
| Modify | `src/shared/constants.ts` | Add DEFAULT_COPILOT_MODEL |
| Modify | `src/main/orchestrator/runner.ts` | Dispatch by provider |
| Modify | `src/main/ipc/llm.ts` | Provider-aware health/models |
| Modify | `src/main/ipc/settings.ts` | Provider get/set endpoints |
| Modify | `src/main/index.ts` | Cleanup CopilotService on quit |

## Phases

### Phase 1 — Foundation
- Install `@github/copilot-sdk`
- CopilotService + provider registry
- Settings keys

### Phase 2 — Runner
- copilot-runner.ts with event bridging
- Runner dispatch

### Phase 3 — IPC + UI
- Provider-aware health/models/settings endpoints
- Settings page provider toggle
- Model picker for Copilot models

### Phase 4 — Polish
- Graceful fallback if Copilot CLI missing
- Cleanup on app quit
- Error handling for auth failures
