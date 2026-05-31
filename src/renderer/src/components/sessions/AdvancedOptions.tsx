import { trpc } from '../../trpc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';
import { Label } from '../ui/label';

interface Props {
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
}: Props) {
  const { data: modelsData } = trpc.llm.ollamaModels.useQuery();
  const { data: agents = [] } = trpc.agent.list.useQuery();
  const { data: workflowsData = [] } = trpc.workflow.list.useQuery();

  const models = modelsData ?? [];
  const workflows = workflowsData as { id: string; name: string }[];

  const selectClass =
    'font-mono text-ui-xs';

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="options" className="border-none">
        <AccordionTrigger className="justify-start gap-1.5 py-0 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500 hover:text-ink-300 hover:no-underline [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-ink-500">
          options
        </AccordionTrigger>
        <AccordionContent className="pb-0 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <Label className="flex flex-col gap-1">
              <span className="font-mono text-ui-2xs text-ink-500">model</span>
              <Select
                value={modelOverride || '__none__'}
                onValueChange={(v) => onModelOverride(v === '__none__' ? '' : v)}
              >
                <SelectTrigger className={selectClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— default —</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>

            <Label className="flex flex-col gap-1">
              <span className="font-mono text-ui-2xs text-ink-500">agent</span>
              <Select
                value={agentId || '__none__'}
                onValueChange={(v) => {
                  const val = v === '__none__' ? '' : v;
                  onAgentId(val);
                  if (val) onWorkflowId('');
                }}
              >
                <SelectTrigger className={selectClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>

            <Label className="flex flex-col gap-1">
              <span className="font-mono text-ui-2xs text-ink-500">workflow</span>
              <Select
                value={workflowId || '__none__'}
                onValueChange={(v) => {
                  const val = v === '__none__' ? '' : v;
                  onWorkflowId(val);
                  if (val) onAgentId('');
                }}
              >
                <SelectTrigger className={selectClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
