import type { Plan, Observation, TestReport, Verdict } from '@shared/agent';

/* ───────── State ───────── */

import { Annotation, MessagesValue, StateSchema } from '@langchain/langgraph';

export const StateSc = new StateSchema({
  messages: MessagesValue,
});

export const StateAnnotation = Annotation.Root({
  prompt: Annotation<string>(),
  plan: Annotation<Plan | null>({ reducer: (_, n) => n, default: () => null }),
  history: Annotation<Observation[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  iteration: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  maxIterations: Annotation<number>({ reducer: (_, n) => n, default: () => 6 }),
  testsConfigured: Annotation<boolean>({ reducer: (_, n) => n, default: () => false }),
  testReport: Annotation<TestReport | null>({
    reducer: (_, n) => n,
    default: () => null,
  }),
  verdict: Annotation<Verdict | null>({ reducer: (_, n) => n, default: () => null }),
});

export type AgentState = typeof StateAnnotation.State;
