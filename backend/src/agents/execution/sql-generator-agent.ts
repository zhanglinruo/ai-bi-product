/**
 * SQL Generator Agent - SQL 生成器
 * 
 * 负责将结构化意图转换为 SQL
 */

import { LLMAgent, LLMClient } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  SQLGeneratorOutput,
} from '../types';

export interface SQLGeneratorInput {
  intent: string;
  entities: {
    metrics: Array<{ field: string; table?: string; aggregation?: string }>;
    dimensions: Array<{ field: string; table?: string }>;
    filters?: Record<string, any>;
    groupBy?: string[];
    orderBy?: any;
    limit?: number;
  };
  mappedFields?: any[];
  schema?: any;
}

// 字段名映射（中文 -> 英文）
const FIELD_MAPPING: Record<string, string> = {
  '销售额': 'total_amount',
  '销售金额': 'total_amount',
  '订单数': 'order_id',
  '订单量': 'order_id',
  '客户数': 'customer_id',
  '客户数量': 'customer_id',
  '产品数': 'product_id',
  '客户类型': 'customer_type',
  '客户类别': 'customer_type',
  '产品类别': 'category',
  '类别': 'category',
  '城市': 'city',
  '国家': 'country',
  '订单状态': 'order_status',
  '支付方式': 'payment_method',
  '制造商': 'manufacturer',
  '厂家': 'manufacturer',
};

// 字段所属表映射
const FIELD_TABLE_MAPPING: Record<string, string> = {
  'total_amount': 'orders',
  'order_id': 'orders',
  'customer_id': 'customers',
  'product_id': 'products',
  'customer_type': 'customers',
  'category': 'products',
  'city': 'customers',
  'country': 'customers',
  'order_status': 'orders',
  'payment_method': 'orders',
  'manufacturer': 'products',
};

export class SQLGeneratorAgent extends LLMAgent<SQLGeneratorInput, SQLGeneratorOutput> {
  definition: AgentDefinition = {
    name: 'sql-generator-agent',
    description: '将结构化意图转换为符合规范的 SQL',
    version: '1.0.0',
    layer: 'execution',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string' },
        entities: { type: 'object' },
        mappedFields: { type: 'array' },
      },
      required: ['intent', 'entities'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string' },
        explanation: { type: 'string' },
      },
    },
  };
  
  constructor(llmClient: LLMClient) {
    super(llmClient, {
      temperature: 0.1,
      maxTokens: 1000,
      maxRetries: 2,
    });
  }
  
  protected async run(input: SQLGeneratorInput, context: AgentContext): Promise<SQLGeneratorOutput> {
    const { intent, entities } = input;
    
    // 规范化字段名
    const normalizedEntities = this.normalizeEntities(entities);
    
    // 如果有 groupBy，生成带 GROUP BY 的 SQL
    if (normalizedEntities.groupBy?.length > 0) {
      return this.generateGroupBySQL(normalizedEntities);
    }
    
    // 否则生成简单聚合 SQL
    return this.generateSimpleSQL(normalizedEntities);
  }
  
  /**
   * 规范化实体字段名
   */
  private normalizeEntities(entities: any): any {
    const normalized = { ...entities };
    
    // 规范化指标
    normalized.metrics = (entities.metrics || []).map((m: any) => {
      const field = typeof m === 'string' ? m : (m.field || m);
      const normalizedField = FIELD_MAPPING[field] || field;
      return {
        field: normalizedField,
        table: FIELD_TABLE_MAPPING[normalizedField] || m.table || 'orders',
        aggregation: m.aggregation || 'SUM',
      };
    });
    
    // 规范化维度
    normalized.dimensions = (entities.dimensions || []).map((d: any) => {
      const field = typeof d === 'string' ? d : (d.field || d);
      const normalizedField = FIELD_MAPPING[field] || field;
      return {
        field: normalizedField,
        table: FIELD_TABLE_MAPPING[normalizedField] || d.table || 'orders',
      };
    });
    
    // 规范化 groupBy
    normalized.groupBy = (entities.groupBy || []).map((g: string) => {
      return FIELD_MAPPING[g] || g;
    });
    
    return normalized;
  }
  
  /**
   * 生成简单聚合 SQL
   */
  private generateSimpleSQL(entities: any): SQLGeneratorOutput {
    const metrics = entities.metrics || [];
    
    if (metrics.length === 0) {
      return {
        sql: 'SELECT 1 LIMIT 1',
        explanation: '无法识别查询内容',
      };
    }
    
    const metric = metrics[0];
    const agg = metric.aggregation || 'SUM';
    const table = metric.table || 'orders';
    const field = metric.field || 'total_amount';
    const alias = agg.toLowerCase();
    
    let sql = '';
    
    if (agg === 'COUNT') {
      sql = `SELECT COUNT(\`${field}\`) AS \`${alias}\` FROM \`${table}\``;
    } else if (agg === 'AVG') {
      sql = `SELECT AVG(\`${field}\`) AS \`${alias}\` FROM \`${table}\``;
    } else if (agg === 'MAX') {
      sql = `SELECT MAX(\`${field}\`) AS \`${alias}\` FROM \`${table}\``;
    } else if (agg === 'MIN') {
      sql = `SELECT MIN(\`${field}\`) AS \`${alias}\` FROM \`${table}\``;
    } else {
      sql = `SELECT SUM(\`${field}\`) AS \`${alias}\` FROM \`${table}\``;
    }
    
    sql += ' LIMIT 100';
    
    return {
      sql,
      explanation: `查询 ${table} 表的 ${field} 字段的 ${agg} 值`,
    };
  }
  
  /**
   * 生成 GROUP BY SQL（支持 JOIN）
   */
  private generateGroupBySQL(entities: any): SQLGeneratorOutput {
    const metrics = entities.metrics || [];
    const groupBy = entities.groupBy || [];
    
    if (metrics.length === 0 || groupBy.length === 0) {
      return this.generateSimpleSQL(entities);
    }
    
    const metric = metrics[0];
    const metricField = metric.field;
    const metricTable = metric.table;
    const metricAgg = metric.aggregation || 'SUM';
    
    const groupField = groupBy[0];
    const groupTable = FIELD_TABLE_MAPPING[groupField] || 'orders';
    
    let sql = '';
    let explanation = '';
    
    // 检查是否需要 JOIN
    if (metricTable === groupTable) {
      // 同一张表，简单 GROUP BY
      sql = `SELECT \`${groupField}\`, ${metricAgg}(\`${metricField}\`) AS \`total\` FROM \`${metricTable}\` GROUP BY \`${groupField}\` ORDER BY \`total\` DESC LIMIT 100`;
      explanation = `按 ${groupField} 分组统计 ${metricField}`;
    } else {
      // 需要 JOIN
      if (metricTable === 'orders' && groupTable === 'customers') {
        // 订单数据按客户维度分组
        sql = `SELECT c.\`${groupField}\`, ${metricAgg}(o.\`${metricField}\`) AS \`total\` FROM \`orders\` o JOIN \`customers\` c ON o.customer_id = c.customer_id GROUP BY c.\`${groupField}\` ORDER BY \`total\` DESC LIMIT 100`;
        explanation = `按客户${groupField}分组统计订单${metricField}`;
      } else if (metricTable === 'orders' && groupTable === 'products') {
        // 订单数据按产品维度分组（需要通过 order_items）
        sql = `SELECT p.\`${groupField}\`, ${metricAgg}(oi.\`total\`) AS \`total\` FROM \`order_items\` oi JOIN \`products\` p ON oi.product_id = p.product_id GROUP BY p.\`${groupField}\` ORDER BY \`total\` DESC LIMIT 100`;
        explanation = `按产品${groupField}分组统计销售额`;
      } else if (groupTable === 'customers') {
        // 客户数据分组
        sql = `SELECT \`${groupField}\`, COUNT(*) AS \`count\` FROM \`customers\` GROUP BY \`${groupField}\` ORDER BY \`count\` DESC LIMIT 100`;
        explanation = `按 ${groupField} 统计客户数量`;
      } else {
        // 默认：尝试简单 GROUP BY
        sql = `SELECT \`${groupField}\`, ${metricAgg}(\`${metricField}\`) AS \`total\` FROM \`${metricTable}\` GROUP BY \`${groupField}\` ORDER BY \`total\` DESC LIMIT 100`;
        explanation = `按 ${groupField} 分组统计`;
      }
    }
    
    return { sql, explanation };
  }
  
  /**
   * 重试：降级到简单 SQL
   */
  async retry(input: SQLGeneratorInput, context: AgentContext, error: any): Promise<AgentResult<SQLGeneratorOutput>> {
    try {
      const normalizedEntities = this.normalizeEntities(input.entities);
      return this.success(this.generateSimpleSQL(normalizedEntities));
    } catch (e) {
      return this.failure(error);
    }
  }
}
