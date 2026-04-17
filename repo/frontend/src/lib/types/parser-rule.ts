export type ParserSourceType = 'html' | 'json';
export type ParserRuleStatus = 'draft' | 'canary_ready' | 'canary_running' | 'canary_passed' | 'canary_failed' | 'active' | 'archived';
export type SelectorType = 'css' | 'xpath' | 'jsonpath';

export interface ParsingRuleSet {
  id: string;
  profileId: string;
  name: string;
  sourceType: ParserSourceType;
  ruleVersion: number;
  status: ParserRuleStatus;
  selectors: RuleSelector[];
  fieldMappings: FieldMapping[];
  createdAt: number;
  updatedAt: number;
  lastCanaryRunId: string | null;
}

export interface RuleSelector {
  selectorType: SelectorType;
  expression: string;
  description: string;
}

export interface FieldMapping {
  sourceSelector: string;
  targetField: string;
  transform?: string;
}

export interface ParsingCanaryRun {
  id: string;
  ruleSetId: string;
  sampleSize: number;
  status: 'running' | 'passed' | 'failed';
  passCount: number;
  failCount: number;
  startedAt: number;
  completedAt: number | null;
  resultsSummary: CanaryResultItem[];
  jobId: string;
}

export interface CanaryResultItem {
  sampleIndex: number;
  passed: boolean;
  extractedFields: Record<string, string>;
  errors: string[];
}

export interface ParserRuleVersion {
  id: string;
  ruleSetId: string;
  version: number;
  selectors: RuleSelector[];
  fieldMappings: FieldMapping[];
  createdAt: number;
}
