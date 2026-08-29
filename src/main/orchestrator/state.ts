import { Annotation } from '@langchain/langgraph';

export const StateAnnotation = Annotation.Root({
  prompt: Annotation<string>(),
  /** Final assistant text for this agent run — threaded to the next workflow node as its prompt. */
  result: Annotation<string>({ reducer: (_, next) => next, default: () => '' }),
});

export type AgentState = typeof StateAnnotation.State;
