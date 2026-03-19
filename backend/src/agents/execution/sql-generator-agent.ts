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

// 字段所属表映射（后备使用，优先使用输入中的 table 字段）
// 字段所属表映射 - 医疗产品采购数据
const DEFAULT_TABLE = 't_ai_medical_product_records';

const FIELD_TABLE_MAPPING: Record<string, string> = {
  'amount': DEFAULT_TABLE,
  'quantity': DEFAULT_TABLE,
  'price': DEFAULT_TABLE,
  'id': DEFAULT_TABLE,
  'hospital_code': DEFAULT_TABLE,
  'hospital_name': DEFAULT_TABLE,
  'province': DEFAULT_TABLE,
  'city': DEFAULT_TABLE,
  'county': DEFAULT_TABLE,
  'product_name': DEFAULT_TABLE,
  'generic_name': DEFAULT_TABLE,
  'brand_name': DEFAULT_TABLE,
  'manufacturer': DEFAULT_TABLE,
  'corporate_group': DEFAULT_TABLE,
  'category': DEFAULT_TABLE,
  'record_date': DEFAULT_TABLE,
  'dosage_form': DEFAULT_TABLE,
  'specifications': DEFAULT_TABLE,
  'hospital_level': DEFAULT_TABLE,
  'total_amount': DEFAULT_TABLE,
  'order_id': DEFAULT_TABLE,
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
   * 支持跨表筛选自动 JOIN
   */
  private generateSimpleSQL(entities: any): SQLGeneratorOutput {
    const metrics = entities.metrics || [];
    const filters = entities.filters || {};
    
    if (metrics.length === 0) {
      return {
        sql: 'SELECT 1 AS result LIMIT 1',
        explanation: '无法识别查询内容',
      };
    }
    
    const metric = metrics[0];
    const agg = metric.aggregation || 'SUM';
    const metricTable = metric.table || FIELD_TABLE_MAPPING[metric.field] || DEFAULT_TABLE;
    const field = metric.field;
    const alias = agg.toLowerCase();
    
    // 检查筛选条件是否涉及跨表
    const filterTables = new Set<string>();
    for (const filterField of Object.keys(filters)) {
      const filterTable = FIELD_TABLE_MAPPING[filterField];
      if (filterTable && filterTable !== metricTable) {
        filterTables.add(filterTable);
      }
    }
    
    // 需要跨表 JOIN
    if (filterTables.size > 0) {
      return this.generateCrossTableSQL(metric, entities, Array.from(filterTables));
    }
    
    // 同表查询
    let sql = `SELECT ${agg}(\`${field}\`) AS \`${alias}\``;
    sql += ` FROM \`${metricTable}\``;
    
    // 构建 WHERE
    const whereClauses: string[] = [];
    
    // 添加筛选条件
    for (const [filterField, filterValue] of Object.entries(filters)) {
      whereClauses.push(`\`${filterField}\` = '${filterValue}'`);
    }
    
    // 添加时间条件
    if (entities.timeRange) {
      whereClauses.push(this.buildTimeCondition(entities.timeRange, ''));
    }
    
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    // 构建 LIMIT
    sql += ` LIMIT ${entities.limit || 100}`;
    
    let explanation = `查询 ${metricTable} 表的 ${field} 字段的 ${agg} 值`;
    if (entities.timeRange) {
      explanation += `，时间范围：${entities.timeRange.expression}`;
    }
    
    return { sql, explanation };
  }
  
  /**
   * 生成跨表查询 SQL
   */
  private generateCrossTableSQL(
    metric: { field: string; table?: string; aggregation?: string },
    entities: any,
    joinTables: string[]
  ): SQLGeneratorOutput {
    const agg = metric.aggregation || 'SUM';
    const metricTable = metric.table || FIELD_TABLE_MAPPING[metric.field] || DEFAULT_TABLE;
    const field = metric.field;
    const alias = agg.toLowerCase();
    const filters = entities.filters || {};
    
    let sql = `SELECT ${agg}(o.\`${field}\`) AS \`${alias}\``;
    let explanation = `跨表查询：`;
    
    // 构建 JOIN
    const joins: string[] = [];
    const whereClauses: string[] = [];
    
    for (const joinTable of joinTables) {
      if (joinTable === 'customers') {
        joins.push('JOIN `customers` c ON o.customer_id = c.customer_id');
        explanation += '关联客户表';
        
        // 添加该表的筛选条件
        for (const [filterField, filterValue] of Object.entries(filters)) {
          if (FIELD_TABLE_MAPPING[filterField] === 'customers') {
            whereClauses.push(`c.\`${filterField}\` = '${filterValue}'`);
          }
        }
      } else if (joinTable === 'products') {
        joins.push('JOIN `order_items` oi ON o.order_id = oi.order_id');
        joins.push('JOIN `products` p ON oi.product_id = p.product_id');
        explanation += '关联产品表';
        
        for (const [filterField, filterValue] of Object.entries(filters)) {
          if (FIELD_TABLE_MAPPING[filterField] === 'products') {
            whereClauses.push(`p.\`${filterField}\` = '${filterValue}'`);
          }
        }
      }
    }
    
    // 添加主表筛选条件
    for (const [filterField, filterValue] of Object.entries(filters)) {
      if (FIELD_TABLE_MAPPING[filterField] === metricTable || !FIELD_TABLE_MAPPING[filterField]) {
        whereClauses.push(`o.\`${filterField}\` = '${filterValue}'`);
      }
    }
    
    // 时间范围（跨表查询也要添加时间条件）
    if (entities.timeRange) {
      whereClauses.push(this.buildTimeCondition(entities.timeRange, 'o'));
      explanation += `，时间范围：${entities.timeRange.expression}`;
    }
    
    // 组装 SQL
    sql += ` FROM \`${metricTable}\` ${metricTable.charAt(0)} ${joins.join(' ')}`;
    
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    sql += ` LIMIT ${entities.limit || 100}`;
    
    return { sql, explanation };
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
    const metricTable = metric.table || FIELD_TABLE_MAPPING[metricField] || DEFAULT_TABLE;
    const metricAgg = metric.aggregation || 'SUM';
    
    const groupField = groupBy[0];
    
    // 检查是否是时间分组
    const timeGroupUnits = ['month', 'day', 'week', 'year'];
    if (timeGroupUnits.includes(groupField)) {
      return this.generateTimeGroupSQL(metricField, metricAgg, metricTable, groupField, filters, entities);
    }
    
    const groupTable = FIELD_TABLE_MAPPING[groupField] || 'orders';
    const groupTable = FIELD_TABLE_MAPPING[groupField] || DEFAULT_TABLE;
    
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
   * 生成时间分组 SQL
   */
  private generateTimeGroupSQL(
    metricField: string,
    metricAgg: string,
    table: string,
    timeUnit: string,
    filters: Record<string, any>,
    entities: any
  ): SQLGeneratorOutput {
    // 时间格式映射
    const dateFormatMap: Record<string, string> = {
      'month': '%Y-%m',
      'day': '%Y-%m-%d',
      'week': '%Y-%u',
      'year': '%Y',
    };
    
    const dateFormat = dateFormatMap[timeUnit] || '%Y-%m';
    const alias = timeUnit;
    
    let sql = `SELECT DATE_FORMAT(\`order_date\`, '${dateFormat}') AS \`${alias}\`, ${metricAgg}(\`${metricField}\`) AS \`total\` FROM \`${table}\``;
    
    // WHERE 条件
    const whereClauses: string[] = [];
    for (const [field, value] of Object.entries(filters)) {
      whereClauses.push(`\`${field}\` = '${value}'`);
    }
    
    // 时间范围
    if (entities.timeRange) {
      whereClauses.push(this.buildTimeCondition(entities.timeRange, table));
    }
    
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    sql += ` GROUP BY \`${alias}\``;
    
    // ORDER BY
    sql += ` ORDER BY \`${alias}\` ASC`;
    
    sql += ` LIMIT ${entities.limit || 100}`;
    
    return {
      sql,
      explanation: `按${timeUnit === 'month' ? '月' : timeUnit === 'day' ? '天' : timeUnit}分组统计`,
    };
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
    
    if (metricTable === DEFAULT_TABLE && groupTable === DEFAULT_TABLE) {
      sql = `SELECT \`${groupField}\`, ${metricAgg}(\`${metricField}\`) AS \`total\` FROM \`${metricTable}\``;
      
      const whereClauses: string[] = [];
      for (const [field, value] of Object.entries(filters)) {
        whereClauses.push(`\`${field}\` = '${value}'`);
      }
      
      if (entities.timeRange) {
        whereClauses.push(this.buildTimeCondition(entities.timeRange, ''));
      }
      
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      
      sql += ` GROUP BY \`${groupField}\``;
      
    } else {
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
    const dateField = `${prefix}\`order_date\``;
    
    // 年份
    if (timeRange.expression === 'year') {
      return `YEAR(${dateField}) = ${timeRange.year}`;
    }
    
    // 月份
    if (timeRange.expression === 'month') {
      return `MONTH(${dateField}) = ${timeRange.month}`;
    }
    
    // 新格式：{ type: "relative", value: "YEAR_1" }
    if (timeRange.type === 'relative' && typeof timeRange.value === 'string') {
      const [unit, val] = timeRange.value.split('_');
      const value = parseInt(val) || 1;
      
      let dateFunc = '';
      switch (unit.toUpperCase()) {
        case 'DAY':
          dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} DAY)`;
          break;
        case 'WEEK':
          dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} WEEK)`;
          break;
        case 'MONTH':
          dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} MONTH)`;
          break;
        case 'QUARTER':
          dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value * 3} MONTH)`;
          break;
        case 'YEAR':
          dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} YEAR)`;
          break;
        default:
          dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} DAY)`;
      }
      
      return `DATE(${dateField}) >= ${dateFunc}`;
    }
    
    // 旧格式：{ unit, value, operator }
    const { unit, value, operator } = timeRange;
    
    // 根据时间单位构建条件
    let dateFunc = '';
    switch (unit?.toUpperCase()) {
      case 'DAY':
        dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} DAY)`;
        break;
      case 'WEEK':
        dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} WEEK)`;
        break;
      case 'MONTH':
        dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} MONTH)`;
        break;
      case 'QUARTER':
        dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value * 3} MONTH)`;
        break;
      case 'YEAR':
        dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value} YEAR)`;
        break;
      default:
        dateFunc = `DATE_SUB(CURDATE(), INTERVAL ${value || 30} DAY)`;
    }
    
    if (operator === '=') {
      // 等于某个时间点
      if (unit.toUpperCase() === 'DAY' && value === 0) {
        return `DATE(${dateField}) = CURDATE()`;
      }
      return `DATE(${dateField}) = ${dateFunc}`;
    } else {
      // 大于等于（最近N天/月/年）
      return `DATE(${dateField}) >= ${dateFunc}`;
    }
  }
  
  /**
   * 重试：降级到简单 SQL
   */
  async retry(input: SQLGeneratorInput, context: AgentContext, error: any): Promise<AgentResult<SQLGeneratorOutput>> {
    return this.success(this.generateSimpleSQL(input.entities));
  }
}
