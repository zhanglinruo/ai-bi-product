/**
 * SQL Generator Agent - SQL 生成器
 * 
 * 负责将结构化意图转换为 SQL
 * 支持：多条件筛选、时间范围、排序、JOIN
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
    orderBy?: { direction: string } | null;
    limit?: number;
    timeRange?: any;
  };
  mappedFields?: any[];
}

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
  'account_status': 'customers',
  'manufacturer': 'products',
};

export class SQLGeneratorAgent extends LLMAgent<SQLGeneratorInput, SQLGeneratorOutput> {
  definition: AgentDefinition = {
    name: 'sql-generator-agent',
    description: '将结构化意图转换为符合规范的 SQL',
    version: '2.0.0',
    layer: 'execution',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string' },
        entities: { type: 'object' },
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
    const { entities } = input;
    
    // 如果有 groupBy，生成 GROUP BY SQL
    if (entities.groupBy && entities.groupBy.length > 0) {
      return this.generateGroupBySQL(entities);
    }
    
    // 否则生成简单聚合 SQL
    return this.generateSimpleSQL(entities);
  }
  
  /**
   * 生成简单聚合 SQL
   */
  private generateSimpleSQL(entities: any): SQLGeneratorOutput {
    const metrics = entities.metrics || [];
    
    if (metrics.length === 0) {
      return {
        sql: 'SELECT 1 AS result LIMIT 1',
        explanation: '无法识别查询内容',
      };
    }
    
    const metric = metrics[0];
    const agg = metric.aggregation || 'SUM';
    const table = metric.table || FIELD_TABLE_MAPPING[metric.field] || 'orders';
    const field = metric.field;
    const alias = agg.toLowerCase();
    
    // 构建 SELECT
    let sql = `SELECT ${agg}(\`${field}\`) AS \`${alias}\``;
    
    // 构建 FROM
    sql += ` FROM \`${table}\``;
    
    // 构建 WHERE
    const whereClauses = this.buildWhereClauses(entities, table);
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    // 构建 ORDER BY
    if (entities.orderBy) {
      sql += ` ORDER BY \`${alias}\` ${entities.orderBy.direction}`;
    }
    
    // 构建 LIMIT
    sql += ` LIMIT ${entities.limit || 100}`;
    
    return {
      sql,
      explanation: `查询 ${table} 表的 ${field} 字段的 ${agg} 值`,
    };
  }
  
  /**
   * 生成 GROUP BY SQL
   */
  private generateGroupBySQL(entities: any): SQLGeneratorOutput {
    const metrics = entities.metrics || [];
    const groupBy = entities.groupBy || [];
    const filters = entities.filters || {};
    
    if (metrics.length === 0 || groupBy.length === 0) {
      return this.generateSimpleSQL(entities);
    }
    
    const metric = metrics[0];
    const metricField = metric.field;
    const metricTable = metric.table || FIELD_TABLE_MAPPING[metricField] || 'orders';
    const metricAgg = metric.aggregation || 'SUM';
    
    const groupField = groupBy[0];
    const groupTable = FIELD_TABLE_MAPPING[groupField] || 'orders';
    
    let sql = '';
    let explanation = '';
    
    // 同一张表
    if (metricTable === groupTable) {
      sql = this.buildSingleTableGroupSQL(metricField, metricAgg, metricTable, groupField, filters, entities);
      explanation = `按 ${groupField} 分组统计 ${metricField}`;
    } else {
      // 需要 JOIN
      sql = this.buildJoinGroupSQL(metricField, metricAgg, metricTable, groupField, groupTable, filters, entities);
      explanation = `按 ${groupField} 分组统计（跨表关联）`;
    }
    
    return { sql, explanation };
  }
  
  /**
   * 构建单表 GROUP BY SQL
   */
  private buildSingleTableGroupSQL(
    metricField: string,
    metricAgg: string,
    table: string,
    groupField: string,
    filters: Record<string, any>,
    entities: any
  ): string {
    let sql = `SELECT \`${groupField}\`, ${metricAgg}(\`${metricField}\`) AS \`total\` FROM \`${table}\``;
    
    // WHERE 条件（排除分组字段）
    const whereClauses: string[] = [];
    for (const [field, value] of Object.entries(filters)) {
      if (field !== groupField) {
        whereClauses.push(`\`${field}\` = '${value}'`);
      }
    }
    
    // 时间范围
    if (entities.timeRange) {
      whereClauses.push(this.buildTimeCondition(entities.timeRange, table));
    }
    
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    sql += ` GROUP BY \`${groupField}\``;
    
    // ORDER BY
    const direction = entities.orderBy?.direction || 'DESC';
    sql += ` ORDER BY \`total\` ${direction}`;
    
    sql += ` LIMIT ${entities.limit || 100}`;
    
    return sql;
  }
  
  /**
   * 构建 JOIN GROUP BY SQL
   */
  private buildJoinGroupSQL(
    metricField: string,
    metricAgg: string,
    metricTable: string,
    groupField: string,
    groupTable: string,
    filters: Record<string, any>,
    entities: any
  ): string {
    let sql = '';
    
    if (metricTable === 'orders' && groupTable === 'customers') {
      sql = `SELECT c.\`${groupField}\`, ${metricAgg}(o.\`${metricField}\`) AS \`total\` FROM \`orders\` o JOIN \`customers\` c ON o.customer_id = c.customer_id`;
      
      // WHERE 条件
      const whereClauses: string[] = [];
      for (const [field, value] of Object.entries(filters)) {
        if (field === groupField) {
          whereClauses.push(`c.\`${field}\` = '${value}'`);
        } else if (FIELD_TABLE_MAPPING[field] === 'customers') {
          whereClauses.push(`c.\`${field}\` = '${value}'`);
        } else {
          whereClauses.push(`o.\`${field}\` = '${value}'`);
        }
      }
      
      if (entities.timeRange) {
        whereClauses.push(this.buildTimeCondition(entities.timeRange, 'o'));
      }
      
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      
      sql += ` GROUP BY c.\`${groupField}\``;
      
    } else if (metricTable === 'orders' && groupTable === 'products') {
      sql = `SELECT p.\`${groupField}\`, SUM(oi.total) AS \`total\` FROM \`order_items\` oi JOIN \`products\` p ON oi.product_id = p.product_id`;
      
      // WHERE 条件
      const whereClauses: string[] = [];
      for (const [field, value] of Object.entries(filters)) {
        if (field === groupField) {
          whereClauses.push(`p.\`${field}\` = '${value}'`);
        }
      }
      
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      
      sql += ` GROUP BY p.\`${groupField}\``;
      
    } else if (groupTable === 'customers') {
      // 客户统计
      sql = `SELECT \`${groupField}\`, COUNT(*) AS \`count\` FROM \`customers\``;
      
      const whereClauses: string[] = [];
      for (const [field, value] of Object.entries(filters)) {
        whereClauses.push(`\`${field}\` = '${value}'`);
      }
      
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      
      sql += ` GROUP BY \`${groupField}\``;
    } else {
      // 默认：简单 GROUP BY
      sql = `SELECT \`${groupField}\`, ${metricAgg}(\`${metricField}\`) AS \`total\` FROM \`${metricTable}\` GROUP BY \`${groupField}\``;
    }
    
    // ORDER BY
    const direction = entities.orderBy?.direction || 'DESC';
    sql += ` ORDER BY \`total\` ${direction}`;
    
    sql += ` LIMIT ${entities.limit || 100}`;
    
    return sql;
  }
  
  /**
   * 构建 WHERE 条件
   */
  private buildWhereClauses(entities: any, table: string): string[] {
    const clauses: string[] = [];
    
    // 筛选条件
    for (const [field, value] of Object.entries(entities.filters || {})) {
      clauses.push(`\`${field}\` = '${value}'`);
    }
    
    // 时间范围
    if (entities.timeRange) {
      clauses.push(this.buildTimeCondition(entities.timeRange, table));
    }
    
    return clauses;
  }
  
  /**
   * 构建时间条件
   */
  private buildTimeCondition(timeRange: any, tablePrefix: string = ''): string {
    const prefix = tablePrefix ? `${tablePrefix}.` : '';
    
    if (timeRange.expression === 'year') {
      return `YEAR(${prefix}order_date) = ${timeRange.year}`;
    }
    
    if (timeRange.expression === 'month') {
      return `MONTH(${prefix}order_date) = ${timeRange.month}`;
    }
    
    const { unit, value, operator } = timeRange;
    const dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} ${unit})`;
    
    if (operator === '=') {
      return `DATE(${prefix}order_date) = ${dateFunc}`;
    } else {
      return `DATE(${prefix}order_date) >= ${dateFunc}`;
    }
  }
  
  /**
   * 重试：降级到简单 SQL
   */
  async retry(input: SQLGeneratorInput, context: AgentContext, error: any): Promise<AgentResult<SQLGeneratorOutput>> {
    return this.success(this.generateSimpleSQL(input.entities));
  }
}
