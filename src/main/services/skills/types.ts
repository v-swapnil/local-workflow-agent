import { SkillRecord } from '@shared/schema';

export interface SkillDetails extends SkillRecord {
  whenToUse: string;
  allowedTools: string[];
  body: string;
  source: string;
}
