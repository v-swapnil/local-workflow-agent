import { StateGraph, START, END } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { PLANNER_SYSTEM, EXECUTOR_SYSTEM } from './prompts.js';
import { StateAnnotation } from './state.js';
import { plannerNode, runPlannerNode } from './plannerNode.js';
import { executorNode, runExecutorNode } from './executorNode.js';
import type { AgentState } from './state.js';
import type { AgentRecord } from '@shared/schema.js';

export function buildGraph(agent?: AgentRecord | null) {
  if (!agent) {
    return new StateGraph(StateAnnotation)
      .addNode('planner', plannerNode)
      .addNode('executor', executorNode)
      .addEdge(START, 'planner')
      .addEdge('planner', 'executor')
      .addEdge('executor', END)
      .compile();
  }

  const plannerSys = [PLANNER_SYSTEM, '---', agent.systemPrompt].join('\n\n');
  const executorSys = [EXECUTOR_SYSTEM, '---', agent.systemPrompt].join('\n\n');
  const temp = agent.temperature;

  const plannerNodeWithAgent = (state: AgentState, config?: RunnableConfig) =>
    runPlannerNode(state, config, plannerSys, temp);

  const executorNodeWithAgent = (state: AgentState, config?: RunnableConfig) =>
    runExecutorNode(state, config, executorSys, temp);

  return new StateGraph(StateAnnotation)
    .addNode('planner', plannerNodeWithAgent)
    .addNode('executor', executorNodeWithAgent)
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addEdge('executor', END)
    .compile();
}
