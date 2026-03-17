/**
 * NLU Agent - 自然语言理解
 * 
 * 负责理解用户意图，提取关键实体
 */

import { LLMAgent, LLMClient } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  NLUOutput,
  IntentType,
  ExtractedEntities,
} from '../types';

export class NLUBAgent extends LLMAgent<string, NLUOutput> {
  definition: AgentDefinition = {
    name: 'nlu-agent',
    description: '理解用户意图，提取关键实体（指标、维度、时间范围等）',
    version: '1.0.0',
    layer: 'understanding',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户的自然语言查询' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['query', 'analysis', 'comparison', 'trend', 'unknown'] },
        confidence: { type: 'number' },
        entities: { type: 'object' },
      },
    },
  };
  
  constructor(llmClient: LLMClient) {
    super(llmClient, {
      model: 'qwen-turbo',  // 使用便宜的快速模型
      temperature: 0.3,
      maxTokens: 1000,
      maxRetries: 2,
    });
  }
  
  protected async run(query: string, context: AgentContext): Promise<NLUOutput> {
    const systemPrompt = this.buildSystemPrompt(context);
    const response = await this.callLLM(query, systemPrompt);
    
    // 解析 LLM 返回的 JSON
    const result = this.parseResponse(response);
    
    // 验证和修正
    return this.validateAndFix(result, query);
  }
  
  private buildSystemPrompt(context: AgentContext): string {
    return `你是一个自然语言理解专家，负责分析用户的数据查询意图。

请分析用户的问题，返回以下 JSON 格式：
{
  "intent": "query|analysis|comparison|trend|unknown",
  "confidence": 0.0-1.0,
  "entities": {
    "metrics": ["指标名称"],
    "dimensions": ["维度名称"],
    "filters": {"字段": "值"},
    "timeRange": {"type": "relative", "value": "last_7_days"} 或 {"type": "absolute", "start": "2024-01-01", "end": "2024-12-31"},
    "aggregations": ["sum", "avg", "count"],
    "limit": 数字,
    "orderBy": {"field": "字段名", "direction": "asc|desc"}
  },
  "rewrittenQuery": "改写后的更清晰的问题（可选）"
}

意图类型说明：
- query: 简单数据查询，如"销售额是多少"
- analysis: 分析型查询，如"为什么销售额下降"
- comparison: 对比型查询，如"华东和华北的销售额对比"
- trend: 趋势型查询，如"销售额的变化趋势"

时间范围说明：
- relative: last_7_days, last_30_days, this_week, this_month, this_quarter, last_quarter, this_year
- absolute: 具体日期范围

用户上下文：
- 用户ID: ${context.userId}
- 数据源ID: ${context.datasourceId || '未指定'}
${context.history?.length ? `- 最近对话: ${context.history.slice(-3).map(h => h.content).join(' -> ')}` : ''}

只返回 JSON，不要其他解释。`;
  }
  
  private parseResponse(response: string): NLUOutput {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('NLU Agent JSON 解析失败:', error);
    }
    
    // 返回默认值
    return {
      intent: 'unknown',
      confidence: 0,
      entities: {
        metrics: [],
        dimensions: [],
        filters: {},
      },
    };
  }
  
  private validateAndFix(result: NLUOutput, originalQuery: string): NLUOutput {
    // 确保所有字段都存在
    result.entities = {
      metrics: result.entities?.metrics || [],
      dimensions: result.entities?.dimensions || [],
      filters: result.entities?.filters || {},
      timeRange: result.entities?.timeRange,
      aggregations: result.entities?.aggregations,
      limit: result.entities?.limit,
      orderBy: result.entities?.orderBy,
    };
    
    // 如果置信度太低，标记为需要澄清
    if (result.confidence < 0.5) {
      result.intent = 'unknown';
    }
    
    // 如果没有提取到任何实体，尝试从原文推断
    if (result.entities.metrics.length === 0 && result.entities.dimensions.length === 0) {
      // 简单的关键词推断
      const metricKeywords = ['销售额', '利润', '成本', '数量', '金额', '占比', '增长率'];
      for (const keyword of metricKeywords) {
        if (originalQuery.includes(keyword)) {
          result.entities.metrics.push(keyword);
        }
      }
    }
    
    return result;
  }
  
  /**
   * 重试逻辑：简化 prompt 重试
   */
  async retry(query: string, context: AgentContext, error: any): Promise<AgentResult<NLUOutput>> {
    // 使用更简单的 prompt 重试
    const simplePrompt = `分析这句话的意图，返回 JSON: {"intent": "query|analysis|comparison|trend", "metrics": [], "dimensions": []}
    
句子: ${query}`;
    
    try {
      const response = await this.callLLM(simplePrompt);
      const result = this.parseResponse(response);
      return this.success(result);
    } catch (e) {
      return this.failure(error);
    }
  }
  
  /**
   * 降级处理：返回基础分析
   */
  async fallback(query: string, context: AgentContext): Promise<AgentResult<NLUOutput>> {
    // 基于关键词的简单分析
    const result: NLUOutput = {
      intent: 'query',
      confidence: 0.3,
      entities: {
        metrics: [],
        dimensions: [],
        filters: {},
      },
      rewrittenQuery: query,
    };
    
    // 关键词匹配
    const metricPatterns: Record<string, string[]> = {
      '销售额': ['销售额', '销售金额', '销售'],
      '利润': ['利润', '净利', '毛利'],
      '成本': ['成本', '费用'],
      '数量': ['数量', '件数', '个数'],
    };
    
    for (const [metric, patterns] of Object.entries(metricPatterns)) {
      if (patterns.some(p => query.includes(p))) {
        result.entities.metrics.push(metric);
      }
    }
    
    const dimensionPatterns: Record<string, string[]> = {
      '地区': ['地区', '区域', '省份', '城市'],
      '产品': ['产品', '商品', '品类'],
      '时间': ['时间', '日期', '月份', '季度', '年度'],
    };
    
    for (const [dimension, patterns] of Object.entries(dimensionPatterns)) {
      if (patterns.some(p => query.includes(p))) {
        result.entities.dimensions.push(dimension);
      }
    }
    
    return this.success(result);
  }
}
