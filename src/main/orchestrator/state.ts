import type { Observation } from '@shared/agent';

import { Annotation } from '@langchain/langgraph';

export const StateAnnotation = Annotation.Root({
  prompt: Annotation<string>(),
  history: Annotation<Observation[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});

export type AgentState = typeof StateAnnotation.State;
