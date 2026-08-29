import { Annotation } from '@langchain/langgraph';

export const WorkflowStateAnnotation = Annotation.Root({
  prompt: Annotation<string>(),
  /** Most recent agent node's output — becomes the next agent node's prompt. */
  result: Annotation<string>({ reducer: (_, next) => next, default: () => '' }),
});

export type WorkflowState = typeof WorkflowStateAnnotation.State;
