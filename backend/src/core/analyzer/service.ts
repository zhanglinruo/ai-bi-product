import { AnalysisContext, AnalysisTemplate, StepResult, AnomalyRecord, OpportunityRecord } from './types';
import { templateRegistry, analysisStateManager } from './state';
import { semanticService, sqlValidator } from '../semantic';
import { globalToolRegistry } from '../tool';
import { ToolExecutionContext } from '../tool/types';
import { query } from '../../config/database';
import { sendProgress } from '../../modules/progress/routes';

function sendAnalyzerProgress(sessionId: string, step: number, totalSteps: number, stepName: string, message: string) {
  try {
    sendProgress(sessionId, { 
      step: 'analysis', 
      message, 
      data: { currentStep: step, totalSteps, stepName },
      timestamp: Date.now() 
    });
  } catch (e) {
    console.error('[Analyzer] 进度推送失败', e);
  }
}

function cleanSQL(sql: string): string {
  let cleaned = sql
    .replace(/```sql\n?/gi, '')
    .replace(/```\n?/gi, '')
    .replace(/^SQL:\s*/gi, '')
    .trim();
  
  const codeBlockMatch = cleaned.match(/```[\s\S]*?```/);
  if (codeBlockMatch) {
    cleaned = cleaned.replace(codeBlockMatch[0], '');
  }
  
  return cleaned.trim();
}

export class AnalyzerService {
  private get llmTool() { return globalToolRegistry.get('llm'); }
  private get sqlTool() { return globalToolRegistry.get('sql'); }
  private get entityFixerTool() { return globalToolRegistry.get('entityFixer'); }
  private get dataAnalyzerTool() { return globalToolRegistry.get('dataAnalyzer'); }

  constructor() {
    console.log('[Analyzer] AnalyzerService 已创建');
  }

  private ensureTools(): void {
    if (!this.llmTool) {
      console.error('[Analyzer] ❌ llm工具未找到');
      throw new Error('LLM工具未初始化');
    }
    if (!this.sqlTool) {
      console.error('[Analyzer] ❌ sql工具未找到');
      throw new Error('SQL工具未初始化');
    }
    if (!this.dataAnalyzerTool) {
      console.error('[Analyzer] ❌ dataAnalyzer工具未找到');
      throw new Error('数据分析工具未初始化');
    }
  }

  private getContext(context?: ToolExecutionContext): ToolExecutionContext {
    return context?.userId 
      ? context 
      : { userId: 'analyzer-system', sessionId: context?.sessionId, metadata: context?.metadata };
  }

  async analyze(question: string, sessionId: string, context?: ToolExecutionContext): Promise<any> {
    console.log('[Analyzer] 开始分析: ' + question);
    console.log('[Analyzer] 可用模板关键词:', templateRegistry.getAll().map(t => ({ name: t.name, keywords: t.keywords })));
    
    this.ensureTools();
    
    const template = templateRegistry.findTemplateByQuestion(question);
    
    if (!template) {
      console.log('[Analyzer] 未匹配到分析模板，执行单轮查询');
      return null;
    }

    console.log('[Analyzer] 匹配到模板: ' + template.name);
    console.log('[Analyzer] 模板步骤数: ' + template.steps.length);
    sendAnalyzerProgress(sessionId, 0, template.steps.length, template.name, `匹配到分析模板: ${template.name}`);
    
    const analysisContext = analysisStateManager.createContext(sessionId, question, template);
    
    const allResults: any[] = [];
    
    for (let i = 0; i < template.steps.length; i++) {
      const step = template.steps[i];
      console.log(`\n[Analyzer] 执行步骤 ${i + 1}/${template.steps.length}: ${step.stepName}`);
      console.log(`[Analyzer] SQL: ${step.sql.substring(0, 100)}...`);
      sendAnalyzerProgress(sessionId, i + 1, template.steps.length, step.stepName, `正在执行: ${step.stepName}`);
      
      try {
        let sql = step.sql;
        
        if (analysisContext.drillDownPath.length > 0) {
          const lastDrillDown = analysisContext.drillDownPath[analysisContext.drillDownPath.length - 1];
          if (step.sql.includes('{parent_value}')) {
            sql = step.sql.replace('{parent_value}', lastDrillDown);
          }
        }
        
        const fixResult = await this.entityFixerTool!.execute({ sql }, this.getContext(context));
        if (fixResult.success && fixResult.data.fixedSql) {
          sql = fixResult.data.fixedSql;
        }
        
        const validation = await sqlValidator.validate(sql);
        console.log(`[Analyzer] SQL校验结果: ${JSON.stringify(validation)}`);
        if (!validation.isValid) {
          console.log(`[Analyzer] SQL校验失败: ${validation.errors.join('; ')}`);
          continue;
        }
        
        const execResult = await this.sqlTool!.execute({ sql, limit: 1000 }, this.getContext(context));
        if (!execResult.success) {
          console.log(`[Analyzer] SQL执行失败: ${execResult.error}`);
          continue;
        }
        
        const data = execResult.data.rows;
        console.log(`[Analyzer] 获取到 ${data.length} 条数据`);
        
        let summary = '';
        let anomalies: AnomalyRecord[] = [];
        let opportunities: OpportunityRecord[] = [];
        
        if (step.analyzePrompt) {
          const analysisResult = await this.analyzeData(
            data, 
            step.analyzePrompt, 
            step.stepName,
            this.getContext(context)
          );
          summary = analysisResult.summary;
          anomalies = analysisResult.anomalies || [];
          opportunities = analysisResult.opportunities || [];
        }
        
        const stepResult: StepResult = {
          stepId: step.stepId,
          success: true,
          data,
          summary,
          anomalies,
          nextSteps: []
        };
        
        analysisStateManager.addStepResult(sessionId, stepResult);
        
        allResults.push({
          step: step.stepName,
          description: step.description,
          data: data.slice(0, 20),
          summary,
          anomalies,
          opportunities
        });
        
        if (anomalies.length > 0 && step.drillDown) {
          console.log(`[Analyzer] 发现 ${anomalies.length} 个异常点，可进行下钻分析`);
        }
        
      } catch (error: any) {
        console.error(`[Analyzer] 步骤执行失败: ${error.message}`);
        allResults.push({
          step: step.stepName,
          error: error.message
        });
      }
    }
    
    let finalReport = '';
    if (template.finalAnalyzePrompt) {
      console.log('[Analyzer] 生成最终分析报告...');
      finalReport = await this.generateFinalReport(
        allResults,
        template.finalAnalyzePrompt,
        question,
        context ?? undefined
      );
    }
    
    return {
      template: template.name,
      question,
      steps: allResults,
      finalReport,
      anomalies: analysisContext.anomalies,
      opportunities: analysisContext.opportunities,
      recommendations: analysisContext.recommendations
    };
  }

  private async analyzeData(
    data: any[], 
    prompt: string, 
    stepName: string,
    toolContext: ToolExecutionContext
  ): Promise<{ summary: string; anomalies?: AnomalyRecord[]; opportunities?: OpportunityRecord[] }> {
    if (!data || data.length === 0) {
      return { summary: '无数据' };
    }

    const sampleData = data.slice(0, 20);
    const dataJson = JSON.stringify(sampleData, null, 2);
    const numericFields = this.detectNumericFields(sampleData);
    const categoricalFields = this.detectCategoricalFields(sampleData);

    console.log('[Analyzer] 数据样本字段分析:', { numericFields, categoricalFields });

    const methodPrompt = `
你是一个数据分析助手。根据以下数据样本，判断应该使用什么分析方法。

数据样本（前20条）：
${dataJson}

可用分析方法：
1. anomaly_detection - 异常识别，检测数值特别高或特别低的记录
2. trend_analysis - 趋势分析，分析数据随时间的变化趋势
3. distribution_analysis - 分布分析，分析数据的分布情况
4. ranking_analysis - 排名分析，识别Top N和Bottom N
5. comparison_analysis - 对比分析，对比不同组别的数据差异
6. statistical_summary - 统计摘要，计算基本统计指标
7. auto - 自动选择最佳方法

请直接返回JSON格式的分析方法选择：
{"method": "方法名", "reason": "选择理由（20字以内）"}
`;

    let selectedMethod = 'statistical_summary';
    try {
      const methodResult = await this.llmTool!.execute(
        { userPrompt: methodPrompt },
        this.getContext(toolContext)
      );
      
      const methodContent = methodResult.data?.content || '';
      const methodMatch = methodContent.match(/\{[\s\S]*\}/);
      if (methodMatch) {
        const parsed = JSON.parse(methodMatch[0]);
        selectedMethod = parsed.method || 'statistical_summary';
        console.log('[Analyzer] LLM选择分析方法:', selectedMethod, '-', parsed.reason);
      }
    } catch (error: any) {
      console.error('[Analyzer] 选择分析方法失败，使用默认:', error.message);
    }

    console.log('[Analyzer] 调用数据分析工具, method:', selectedMethod);
    let analysisToolResult: any = { insights: [], findings: {}, recommendations: [] };
    try {
      const toolResult = await this.dataAnalyzerTool!.execute(
        { data: sampleData, analysisType: selectedMethod },
        this.getContext(toolContext)
      );
      if (toolResult.success) {
        analysisToolResult = toolResult.data || analysisToolResult;
        console.log('[Analyzer] 数据分析工具返回:', JSON.stringify(analysisToolResult).substring(0, 200));
      }
    } catch (error: any) {
      console.error('[Analyzer] 数据分析工具调用失败:', error.message);
    }

    const summaryPrompt = `
你是一个数据分析助手。根据以下数据和分析结果，生成分析总结。

${prompt}

数据样本（前20条）：
${dataJson}

分析结果：
- 分析方法: ${selectedMethod}
- 分析发现: ${analysisToolResult.insights?.join('; ') || '无'}
- 建议: ${analysisToolResult.recommendations?.join('; ') || '无'}

请生成分析总结（100字以内），以JSON格式返回：
{"summary": "总结内容", "anomalies": [{"dimension": "维度", "field": "字段", "value": "值", "description": "描述"}], "opportunities": [{"dimension": "维度", "target": "目标", "description": "描述"}]}
`;

    try {
      const llmResult = await this.llmTool!.execute(
        { userPrompt: summaryPrompt },
        this.getContext(toolContext)
      );

      const content = llmResult.data?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || analysisToolResult.insights?.join('; ').substring(0, 200) || '',
          anomalies: parsed.anomalies || [],
          opportunities: parsed.opportunities || []
        };
      }
      
      return { summary: content.slice(0, 500) };
    } catch (error: any) {
      console.error('[Analyzer] 数据分析失败: ' + error.message);
      return { summary: '数据分析失败: ' + error.message };
    }
  }

  private detectNumericFields(data: any[]): string[] {
    if (!data || data.length === 0) return [];
    const sample = data[0];
    const fields: string[] = [];
    for (const key of Object.keys(sample)) {
      const val = sample[key];
      if (typeof val === 'number' || (!isNaN(parseFloat(val)) && isFinite(val) && typeof val !== 'boolean')) {
        fields.push(key);
      }
    }
    return fields;
  }

  private detectCategoricalFields(data: any[]): string[] {
    if (!data || data.length === 0) return [];
    const sample = data[0];
    const fields: string[] = [];
    for (const key of Object.keys(sample)) {
      const val = sample[key];
      if (typeof val === 'string' && !isNaN(parseFloat(val))) {
        continue;
      }
      if (typeof val === 'string' || val === null || val === undefined) {
        fields.push(key);
      }
    }
    return fields;
  }

  private async generateFinalReport(
    allResults: any[],
    prompt: string,
    question: string,
    ctx?: ToolExecutionContext
  ): Promise<string> {
    const resultsJson = JSON.stringify(allResults, null, 2);

    const fullPrompt = `
用户问题: ${question}

${prompt}

分析过程数据：
${resultsJson}

请基于以上分析数据，生成完整的分析报告。要求：
1. 语言专业、简洁
2. 包含具体数据支撑
3. 提供明确的建议
4. 报告长度控制在1000字以内
`;

    try {
      console.log('[Analyzer] 正在调用LLM生成报告...');
      const llmResult = await this.llmTool!.execute(
        { userPrompt: fullPrompt },
        this.getContext(ctx)
      );
      console.log('[Analyzer] LLM返回结果:', JSON.stringify(llmResult).substring(0, 200));

      return llmResult.data?.content || '报告生成失败';
    } catch (error: any) {
      console.error('[Analyzer] 报告生成失败: ' + error.message);
      return '报告生成失败: ' + error.message;
    }
  }

  async continueAnalysis(sessionId: string, userInput: string, context?: ToolExecutionContext): Promise<any> {
    this.ensureTools();
    
    const analysisContext = analysisStateManager.getContext(sessionId);
    
    if (!analysisContext) {
      return { error: '没有活跃的分析会话' };
    }

    console.log('[Analyzer] 继续分析，用户输入: ' + userInput);

    const allResults = analysisStateManager.getAllResults(sessionId);
    
    const prompt = `
当前分析上下文：
- 问题: ${analysisContext.question}
- 已完成步骤: ${analysisContext.steps.map(s => s.stepName).join(', ')}
- 当前步骤: ${analysisContext.currentStepIndex + 1}/${analysisContext.steps.length}

用户继续输入: ${userInput}

请判断用户意图并规划下一步：
1. 如果用户要求下钻分析某个维度，返回具体的下钻SQL
2. 如果用户要求查看更多数据，返回具体SQL
3. 如果用户要求生成报告，生成最终报告
4. 其他情况，给出合理的响应

以JSON格式返回：
{
  "action": "drill_down | more_data | report | response",
  "sql": "具体SQL（如果需要）",
  "response": "直接响应用户的文本（如果不需要SQL）",
  "reason": "判断理由"
}
`;

    try {
      const llmResult = await this.llmTool!.execute({ userPrompt: prompt }, this.getContext(context));
      const content = llmResult.data?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (parsed.action === 'drill_down' && parsed.sql) {
          return { action: 'sql', sql: parsed.sql };
        } else if (parsed.action === 'report') {
          return { action: 'report' };
        }
        
        return { action: 'response', text: parsed.response || content };
      }
      
      return { action: 'response', text: content };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  getAnalysisStatus(sessionId: string): any {
    const context = analysisStateManager.getContext(sessionId);
    if (!context) {
      return { active: false };
    }

    return {
      active: true,
      question: context.question,
      templateName: context.metadata.templateName,
      currentStep: context.currentStepIndex + 1,
      totalSteps: context.steps.length,
      completedSteps: context.steps.map(s => s.stepName),
      anomaliesCount: context.anomalies.length,
      opportunitiesCount: context.opportunities.length
    };
  }
}

export const analyzerService = new AnalyzerService();
