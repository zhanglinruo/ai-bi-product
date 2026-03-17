/**
 * Insight Agent - 洞察分析器
 * 
 * 负责分析数据，发现洞察
 */

import { LLMAgent, LLMClient } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  InsightOutput,
  Insight,
  Anomaly,
} from '../types';

export interface InsightInput {
  data: Record<string, any>[];
  query: string;
  sql?: string;
  historicalData?: Record<string, any>[];
}

export class InsightAgent extends LLMAgent<InsightInput, InsightOutput> {
  definition: AgentDefinition = {
    name: 'insight-agent',
    description: '分析数据，发现洞察和异常',
    version: '1.0.0',
    layer: 'output',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array' },
        query: { type: 'string' },
        sql: { type: 'string' },
      },
      required: ['data', 'query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        insights: { type: 'array' },
        anomalies: { type: 'array' },
        recommendations: { type: 'array' },
      },
    },
  };
  
  constructor(llmClient: LLMClient) {
    super(llmClient, {
      model: 'qwen-plus',  // 需要分析能力
      temperature: 0.5,
      maxTokens: 2000,
      maxRetries: 2,
    });
  }
  
  protected async run(input: InsightInput, context: AgentContext): Promise<InsightOutput> {
    const { data, query, sql, historicalData } = input;
    
    // 如果数据为空
    if (!data || data.length === 0) {
      return {
        summary: '查询结果为空，没有找到符合条件的数据。',
        insights: [],
        recommendations: ['建议调整查询条件后重试'],
      };
    }
    
    // 计算基础统计
    const stats = this.calculateStats(data);
    
    // 检测异常
    const anomalies = this.detectAnomalies(data, stats);
    
    // 使用 LLM 生成洞察
    const llmInsights = await this.generateInsights(data, query, sql, stats, anomalies, historicalData);
    
    return {
      summary: llmInsights.summary,
      insights: llmInsights.insights,
      anomalies,
      recommendations: llmInsights.recommendations,
    };
  }
  
  /**
   * 计算基础统计
   */
  private calculateStats(data: Record<string, any>[]): Record<string, any> {
    if (data.length === 0) return {};
    
    const stats: Record<string, any> = {};
    const numericFields = this.getNumericFields(data);
    
    for (const field of numericFields) {
      const values = data.map(d => d[field]).filter(v => typeof v === 'number');
      
      if (values.length > 0) {
        stats[field] = {
          count: values.length,
          sum: values.reduce((a, b) => a + b, 0),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
        };
      }
    }
    
    return stats;
  }
  
  /**
   * 获取数值字段
   */
  private getNumericFields(data: Record<string, any>[]): string[] {
    const fields: string[] = [];
    const firstRow = data[0];
    
    for (const [key, value] of Object.entries(firstRow)) {
      if (typeof value === 'number') {
        fields.push(key);
      }
    }
    
    return fields;
  }
  
  /**
   * 检测异常
   */
  private detectAnomalies(data: Record<string, any>[], stats: Record<string, any>): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    for (const [field, stat] of Object.entries(stats)) {
      const { avg, min, max } = stat as any;
      const range = max - min;
      const threshold = avg * 0.5; // 偏离 50% 视为异常
      
      // 检查极端值
      const extremeValues = data.filter(d => {
        const value = d[field];
        return Math.abs(value - avg) > threshold;
      });
      
      if (extremeValues.length > 0) {
        anomalies.push({
          field,
          value: extremeValues[0][field],
          expectedValue: avg,
          deviation: Math.abs(extremeValues[0][field] - avg) / avg * 100,
          possibleReasons: ['数据异常', '特殊情况', '需要人工核实'],
        });
      }
    }
    
    return anomalies;
  }
  
  /**
   * 使用 LLM 生成洞察
   */
  private async generateInsights(
    data: Record<string, any>[],
    query: string,
    sql: string | undefined,
    stats: Record<string, any>,
    anomalies: Anomaly[],
    historicalData?: Record<string, any>[]
  ): Promise<{ summary: string; insights: Insight[]; recommendations: string[] }> {
    
    // 限制数据量（避免 token 超限）
    const sampleData = data.slice(0, 10);
    
    const systemPrompt = `你是一个数据分析专家。根据查询结果，生成简洁的业务洞察。

## 用户问题
${query}

## 执行的 SQL
${sql || '未提供'}

## 数据样本（前 10 条）
\`\`\`json
${JSON.stringify(sampleData, null, 2)}
\`\`\`

## 基础统计
\`\`\`json
${JSON.stringify(stats, null, 2)}
\`\`\`

## 检测到的异常
${anomalies.length > 0 ? JSON.stringify(anomalies, null, 2) : '无'}

## 输出要求
返回 JSON 格式：
{
  "summary": "一句话总结核心发现（不超过 50 字）",
  "insights": [
    {
      "type": "trend|comparison|distribution|correlation|anomaly",
      "title": "洞察标题",
      "description": "详细描述",
      "importance": "high|medium|low"
    }
  ],
  "recommendations": ["建议1", "建议2"]
}

只返回 JSON，不要其他内容。`;

    const response = await this.callLLM('请分析数据并生成洞察', systemPrompt);
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Insight Agent JSON 解析失败:', error);
    }
    
    // 返回默认结果
    return {
      summary: `共查询到 ${data.length} 条数据`,
      insights: [{
        type: 'distribution',
        title: '数据概览',
        description: `数据量: ${data.length} 条`,
        importance: 'medium',
      }],
      recommendations: [],
    };
  }
}
