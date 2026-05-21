import { Annotation } from '@langchain/langgraph';
import type { Observation, TestReport } from '@shared/agent';

export const WorkflowStateAnnotation = Annotation.Root({
  prompt: Annotation<string>(),
  currentNodeId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  history: Annotation<Observation[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  agentOutputs: Annotation<Record<string, unknown>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  testReport: Annotation<TestReport | null>({ reducer: (_, n) => n, default: () => null }),
  iteration: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  loopCounts: Annotation<Record<string, number>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
});

export type WorkflowState = typeof WorkflowStateAnnotation.State;
