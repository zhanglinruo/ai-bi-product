export interface AnalysisStep {
  stepId: string;
  stepName: string;
  description: string;
  sql: string;
  analyzePrompt?: string;
  drillDown?: {
    dimension: string;
    condition: string;
    targetField: string;
    anomalyThreshold?: number;
    topN?: number;
  };
}

export interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  steps: AnalysisStep[];
  finalAnalyzePrompt?: string;
  outputFormat?: {
    includeSummary: boolean;
    includeOpportunities: boolean;
    includeRecommendations: boolean;
  };
}

export interface AnalysisContext {
  templateId?: string;
  question: string;
  currentStepIndex: number;
  steps: AnalysisStep[];
  results: Map<string, any>;
  anomalies: AnomalyRecord[];
  opportunities: OpportunityRecord[];
  recommendations: string[];
  drillDownPath: string[];
  metadata: Record<string, any>;
}

export interface AnomalyRecord {
  stepId: string;
  dimension: string;
  field: string;
  value: string;
  metric: string;
  metricValue: number;
  description: string;
}

export interface OpportunityRecord {
  stepId: string;
  dimension: string;
  target: string;
  currentValue: number;
  potentialValue: number;
  description: string;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  data: any[];
  summary?: string;
  anomalies?: AnomalyRecord[];
  nextSteps?: string[];
  error?: string;
}
