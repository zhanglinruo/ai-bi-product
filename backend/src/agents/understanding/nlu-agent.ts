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

export interface NLUInput {
  query: string;
  context?: {
    userId?: string;
    sessionId?: string;
    history?: Array<{ role: string; content: string }>;
  };
}

export class NLUBAgent extends LLMAgent<NLUInput, NLUOutput> {
  definition: AgentDefinition = {
    name: 'nlu-agent',
    description: '理解用户意图，提取关键实体（指标、维度、时间范围等）',
    version: '1.0.0',
    layer: 'understanding',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户的自然语言查询' },
        context: { type: 'object' },
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
      temperature: 0.3,
      maxTokens: 1500,
      maxRetries: 2,
    });
  }
  
  protected async run(input: NLUInput, context: AgentContext): Promise<NLUOutput> {
    const systemPrompt = this.buildSystemPrompt(context);
    const response = await this.callLLM(input.query, systemPrompt);
    
    // 解析 LLM 返回的 JSON
    const result = this.parseResponse(response);
    
    // 验证和修正
    return this.validateAndFix(result, input.query);
  }
  
  private buildSystemPrompt(context: AgentContext): string {
    return `你是一个自然语言理解专家，负责分析用户的数据查询意图。

请分析用户的问题，返回以下 JSON 格式：
{
  "intent": "query|analysis|comparison|trend|unknown",
  "confidence": 0.0-1.0,
  "entities": {
    "metrics": [{"field": "字段名", "table": "表名", "aggregation": "SUM|COUNT|AVG|MAX|MIN"}],
    "dimensions": [{"field": "字段名", "table": "表名", "value": "可选的筛选值"}],
    "filters": {"字段": "值"},
    "timeRange": {"type": "relative", "value": "last_7_days"} 或 {"type": "absolute", "start": "2024-01-01", "end": "2024-12-31"},
    "aggregations": ["SUM", "AVG", "COUNT"],
    "limit": 数字,
    "orderBy": {"field": "字段名", "direction": "asc|desc"},
    "groupBy": ["维度字段"]
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

重要提示：
1. 如果用户提到"按...分组"、"每个..."、"各..."，需要在 groupBy 中添加维度
2. 如果用户提到"对比"、"比较"，intent 设为 comparison
3. 如果用户提到"趋势"、"变化"，intent 设为 trend
4. metrics 是数值型指标，dimensions 是分组/筛选的维度

用户上下文：
- 用户ID: ${context.userId || 'anonymous'}
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
      groupBy: result.entities?.groupBy || [],
    };
    
    // 如果置信度太低，标记为需要澄清
    if (result.confidence < 0.5) {
      result.intent = 'unknown';
    }
    
    // 自动检测 GROUP BY 关键词
    const groupByPatterns = /按|每个|各|分别|不同|各类/i;
    if (groupByPatterns.test(originalQuery) && result.entities.groupBy?.length === 0) {
      // 尝试从 dimensions 中推断
      if (result.entities.dimensions.length > 0) {
        result.entities.groupBy = result.entities.dimensions.map(d => d.field);
      }
    }
    
    // 如果没有提取到任何实体，尝试从原文推断
    if (result.entities.metrics.length === 0) {
      result = this.inferFromKeywords(result, originalQuery);
    }
    
    return result;
  }
  
  /**
   * 基于关键词推断
   */
  private inferFromKeywords(result: NLUOutput, query: string): NLUOutput {
    // 指标关键词
    const metricPatterns = [
      { pattern: /销售额?|销售金额|销售总额/, field: 'total_amount', table: 'orders', agg: 'SUM' },
      { pattern: /订单数|订单量|订单总数|有多少订单/, field: 'order_id', table: 'orders', agg: 'COUNT' },
      { pattern: /客户数|客户总数|客户数量/, field: 'customer_id', table: 'customers', agg: 'COUNT' },
      { pattern: /产品数|商品数/, field: 'product_id', table: 'products', agg: 'COUNT' },
      { pattern: /平均.*订单|客单价|平均.*金额/, field: 'total_amount', table: 'orders', agg: 'AVG' },
      { pattern: /最高|最大/, field: 'total_amount', table: 'orders', agg: 'MAX' },
      { pattern: /最低|最小/, field: 'total_amount', table: 'orders', agg: 'MIN' },
    ];
    
    for (const p of metricPatterns) {
      if (p.pattern.test(query)) {
        result.entities.metrics.push({ 
          field: p.field, 
          table: p.table, 
          aggregation: p.agg 
        });
        result.confidence = Math.max(result.confidence, 0.6);
      }
    }
    
    // 维度关键词
    const dimensionPatterns = [
      { pattern: /客户类型|客户类别/, field: 'customer_type', table: 'customers' },
      { pattern: /产品类别|产品分类|类别/, field: 'category', table: 'products' },
      { pattern: /城市/, field: 'city', table: 'customers' },
      { pattern: /国家/, field: 'country', table: 'customers' },
      { pattern: /订单状态/, field: 'order_status', table: 'orders' },
      { pattern: /支付方式/, field: 'payment_method', table: 'orders' },
      { pattern: /制造商|厂家/, field: 'manufacturer', table: 'products' },
    ];
    
    for (const p of dimensionPatterns) {
      if (p.pattern.test(query)) {
        result.entities.dimensions.push({ 
          field: p.field, 
          table: p.table 
        });
        
        // 如果查询包含"按"等关键词，添加到 groupBy
        if (/按|每个|各/.test(query)) {
          if (!result.entities.groupBy?.includes(p.field)) {
            result.entities.groupBy = result.entities.groupBy || [];
            result.entities.groupBy.push(p.field);
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * 重试逻辑：简化 prompt 重试
   */
  async retry(input: NLUInput, context: AgentContext, error: any): Promise<AgentResult<NLUOutput>> {
    // 使用更简单的 prompt 重试
    const simplePrompt = `分析这句话的意图，返回 JSON:
{"intent": "query|analysis|comparison|trend", "metrics": [{"field": "字段名"}], "dimensions": [{"field": "字段名"}], "groupBy": []}

句子: ${input.query}`;
    
    try {
      const response = await this.callLLM(simplePrompt);
      const result = this.parseResponse(response);
      return this.success(result);
    } catch (e) {
      // 降级：使用关键词匹配
      const fallbackResult: NLUOutput = {
        intent: 'query',
        confidence: 0.3,
        entities: {
          metrics: [],
          dimensions: [],
          filters: {},
        },
      };
      return this.success(this.inferFromKeywords(fallbackResult, input.query));
    }
  }
  
  /**
   * 降级处理：返回基础分析
   */
  async fallback(input: NLUInput, context: AgentContext): Promise<AgentResult<NLUOutput>> {
    const result: NLUOutput = {
      intent: 'query',
      confidence: 0.3,
      entities: {
        metrics: [],
        dimensions: [],
        filters: {},
      },
      rewrittenQuery: input.query,
    };
    
    return this.success(this.inferFromKeywords(result, input.query));
  }
}
