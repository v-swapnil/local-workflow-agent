import { StateGraph, START, END } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { PLANNER_SYSTEM, EXECUTOR_SYSTEM } from './prompts.js';
import { StateAnnotation } from './state.js';
import { plannerNode, runPlannerNode } from './plannerNode.js';
import { executorNode, runExecutorLoop } from './executorNode.js';
import { ctxOf } from './runCtx.js';
import type { AgentState } from './state.js';
import type { AgentRecord } from '../services/agents.js';

export type { RunCtx } from './runCtx.js';

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

  const plannerSys = `${agent.systemPrompt}\n\n---\n\n${PLANNER_SYSTEM}`;
  const executorSys = `${agent.systemPrompt}\n\n---\n\n${EXECUTOR_SYSTEM}`;
  const temp = agent.temperature;

  const plannerNodeWithAgent = (state: AgentState, config?: RunnableConfig) =>
    runPlannerNode(state, config, plannerSys, temp);

  const executorNodeWithAgent = async (
    state: AgentState,
    config?: RunnableConfig,
  ): Promise<Partial<AgentState>> => {
    const ctx = ctxOf(config);
    const newObs = await runExecutorLoop(ctx, executorSys, state, temp);
    return { history: newObs };
  };

  return new StateGraph(StateAnnotation)
    .addNode('planner', plannerNodeWithAgent)
    .addNode('executor', executorNodeWithAgent)
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addEdge('executor', END)
    .compile();
}
