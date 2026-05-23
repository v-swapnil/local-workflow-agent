# Implementation Plan: Native Multi-Turn Tool Conversations

**Status**: Draft — Awaiting Review  
**Date**: 2025-05-23  
**Scope**: Replace prompt-stuffing pattern with native multi-turn tool-use messages across all agent loops

---

## 1. Problem Statement

ASE currently uses a **prompt-stuffing** pattern: every LLM call rebuilds the entire prompt from scratch, embedding all prior tool results as plain text inside a single `user` message. This has several consequences:

1. **No native tool protocol** — `ChatRole` is `'system' | 'user' | 'assistant'` only; no `tool` role exists. The Ollama API natively supports `role: "tool"` messages but ASE never uses them.
2. **No conversation history** — `llmWithTools()` in `graph.ts` creates fresh `[system, user]` messages each iteration. The LLM has no memory of its own prior reasoning or tool-call decisions.
3. **Unbounded prompt growth** — `executorUser()` in `prompts.ts` concatenates ALL observations as text with no truncation. Large tool outputs (file reads, grep results) inflate the prompt until it exceeds the context window.
4. **Lost tool-use reinforcement** — Without seeing its own `assistant` messages with `tool_calls` followed by `tool` result messages, the model loses the feedback loop that guides coherent multi-step reasoning.
5. **No prompt caching** — Rebuilding the entire prompt each turn means providers that support prefix caching (Ollama KV cache, Anthropic prompt caching) get zero benefit.

### Impact on Each Runner

| Runner | File | Current Behavior | Issue |
|--------|------|-----------------|-------|
| **Graph executor** | `graph.ts:350-390` | Calls `llmWithTools()` with fresh `executorUser()` each iteration | Prompt-stuffing; no history |
| **Graph planner** | `graph.ts:300-340` | Same pattern with `plannerUser()` | Same; planner can't see its own exploration |
| **Direct runner** | `direct-runner.ts:80-180` | Maintains `messages[]` array, appends assistant + user messages | Closest to multi-turn BUT uses `role: 'user'` for tool results instead of `role: 'tool'` |
| **Copilot runner** | `copilot-runner.ts` | Single-shot prompt via Copilot SDK | SDK limitation; out of scope |

---

## 2. Current Architecture (What Changes)

### 2.1 Provider Types (`src/main/services/llm/provider.ts`)

```typescript
// CURRENT — no tool role, no tool_call IDs, flat string content
export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }
export interface ToolCallResult { name: string; arguments: Record<string, unknown>; }
export interface ChatResult {
  content: string;
  toolCalls?: ToolCallResult[];
  // ...
}
```

**Problems**:
- `ChatMessage` cannot represent `role: "tool"` messages
- `ToolCallResult` has no `id` field (needed to correlate tool results with specific calls)
- `ChatMessage.content` is always a string; cannot represent structured tool content
- `ChatResult.toolCalls` returns calls but the caller has no way to reference them back

### 2.2 Ollama Provider (`src/main/services/llm/ollama.ts`)

The Ollama JS client already accepts messages with `role: "tool"`. Currently we pass `opts.messages` directly to `ol.chat()`, so if we fix the types the Ollama provider needs minimal changes — mainly ensuring `tool_calls` on assistant messages and `tool_name` on tool messages are forwarded.

### 2.3 Graph Executor Loop (`src/main/orchestrator/graph.ts:350-390`)

```typescript
// CURRENT — rebuilds full prompt each iteration
while (budget-- > 0) {
  const histForLLM = state.history.concat(newObs);
  const response = await llmWithTools(
    ctx, 'executor', EXECUTOR_SYSTEM,
    executorUser(state.prompt, plan, histForLLM, env, ctx.sessionMemory),
  );
  // ...
}
```

`llmWithTools()` creates `[{ role: 'system', ... }, { role: 'user', ... }]` — two messages, no history.

### 2.4 Direct Runner (`src/main/orchestrator/direct-runner.ts:80-180`)

```typescript
// CURRENT — maintains messages but uses wrong role for tool results
messages.push({ role: 'assistant', content: text });
// ...
messages.push({
  role: 'user',  // ← should be 'tool'
  content: `[tool: ${toolName}] ${JSON.stringify(toolResult.output)}`,
});
```

---

## 3. Target Architecture

### Design Principles
1. **Native tool messages** — Use `role: "tool"` messages with proper `tool_call_id` correlation
2. **Append-only conversation** — Build message history incrementally; never rebuild from scratch
3. **Provider-agnostic** — The message format is defined at the provider interface level; each provider maps it to its wire format
4. **Truncation at boundaries** — When context is tight, drop old tool result *content* (keep the call/response skeleton) rather than dropping entire turns
5. **No AI SDK dependency** — Ollama client already supports native tool protocol; keep the stack lean. AI SDK can be evaluated later for multi-provider support.

### 3.1 New Message Types

```typescript
// New ChatRole with 'tool' added
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

// Tool call with unique ID (generated by provider or by us)
export interface ToolCall {
  id: string;           // unique ID for correlation (e.g. "call_abc123")
  name: string;
  arguments: Record<string, unknown>;
}

// Messages are now a discriminated union
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

// ChatResult returns ToolCall[] (with IDs) instead of ToolCallResult[]
export interface ChatResult {
  content: string;
  thinking?: string;
  model: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens?: number; completionTokens?: number; totalDurationMs?: number };
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'error';
}
```

### 3.2 Conversation History Manager

New utility: `src/main/orchestrator/conversation.ts`

Responsibilities:
- Maintain an ordered array of `ChatMessage[]`
- Append assistant messages (with tool_calls) after LLM response
- Append tool result messages after execution
- **Truncation**: when estimated token count exceeds a threshold, compress old tool results (replace content with `"[output truncated — N chars]"`) working from oldest to newest
- Expose `getMessages()` that returns the full array for the provider

```typescript
export class Conversation {
  private messages: ChatMessage[] = [];
  private readonly maxTokenEstimate: number; // e.g. 28000 for 32k context

  constructor(opts: { system: string; maxTokens?: number });

  /** Add the initial user message (goal + env context). */
  addUserMessage(content: string): void;

  /** Record LLM response — stores assistant message with optional tool_calls. */
  addAssistantMessage(content: string, toolCalls?: ToolCall[]): void;

  /** Record a tool execution result. */
  addToolResult(toolCallId: string, name: string, content: string): void;

  /** Get all messages, applying truncation if needed. */
  getMessages(): ChatMessage[];

  /** Rough char-based token estimate for the entire conversation. */
  estimateTokens(): number;
}
```

Token estimation: use `chars / 4` as a rough heuristic (no need for a tokenizer dependency). The truncation threshold should be configurable per-model (e.g., 28k for 32k models, 120k for 128k models).

### 3.3 Ollama Provider Changes

The `ollama` npm package's `ChatRequest` already accepts messages with `role: 'tool'`. Changes needed:

1. **Map outgoing messages**: Convert our `ChatMessage` union to Ollama's message format:
   - `assistant` messages: include `tool_calls` array when present
   - `tool` messages: set `role: 'tool'`, `content`, and Ollama-specific field

2. **Map incoming responses**: Extract `tool_calls` from the streamed response, generate `id` for each call (Ollama doesn't provide IDs — we generate `call_${nanoid(8)}`)

3. **Return `finishReason`**: Map Ollama's response to detect tool_calls vs stop

### 3.4 Graph Executor Refactor

**Before**: `llmWithTools()` is a stateless function that creates fresh messages.  
**After**: The executor loop owns a `Conversation` instance and appends incrementally.

```
Iteration 1:
  messages = [system, user]
  → LLM returns assistant{toolCalls: [{id: "c1", name: "read_file", ...}]}
  → append assistant message
  → execute tool → append tool{toolCallId: "c1", content: "..."}

Iteration 2:
  messages = [system, user, assistant+toolCalls, tool_result]
  → LLM sees full history, returns next tool call
  → append, execute, append...

Iteration N:
  → LLM returns assistant{content: '{"done": true}', toolCalls: undefined}
  → done
```

Key changes to `graph.ts`:
- Replace `llmWithTools()` with a new `llmChat()` that takes `ChatMessage[]` directly
- Executor loop creates `Conversation` at start, appends after each turn
- Planner loop does the same (shorter budget, read-only tools)
- Remove `executorUser()` history formatting (no more observations-as-text)
- Keep `executorUser()` only for the INITIAL user message (goal + plan + env context)

### 3.5 Direct Runner Refactor

The direct runner already maintains `messages[]`. Changes:
- Use new `ChatMessage` union types  
- Replace `role: 'user'` tool results with `role: 'tool'` messages
- Add assistant `toolCalls` to the assistant message
- Optionally wrap in `Conversation` for truncation

### 3.6 Prompt Changes

`executorUser()` in `prompts.ts` currently includes the `OBSERVATIONS:` section with all history. After this change:

- The initial user message includes: GOAL, SESSION MEMORY, ENV CONTEXT, PLAN — but **NO** observations
- Observations are represented as native tool messages in the conversation history
- Remove the `history: Observation[]` parameter from `executorUser()`

Similarly for `plannerUser()` — though the planner currently doesn't pass observations (it rebuilds the prompt). After this change, the planner loop also appends tool results natively.

---

## 4. Implementation Steps

### Phase 1: Provider Types & Ollama (Low Risk)

**Step 1.1** — Update `ChatRole` and `ChatMessage` types in `provider.ts`
- File: `src/main/services/llm/provider.ts`
- Add `'tool'` to `ChatRole`
- Change `ChatMessage` to discriminated union (system | user | assistant | tool)
- Add `ToolCall` interface with `id` field  
- Rename `ToolCallResult` → keep as alias for backward compat, but new code uses `ToolCall`
- Add `finishReason` to `ChatResult`
- Update `ChatResult.toolCalls` to use `ToolCall[]`

**Step 1.2** — Update Ollama provider to handle new message types
- File: `src/main/services/llm/ollama.ts`
- Map `ChatMessage` union → Ollama message format in `chat()` method
- Generate `id` for each tool call from the response (Ollama doesn't provide them)
- Parse `finishReason` from response  
- Add `import { nanoid } from 'nanoid'` for ID generation

**Step 1.3** — Update Copilot provider (minimal)
- File: `src/main/services/llm/copilot-provider.ts`
- Update `toPrompt()` to handle the new union types (add case for `tool` messages → format as text)
- This keeps Copilot working as-is (prompt-stuffing) since the SDK doesn't support multi-turn

**Step 1.4** — Fix all type errors from the `ChatMessage` change
- Files: `graph.ts`, `direct-runner.ts`, `ipc/llm.ts`, `ipc/agent.ts` — anywhere `ChatMessage` is constructed
- Ensure all existing message constructions are compatible with the new union

### Phase 2: Conversation Manager (New Code)

**Step 2.1** — Create `Conversation` class
- New file: `src/main/orchestrator/conversation.ts`
- Implements append-only message list with system message set at construction
- `addUserMessage()`, `addAssistantMessage()`, `addToolResult()`
- `getMessages()` returns the full array
- `estimateTokens()` — chars / 4 heuristic

**Step 2.2** — Add truncation logic
- In `Conversation.getMessages()`: if `estimateTokens() > maxTokenEstimate`, iterate tool messages from oldest to newest and replace content with `"[truncated: {N} chars]"` until under budget
- Never truncate the system message, the initial user message, or the last 2 turns
- Track which messages have been truncated (avoid re-scanning)

### Phase 3: Executor Multi-Turn (Core Change)

**Step 3.1** — Refactor `executorUser()` in `prompts.ts`
- Remove the `history: Observation[]` parameter
- Remove the `OBSERVATIONS:` section from the formatted output
- The function now returns only: GOAL + SESSION MEMORY + ENV CONTEXT + PLAN
- Keep the function signature change backward-compatible by making `history` optional with deprecation

**Step 3.2** — Replace `llmWithTools()` with `llmChat()` in `graph.ts`
- New function signature: `llmChat(ctx, agent, messages, temperature?, toolsDef?)` 
- Takes `ChatMessage[]` directly instead of building them internally
- Returns same `ToolCallResponse | DoneResponse` but `ToolCallResponse.toolCalls` uses `ToolCall[]` with IDs
- Keeps the event emission (llm.delta, llm.thinking_delta) and JSON fallback parsing

**Step 3.3** — Refactor executor loop in `graph.ts`
- Create `Conversation` at start of `executorNode()` / `executorNodeWithAgent()`
- Build initial user message with `executorUser(goal, plan, env, memory)` (no history)
- Loop: call `llmChat(ctx, agent, conversation.getMessages())` → append assistant → execute tools → append tool results → repeat
- Remove `Observation[]` accumulation (the conversation IS the history now)
- Keep emitting step events as before

**Step 3.4** — Refactor planner loop in `graph.ts`
- Same pattern: create `Conversation`, append read-only tool results as `role: 'tool'` messages
- Planner initial user message: `plannerUser(prompt, env, memory)` (unchanged)

**Step 3.5** — Update `AgentState` in `state.ts`
- `history: Observation[]` is still useful for persistence/UI display. Keep it, but it's now derived FROM the conversation rather than being the source of truth for the LLM prompt.
- Add optional `conversationMessages?: ChatMessage[]` to state if we want to persist the full conversation for debugging.

### Phase 4: Direct Runner Multi-Turn (Targeted Fix)

**Step 4.1** — Update direct runner to use native tool messages
- File: `src/main/orchestrator/direct-runner.ts`
- Change `messages` array to use new `ChatMessage` union
- After LLM response: `messages.push({ role: 'assistant', content: text, toolCalls: [...] })`
- After tool execution: `messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: output })`
- Remove the `role: 'user', content: '[tool: xxx] ...'` pattern
- Optionally wrap in `Conversation` for truncation

### Phase 5: Cleanup & Testing

**Step 5.1** — Remove dead code
- Remove `ToolCallResult` type if fully replaced by `ToolCall` (or keep as re-export)
- Remove observations-as-text formatting from `executorUser()` 
- Clean up unused imports

**Step 5.2** — Update IPC callers
- `src/main/ipc/llm.ts` — chat endpoint constructs `ChatMessage[]`; ensure it handles the union
- `src/main/ipc/agent.ts` — same

**Step 5.3** — Manual testing checklist
- [ ] Single tool call (read_file) → verify tool result sent as `role: 'tool'`
- [ ] Multi-step task → verify conversation grows with proper assistant+tool pairs
- [ ] Large file read → verify truncation kicks in after N turns
- [ ] Planner exploration → verify read-only tools work with multi-turn
- [ ] Direct agent → verify tool results use `role: 'tool'`
- [ ] Copilot provider → verify it still works (graceful degradation)
- [ ] JSON fallback → verify models without tool support still work via text parsing
- [ ] Abort/cancel → verify cleanup

---

## 5. File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `src/main/services/llm/provider.ts` | **Modify** | Add `tool` role, `ToolCall` type, discriminated union `ChatMessage`, `finishReason` |
| `src/main/services/llm/ollama.ts` | **Modify** | Map new message types to/from Ollama wire format, generate tool call IDs |
| `src/main/services/llm/copilot-provider.ts` | **Modify** | Handle `tool` messages in `toPrompt()` fallback |
| `src/main/orchestrator/conversation.ts` | **Create** | Conversation history manager with truncation |
| `src/main/orchestrator/prompts.ts` | **Modify** | Remove `history` param from `executorUser()` |
| `src/main/orchestrator/graph.ts` | **Modify** | Replace `llmWithTools()` with `llmChat()`, use `Conversation` in executor + planner loops |
| `src/main/orchestrator/state.ts` | **Modify** | Keep `history: Observation[]` for persistence; state shape unchanged |
| `src/main/orchestrator/direct-runner.ts` | **Modify** | Use `role: 'tool'` messages, add `toolCalls` to assistant messages |
| `src/main/ipc/llm.ts` | **Modify** | Adapt to new `ChatMessage` union type |
| `src/main/ipc/agent.ts` | **Modify** | Adapt to new `ChatMessage` union type |
| `src/shared/agent.ts` | **No change** | `Observation` type stays for UI/persistence |

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Ollama models vary in tool-call quality | Some models may not follow multi-turn correctly | Keep JSON text fallback in `llmChat()` for models that respond with text instead of tool calls |
| Context window overflow | Large conversations may exceed model limits | `Conversation` truncation compresses old tool outputs first; add per-model context limits |
| Breaking Copilot provider | Copilot SDK doesn't support multi-turn | Graceful fallback: `toPrompt()` renders tool messages as text, behavior unchanged |
| Type migration across IPC boundary | `ChatMessage` union change may break serialization | SuperJSON (already used) handles discriminated unions; verify with IPC tests |
| LangGraph state serialization | `Conversation` instances don't serialize | Don't put `Conversation` in LangGraph state; only the derived `Observation[]` goes in state |

---

## 7. Future Considerations (Out of Scope)

These are NOT part of this implementation but become easier after it:

- **AI SDK adoption** — Once we have proper `ChatMessage` types, migrating to Vercel AI SDK's `generateText()`/`streamText()` becomes a provider-level swap
- **Doom-loop detection** — With conversation history, we can detect repeated identical tool calls
- **Token tracking** — `ChatResult.usage` is already captured; persist per-turn for cost tracking
- **Compaction** — Replace truncation with LLM-powered summarization of old turns
- **Streaming tool calls** — Stream tool call arguments as they arrive (Ollama supports this)

---

## 8. Dependency Analysis

**No new npm dependencies required.**

- `nanoid` — already in `package.json` (used for ID generation)
- `ollama` — already in `package.json` (client already supports tool messages)
- No AI SDK needed for this phase

---

## 9. Execution Order

```
Phase 1 (Types + Providers)  →  Phase 2 (Conversation)  →  Phase 3 (Executor)  →  Phase 4 (Direct)  →  Phase 5 (Cleanup)
       ~1 session                   ~1 session                 ~1 session              ~0.5 session          ~0.5 session
```

Phases 1-2 can be done without changing runtime behavior (additive). Phase 3 is the core breaking change. Phase 4 is isolated to one file. Phase 5 is cleanup.

Each phase should be tested independently before moving to the next.
