import { AnalysisContext, AnalysisTemplate, StepResult, AnomalyRecord, OpportunityRecord } from './types';
import { drugMarketShareTemplate, generalDrillDownTemplate } from './templates';

export class AnalysisStateManager {
  private contexts: Map<string, AnalysisContext> = new Map();

  createContext(sessionId: string, question: string, template?: AnalysisTemplate): AnalysisContext {
    const context: AnalysisContext = {
      question,
      currentStepIndex: 0,
      steps: template?.steps || [],
      results: new Map(),
      anomalies: [],
      opportunities: [],
      recommendations: [],
      drillDownPath: [],
      metadata: {
        templateName: template?.name,
        templateId: template?.id,
        createdAt: new Date().toISOString()
      }
    };
    
    if (template) {
      context.templateId = template.id;
    }
    
    this.contexts.set(sessionId, context);
    return context;
  }

  getContext(sessionId: string): AnalysisContext | undefined {
    return this.contexts.get(sessionId);
  }

  updateContext(sessionId: string, updates: Partial<AnalysisContext>): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      Object.assign(context, updates);
    }
  }

  addStepResult(sessionId: string, result: StepResult): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.results.set(result.stepId, result);
      
      if (result.anomalies) {
        context.anomalies.push(...result.anomalies);
      }
      
      context.currentStepIndex++;
    }
  }

  addAnomaly(sessionId: string, anomaly: AnomalyRecord): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.anomalies.push(anomaly);
    }
  }

  addOpportunity(sessionId: string, opportunity: OpportunityRecord): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.opportunities.push(opportunity);
    }
  }

  addRecommendation(sessionId: string, recommendation: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.recommendations.push(recommendation);
    }
  }

  addToDrillDownPath(sessionId: string, value: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.drillDownPath.push(value);
    }
  }

  isComplete(sessionId: string): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return true;
    return context.currentStepIndex >= context.steps.length;
  }

  getNextStep(sessionId: string) {
    const context = this.contexts.get(sessionId);
    if (!context || context.currentStepIndex >= context.steps.length) {
      return null;
    }
    return context.steps[context.currentStepIndex];
  }

  getAllResults(sessionId: string): StepResult[] {
    const context = this.contexts.get(sessionId);
    if (!context) return [];
    return Array.from(context.results.values());
  }

  clearContext(sessionId: string): void {
    this.contexts.delete(sessionId);
  }

  hasActiveContext(sessionId: string): boolean {
    return this.contexts.has(sessionId);
  }
}

export class TemplateRegistry {
  private templates: Map<string, AnalysisTemplate> = new Map();

  constructor() {
    this.register(drugMarketShareTemplate);
    this.register(generalDrillDownTemplate);
  }

  register(template: AnalysisTemplate): void {
    this.templates.set(template.id, template);
  }

  get(id: string): AnalysisTemplate | undefined {
    return this.templates.get(id);
  }

  findByKeyword(keyword: string): AnalysisTemplate | null {
    const lowerKeyword = keyword.toLowerCase();
    for (const template of this.templates.values()) {
      for (const kw of template.keywords) {
        if (lowerKeyword.includes(kw) || kw.includes(lowerKeyword)) {
          return template;
        }
      }
    }
    return null;
  }

  findTemplateByQuestion(question: string): AnalysisTemplate | null {
    const lowerQuestion = question.toLowerCase();
    
    for (const template of this.templates.values()) {
      for (const keyword of template.keywords) {
        if (lowerQuestion.includes(keyword)) {
          return template;
        }
      }
    }
    
    return null;
  }

  getAll(): AnalysisTemplate[] {
    return Array.from(this.templates.values());
  }
}

export const templateRegistry = new TemplateRegistry();
export const analysisStateManager = new AnalysisStateManager();
