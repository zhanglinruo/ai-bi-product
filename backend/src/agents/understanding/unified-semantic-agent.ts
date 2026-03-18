/**
 * 统一语义理解 Agent
 * 
 * 整合 NLU + Semantic 功能
 * 使用向量搜索 + 规则匹配 + LLM 降级
 */

import { LLMAgent, LLMClient } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  NLUOutput,
} from '../types';
import { getLocalEmbeddingService, LocalEmbeddingService } from '../../services/local-embedding';
import { getSemanticMappingService, SemanticMetric, SemanticDimension, SemanticTerm } from '../../services/semantic-mapping';

export interface UnifiedNLUInput {
  query: string;
  entities?: any;  // 如果有，说明是 Semantic 阶段
  context?: {
    userId?: string;
    sessionId?: string;
    history?: Array<{ role: string; content: string }>;
  };
}

export interface ExtractedEntities {
  metrics: Array<{
    field: string;
    table: string;
    aggregation: string;
    confidence: number;
  }>;
  dimensions: Array<{
    field: string;
    table: string;
    confidence: number;
  }>;
  filters: Record<string, any>;
  groupBy: string[];
  orderBy?: { direction: string; field?: string };
  limit: number;
  timeRange?: {
    expression: string;
    unit: string;
    value: number;
    operator: string;
  };
  intent: string;
}

// 时间表达式（可配置化）
const TIME_EXPRESSIONS: Record<string, { unit: string; value: number; operator: string }> = {
  '今天': { unit: 'DAY', value: 0, operator: '=' },
  '昨天': { unit: 'DAY', value: 1, operator: '=' },
  '最近7天': { unit: 'DAY', value: 7, operator: '>=' },
  '最近一周': { unit: 'DAY', value: 7, operator: '>=' },
  '最近30天': { unit: 'DAY', value: 30, operator: '>=' },
  '最近一个月': { unit: 'MONTH', value: 1, operator: '>=' },
  '最近一年': { unit: 'YEAR', value: 1, operator: '>=' },
  '过去一年': { unit: 'YEAR', value: 1, operator: '>=' },
  '过去一个月': { unit: 'MONTH', value: 1, operator: '>=' },
  '本月': { unit: 'MONTH', value: 1, operator: '>=' },
  '上月': { unit: 'MONTH', value: 2, operator: '=' },
  '今年': { unit: 'YEAR', value: 1, operator: '>=' },
  '去年': { unit: 'YEAR', value: 2, operator: '=' },
};

// 时间分组表达式
const GROUP_BY_PATTERNS = [
  { pattern: /每月|按月|月度|月份/i, unit: 'month' },
  { pattern: /每天|按天|日度|日期/i, unit: 'day' },
  { pattern: /每周|按周|周度/i, unit: 'week' },
  { pattern: /每年|按年|年度/i, unit: 'year' },
];

export class UnifiedSemanticAgent extends LLMAgent<UnifiedNLUInput, NLUOutput> {
  definition: AgentDefinition = {
    name: 'unified-semantic-agent',
    description: '统一语义理解：向量搜索 + 规则匹配 + LLM降级',
    version: '1.0.0',
    layer: 'understanding',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        context: { type: 'object' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string' },
        entities: { type: 'object' },
      },
    },
  };

  private embeddingService: LocalEmbeddingService;
  private semanticMappingService: ReturnType<typeof getSemanticMappingService>;
  private configCache: {
    metrics: SemanticMetric[];
    dimensions: SemanticDimension[];
    terms: SemanticTerm[];
    lastUpdate: Date | null;
  } = { metrics: [], dimensions: [], terms: [], lastUpdate: null };

  constructor(llmClient: LLMClient) {
    super(llmClient, {
      temperature: 0.1,  // 低温度，更确定性的输出
      maxTokens: 1000,
      maxRetries: 1,
    });
    this.embeddingService = getLocalEmbeddingService();
    this.semanticMappingService = getSemanticMappingService();
  }

  protected async run(input: UnifiedNLUInput, context: AgentContext): Promise<NLUOutput> {
    const query = input.query;
    console.log('[UnifiedSemantic] 处理查询:', query);

    // 1. 加载最新语义配置
    await this.loadConfig();

    // 2. 初始化向量索引（如果需要）
    await this.ensureVectorIndex();

    // 3. 向量搜索识别实体
    const vectorResult = await this.extractByVectorSearch(query);
    console.log('[UnifiedSemantic] 向量搜索结果:', JSON.stringify(vectorResult, null, 2));

    // 4. 规则匹配补充
    const ruleResult = this.extractByRules(query);
    console.log('[UnifiedSemantic] 规则匹配结果:', JSON.stringify(ruleResult, null, 2));

    // 5. 合并结果
    let entities = this.mergeResults(vectorResult, ruleResult);

    // 6. 判断是否需要 LLM 增强
    const needsLLM = this.needsLLMEnhancement(entities, query);
    
    if (needsLLM) {
      console.log('[UnifiedSemantic] 调用 LLM 增强...');
      const llmResult = await this.extractByLLM(query);
      entities = this.mergeResults(entities, llmResult);
    }

    // 7. 构建最终输出
    const intent = this.detectIntent(query) as 'query' | 'comparison' | 'trend' | 'analysis' | 'unknown';
    
    // 处理 groupBy：如果有 __use_dimensions__ 标记，用实际维度替换
    let finalGroupBy = [...entities.groupBy];
    const useDimensionsIdx = finalGroupBy.indexOf('__use_dimensions__');
    if (useDimensionsIdx >= 0) {
      finalGroupBy.splice(useDimensionsIdx, 1);
      // 添加所有维度作为分组
      for (const dim of entities.dimensions) {
        finalGroupBy.push(dim.field);
      }
    }
    
    const finalEntities = {
      metrics: entities.metrics.map((m: any) => m.field),
      dimensions: entities.dimensions.map((d: any) => d.field),
      filters: entities.filters,
      groupBy: finalGroupBy,
      orderBy: entities.orderBy ? {
        field: entities.orderBy.field || 'total',
        direction: entities.orderBy.direction as 'asc' | 'desc',
      } : undefined,
      limit: entities.limit || 100,
      timeRange: entities.timeRange ? {
        type: 'relative' as const,
        value: `${entities.timeRange.unit}_${entities.timeRange.value}`,
      } : undefined,
    };
    
    console.log('[UnifiedSemantic] 最终实体:', JSON.stringify(finalEntities, null, 2));
    
    return {
      intent,
      confidence: needsLLM ? 0.9 : 0.95,
      entities: finalEntities,
    };
  }

  /**
   * 加载语义配置
   */
  private async loadConfig(): Promise<void> {
    const config = await this.semanticMappingService.getConfig();
    
    // 检查是否有更新
    if (this.configCache.lastUpdate && config.lastUpdated <= this.configCache.lastUpdate) {
      return;
    }

    this.configCache = {
      metrics: config.metrics,
      dimensions: config.dimensions,
      terms: config.terms,
      lastUpdate: config.lastUpdated,
    };
    
    // 清空向量索引，下次使用时重建
    this.embeddingService.clearVectorStore();
  }

  /**
   * 确保向量索引已建立
   */
  private async ensureVectorIndex(): Promise<void> {
    if (this.embeddingService.getVectorStoreSize() > 0) {
      return;
    }

    console.log('[UnifiedSemantic] 构建向量索引...');

    // 索引指标
    for (const metric of this.configCache.metrics) {
      const texts = [metric.name, ...metric.aliases];
      for (let i = 0; i < texts.length; i++) {
        await this.embeddingService.addDocument(
          `metric_${metric.id}_${i}`,
          texts[i],
          {
            type: 'metric',
            id: metric.id,
            name: metric.name,
            dbField: metric.dbField,
            dbTable: metric.dbTable,
            aggregation: metric.aggregation,
          }
        );
      }
    }

    // 索引维度
    for (const dim of this.configCache.dimensions) {
      const texts = [dim.name, ...dim.aliases];
      for (let i = 0; i < texts.length; i++) {
        await this.embeddingService.addDocument(
          `dim_${dim.id}_${i}`,
          texts[i],
          {
            type: 'dimension',
            id: dim.id,
            name: dim.name,
            dbField: dim.dbField,
            dbTable: dim.dbTable,
          }
        );
      }
    }

    // 索引术语
    for (const term of this.configCache.terms) {
      await this.embeddingService.addDocument(
        `term_${term.id}`,
        term.term,
        {
          type: 'term',
          id: term.id,
          term: term.term,
          category: term.category,
          mappings: term.mappings,
        }
      );
    }

    console.log(`[UnifiedSemantic] 向量索引完成，共 ${this.embeddingService.getVectorStoreSize()} 个向量`);
  }

  /**
   * 向量搜索提取实体
   */
  private async extractByVectorSearch(query: string): Promise<ExtractedEntities> {
    const result: ExtractedEntities = {
      metrics: [],
      dimensions: [],
      filters: {},
      groupBy: [],
      limit: 100,
      intent: 'query',
    };

    // 搜索相关指标
    const metricResults = await this.embeddingService.search(query, 3, 0.5);
    
    for (const r of metricResults) {
      if (r.metadata.type === 'metric') {
        result.metrics.push({
          field: r.metadata.dbField,
          table: r.metadata.dbTable,
          aggregation: r.metadata.aggregation,
          confidence: r.score,
        });
      } else if (r.metadata.type === 'dimension') {
        result.dimensions.push({
          field: r.metadata.dbField,
          table: r.metadata.dbTable,
          confidence: r.score,
        });
      } else if (r.metadata.type === 'term') {
        // 术语转换为筛选条件
        const mappings = r.metadata.mappings;
        if (mappings.field && mappings.value) {
          result.filters[mappings.field] = mappings.value;
        }
      }
    }

    return result;
  }

  /**
   * 规则匹配提取实体
   */
  private extractByRules(query: string): ExtractedEntities {
    const result: ExtractedEntities = {
      metrics: [],
      dimensions: [],
      filters: {},
      groupBy: [],
      limit: 100,
      intent: 'query',
    };

    // 1. 提取时间范围
    result.timeRange = this.extractTimeRange(query);

    // 2. 提取分组
    result.groupBy = this.extractGroupBy(query);

    // 3. 提取排序
    result.orderBy = this.extractOrderBy(query);

    // 4. 提取限制
    const limitMatch = query.match(/前(\d+)/);
    if (limitMatch) {
      result.limit = parseInt(limitMatch[1]);
    }

    // 5. 提取筛选条件（基于术语）
    result.filters = this.extractFilters(query);

    return result;
  }

  /**
   * 提取时间范围
   */
  private extractTimeRange(query: string): any | null {
    for (const [expr, config] of Object.entries(TIME_EXPRESSIONS)) {
      if (query.includes(expr)) {
        return {
          expression: expr,
          unit: config.unit,
          value: config.value,
          operator: config.operator,
        };
      }
    }

    // 检查年份
    const yearMatch = query.match(/(\d{4})年/);
    if (yearMatch) {
      return {
        expression: 'year',
        unit: 'YEAR',
        value: parseInt(yearMatch[1]),
        operator: '=',
      };
    }

    return null;
  }

  /**
   * 提取分组
   */
  private extractGroupBy(query: string): string[] {
    const groupBy: string[] = [];

    // 时间分组
    for (const { pattern, unit } of GROUP_BY_PATTERNS) {
      if (pattern.test(query)) {
        groupBy.push(unit);
      }
    }

    // 维度分组（按XX统计/按XX分组）
    if (/按.*统计|按.*分组|每个|各|分别/.test(query)) {
      // 从已识别的维度中提取
      // 这里返回一个标记，后续会根据 dimensions 填充
      groupBy.push('__use_dimensions__');
    }

    return groupBy;
  }

  /**
   * 提取排序
   */
  private extractOrderBy(query: string): { direction: string } | undefined {
    if (/最高|最多|最大|排名前|top/i.test(query)) {
      return { direction: 'DESC' };
    }
    if (/最低|最少|最小/i.test(query)) {
      return { direction: 'ASC' };
    }
    return undefined;
  }

  /**
   * 提取筛选条件
   */
  private extractFilters(query: string): Record<string, any> {
    const filters: Record<string, any> = {};

    // 基于术语匹配
    for (const term of this.configCache.terms) {
      if (query.includes(term.term)) {
        const mappings = term.mappings as any;
        if (mappings.field && mappings.value) {
          filters[mappings.field] = mappings.value;
        }
      }
    }

    return filters;
  }

  /**
   * 合并结果
   */
  private mergeResults(base: ExtractedEntities, overlay: ExtractedEntities): ExtractedEntities {
    const merged: ExtractedEntities = {
      metrics: [...base.metrics],
      dimensions: [...base.dimensions],
      filters: { ...base.filters, ...overlay.filters },
      groupBy: [...new Set([...base.groupBy, ...overlay.groupBy])],
      limit: overlay.limit || base.limit,
      intent: base.intent,
    };

    // 合并指标（去重）
    for (const m of overlay.metrics) {
      if (!merged.metrics.find(x => x.field === m.field)) {
        merged.metrics.push(m);
      }
    }

    // 合并维度（去重）
    for (const d of overlay.dimensions) {
      if (!merged.dimensions.find(x => x.field === d.field)) {
        merged.dimensions.push(d);
      }
    }

    // 时间范围优先使用 overlay
    if (overlay.timeRange) {
      merged.timeRange = overlay.timeRange;
    } else {
      merged.timeRange = base.timeRange;
    }

    // 排序优先使用 overlay
    if (overlay.orderBy) {
      merged.orderBy = overlay.orderBy;
    } else {
      merged.orderBy = base.orderBy;
    }

    return merged;
  }

  /**
   * 判断是否需要 LLM 增强
   */
  private needsLLMEnhancement(entities: ExtractedEntities, query: string): boolean {
    // 如果没有识别到任何指标，需要 LLM
    if (entities.metrics.length === 0) {
      return true;
    }

    // 如果查询包含复杂表达，需要 LLM
    const complexPatterns = [
      /对比|比较|差异|区别/,
      /为什么|原因|分析/,
      /趋势|变化|增长|下降/,
      /最.*的/,
    ];

    for (const pattern of complexPatterns) {
      if (pattern.test(query)) {
        return true;
      }
    }

    return false;
  }

  /**
   * LLM 增强提取
   */
  private async extractByLLM(query: string): Promise<ExtractedEntities> {
    const prompt = `分析以下用户查询，提取结构化信息。

查询: "${query}"

请以 JSON 格式返回以下字段：
{
  "metrics": [{"field": "字段名", "aggregation": "SUM/COUNT/AVG/MAX/MIN", "confidence": 0.9}],
  "dimensions": [{"field": "字段名", "confidence": 0.9}],
  "filters": {"字段名": "值"},
  "groupBy": ["month/year/customer_type等"],
  "timeRange": {"unit": "DAY/MONTH/YEAR", "value": 1, "operator": ">="},
  "intent": "query/comparison/trend/analysis"
}

可用字段：
- orders: total_amount (销售额), order_id (订单), order_date (日期), order_status (状态)
- customers: customer_type (客户类型), city (城市), country (国家)
- products: category (类别), manufacturer (制造商)

只返回 JSON，不要其他内容。`;

    try {
      const response = await this.llmClient.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 500,
      });

      const content = response.content || '';
      
      // 解析 LLM 响应
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          metrics: parsed.metrics || [],
          dimensions: parsed.dimensions || [],
          filters: parsed.filters || {},
          groupBy: parsed.groupBy || [],
          timeRange: parsed.timeRange,
          intent: parsed.intent || 'query',
          limit: 100,
        };
      }
    } catch (error: any) {
      console.warn('[UnifiedSemantic] LLM 增强失败:', error.message);
    }

    return {
      metrics: [],
      dimensions: [],
      filters: {},
      groupBy: [],
      limit: 100,
      intent: 'query',
    };
  }

  /**
   * 检测意图
   */
  private detectIntent(query: string): string {
    if (/对比|比较|差异|区别/.test(query)) {
      return 'comparison';
    }
    if (/趋势|变化|增长|下降/.test(query)) {
      return 'trend';
    }
    if (/为什么|原因|分析/.test(query)) {
      return 'analysis';
    }
    if (/多少|统计|总计|总和|平均/.test(query)) {
      return 'query';
    }
    return 'query';
  }
}
