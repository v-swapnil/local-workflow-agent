import { cn } from '@renderer/lib/utils';
import { trpc } from '../../trpc';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface AdvancedOptionsProps {
  modelOverride: string;
  agentId: string;
  workflowId: string;
  onModelOverride: (v: string) => void;
  onAgentId: (v: string) => void;
  onWorkflowId: (v: string) => void;
}

export function AdvancedOptions({
  modelOverride,
  agentId,
  workflowId,
  onModelOverride,
  onAgentId,
  onWorkflowId,
}: AdvancedOptionsProps) {
  const { data: modelsData } = trpc.llm.ollamaModels.useQuery();
  const { data: agents = [] } = trpc.agent.list.useQuery();
  const { data: workflowsData = [] } = trpc.workflow.list.useQuery();

  const models = modelsData ?? [];
  const workflows = workflowsData ?? [];

  const selectClass =
    'h-7 border-0 bg-transparent px-2 font-mono text-ui-xs text-left text-ink-300 shadow-none hover:bg-ink-800/40 focus:border-0 focus:ring-0';

  const handleModelChange = (value: string) => {
    onModelOverride(value === 'SYSTEM' ? '' : value);
  };

  const handleAgentOrWorkflowChange = (value: string) => {
    if (value === 'SYSTEM') {
      onAgentId('');
      onWorkflowId('');
      return;
    }

    const isAgent = agents.find((item) => String(item.id) === value);
    const isWorkflow = workflows.find((item) => String(item.id) === value);

    if (isAgent) {
      onAgentId(value);
      onWorkflowId('');
    } else if (isWorkflow) {
      onWorkflowId(value);
      onAgentId('');
    }
  };

  return (
    <div className="flex gap-1.5">
      <Select value={modelOverride || 'SYSTEM'} onValueChange={handleModelChange}>
        <SelectTrigger className={cn(selectClass, 'w-[100px]')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Models</SelectLabel>
            <SelectItem value="SYSTEM">System</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.name} value={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select value={workflowId || agentId || 'SYSTEM'} onValueChange={handleAgentOrWorkflowChange}>
        <SelectTrigger className={cn(selectClass, 'w-[150px]')}>
          <SelectValue placeholder="System" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Agents</SelectLabel>
            <SelectItem value="SYSTEM">System</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name} ({agent.role})
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Workflows</SelectLabel>
            {workflows.map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflow.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
