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
import { getSQLTemplateService, TemplateMatchResult } from '../../services/sql-template';
import { getSchemaScanService, TableSchema } from '../../services/schema-scan';
import { QianfanLLMClient, llmConfig } from '../../config/llm';
import { query as dbQuery } from '../../config/database';

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

// 允许的字段名（白名单，防止 SQL 注入）
const ALLOWED_FIELDS = new Set([
  'amount', 'quantity', 'price', 'id', 'hospital_code', 'hospital_name',
  'province', 'city', 'county', 'product_name', 'generic_name', 'brand_name',
  'manufacturer', 'corporate_group', 'category', 'record_date', 'dosage_form',
  'specifications', 'hospital_level', 'total_amount', 'order_id',
  'corporate_group', 'hospital_level', 'customer_id', 'product_id',
]);

function validateFieldName(field: string): string {
  if (ALLOWED_FIELDS.has(field)) {
    return field;
  }
  throw new Error(`不允许的字段名: ${field}`);
}

function sanitizeValue(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

function pushTimeCondition(whereClauses: string[], params: any[], timeRange: any, tablePrefix: string = ''): void {
  const prefix = tablePrefix ? `${tablePrefix}.` : '';
  const dateField = `${prefix}\`record_date\``;

  if (timeRange.expression === 'year' && timeRange.year) {
    whereClauses.push(`YEAR(${dateField}) = ?`);
    params.push(timeRange.year);
    return;
  }

  if (timeRange.expression === 'month' && timeRange.month) {
    whereClauses.push(`MONTH(${dateField}) = ?`);
    params.push(timeRange.month);
    return;
  }

  const yearMatch = timeRange.value?.match(/^YEAR_(\d{4})$/);
  if (yearMatch) {
    whereClauses.push(`YEAR(${dateField}) = ?`);
    params.push(parseInt(yearMatch[1]));
    return;
  }

  const numValue = parseInt(timeRange.value) || 30;
  const unit = timeRange.unit?.toUpperCase() || timeRange.type?.toUpperCase() || 'DAY';
  let dateFunc = '';

  switch (unit) {
    case 'DAY':
      dateFunc = `DATE_SUB(CURDATE(), INTERVAL ? DAY)`;
      break;
    case 'WEEK':
      dateFunc = `DATE_SUB(CURDATE(), INTERVAL ? WEEK)`;
      break;
    case 'MONTH':
      dateFunc = `DATE_SUB(CURDATE(), INTERVAL ? MONTH)`;
      break;
    case 'QUARTER':
      dateFunc = `DATE_SUB(CURDATE(), INTERVAL ? MONTH)`;
      break;
    case 'YEAR':
      dateFunc = `DATE_SUB(CURDATE(), INTERVAL ? YEAR)`;
      break;
    default:
      dateFunc = `DATE_SUB(CURDATE(), INTERVAL ? DAY)`;
  }

  if (timeRange.operator === '=') {
    if (unit === 'DAY' && numValue === 0) {
      whereClauses.push(`DATE(${dateField}) = CURDATE()`);
    } else {
      whereClauses.push(`DATE(${dateField}) = ${dateFunc}`);
      params.push(numValue);
    }
  } else {
    whereClauses.push(`DATE(${dateField}) >= ${dateFunc}`);
    params.push(numValue);
  }
}

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
      temperature: 0.3,
      maxTokens: 10000,
      maxRetries: 2,
    });
  }
  
  protected async run(input: SQLGeneratorInput, context: AgentContext): Promise<SQLGeneratorOutput> {
    const { intent, entities } = input;
    console.log('[SQLGenerator] 开始生成SQL, intent:', intent);
    console.log('[SQLGenerator] entities:', JSON.stringify(entities));

    try {
      const scanService = getSchemaScanService();
      const templateService = getSQLTemplateService();

      const [schemaTables, templateResults] = await Promise.all([
        scanService.getDatasourceSchema(context.datasourceId!),
        templateService.findSimilarTemplates(intent, 3, context.datasourceId),
      ]);

      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = await this.buildUserPrompt(intent, entities, schemaTables, templateResults);

      console.log('[SQLGenerator] Schema 表数量:', schemaTables.length);
      if (schemaTables.length > 0) {
        console.log('[SQLGenerator] 第一个表的字段:', JSON.stringify(schemaTables[0].columns.map(c => c.columnName)));
      }
      console.log('[SQLGenerator] User Prompt 前500字符:', userPrompt.substring(0, 500));

      console.log('[SQLGenerator] 调用 LLM 生成 SQL...');
      const llmClient = new QianfanLLMClient();
      const response = await llmClient.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 10000,
      });

      const sqlContent = this.extractSQL(response.content);
      if (sqlContent) {
        console.log('[SQLGenerator] LLM 生成的 SQL:', sqlContent);
        return {
          sql: sqlContent,
          explanation: '由大模型生成',
          estimatedRows: 100,
        };
      }

      throw new Error('LLM 未返回有效的 SQL');
    } catch (error: any) {
      console.error('[SQLGenerator] LLM 生成失败，降级到规则生成:', error.message);
      return this.generateFallbackSQL(entities);
    }
  }

  private buildSystemPrompt(): string {
    return `你是一个专业的 SQL 生成助手，擅长根据用户需求生成准确的 MySQL 查询语句。

## 严格规则（必须遵守）
1. 只生成 SELECT 查询语句，禁止生成 INSERT、UPDATE、DELETE 等操作
2. 使用参数化查询，所有用户输入的值用 ? 占位符
3. 表名和字段名用反引号包裹
4. **必须严格按照下方"数据库表结构"中列出的字段名生成 SQL，不能自行推断或使用未列出的字段名**
5. 如果用户提到的指标字段在 schema 中不存在，必须选择最接近的字段替代
6. 时间字段使用 record_date
7. 返回结果必须包含在 \`\`\`sql\`\`\` 代码块中

## 输出格式
\`\`\`sql
SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT ...
\`\`\``;
  }

  private async buildUserPrompt(
    intent: string,
    entities: any,
    schemaTables: TableSchema[],
    templateResults: TemplateMatchResult[]
  ): Promise<string> {
    let prompt = `## 用户需求\n${intent}\n\n`;

    prompt += `## 解析后的实体\n`;
    prompt += `- 指标: ${JSON.stringify(entities.metrics, null, 2)}\n`;
    prompt += `- 维度: ${JSON.stringify(entities.dimensions, null, 2)}\n`;
    prompt += `- 筛选: ${JSON.stringify(entities.filters, null, 2)}\n`;
    prompt += `- 分组: ${JSON.stringify(entities.groupBy, null, 2)}\n`;
    prompt += `- 时间范围: ${JSON.stringify(entities.timeRange, null, 2)}\n`;
    prompt += `- 限制: ${entities.limit || 100}\n\n`;

    prompt += `## 数据库表结构（SQL必须只使用这些字段）\n`;
    prompt += `**警告：生成 SQL 时只能使用下方列出的字段名，禁止使用未列出的字段！**\n\n`;
    for (const table of schemaTables) {
      prompt += `### ${table.tableName}`;
      if (table.tableComment) prompt += ` (${table.tableComment})`;
      prompt += `\n`;
      for (const col of table.columns) {
        prompt += `- ${col.columnName}: ${col.columnType}`;
        if (col.columnComment) prompt += ` (${col.columnComment})`;
        prompt += '\n';
      }
      prompt += `\n`;
    }

    if (templateResults.length > 0) {
      prompt += `## 参考模板\n`;
      for (const match of templateResults) {
        if (match.score > 0.7) {
          prompt += `- ${match.template.name} (相似度: ${(match.score * 100).toFixed(0)}%): ${match.template.sql_template}\n`;
        }
      }
    }

    return prompt;
  }

  private extractSQL(content: string): string | null {
    const sqlMatch = content.match(/```sql\s*([\s\S]*?)```/);
    if (sqlMatch) {
      return sqlMatch[1].trim();
    }
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('select')) {
        return trimmed;
      }
    }
    return null;
  }

  private generateFallbackSQL(entities: any): SQLGeneratorOutput {
    console.log('[SQLGenerator] 使用规则降级生成 SQL');
    if (entities.groupBy && entities.groupBy.length > 0) {
      return this.generateGroupBySQL(entities);
    }
    return this.generateSimpleSQL(entities);
  }

  private applyTemplate(template: any, entities: any): { sql: string } {
    let sql = template.sql_template;

    sql = sql.replace(/\{\{table\}\}/g, template.dimensions?.split(',')[0] || DEFAULT_TABLE);
    sql = sql.replace(/\{\{date_field\}\}/g, 'record_date');
    sql = sql.replace(/\{\{metric\}\}/g, entities.metrics?.[0]?.field || 'quantity');
    sql = sql.replace(/\{\{dimension\}\}/g, entities.groupBy?.[0] || 'province');

    if (entities.filters?.corporate_group) {
      sql = sql.replace(/\{\{group_name\}\}/g, entities.filters.corporate_group);
    }

    if (entities.timeRange?.year) {
      sql = sql.replace(/\{\{start_date\}\}/g, `${entities.timeRange.year}-01-01`);
      sql = sql.replace(/\{\{end_date\}\}/g, `${entities.timeRange.year}-12-31`);
    } else {
      sql = sql.replace(/\{\{start_date\}\}/g, '2024-01-01');
      sql = sql.replace(/\{\{end_date\}\}/g, '2024-12-31');
    }

    if (entities.limit) {
      if (!sql.includes('LIMIT')) {
        sql += ` LIMIT ${Math.min(entities.limit, 1000)}`;
      }
    } else {
      sql += ' LIMIT 100';
    }

    return { sql };
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
    
    // 构建 WHERE - 使用参数化查询
    const whereClauses: string[] = [];
    const params: any[] = [];
    
    // 添加筛选条件
    for (const [filterField, filterValue] of Object.entries(filters)) {
      validateFieldName(filterField);
      whereClauses.push(`\`${filterField}\` = ?`);
      params.push(sanitizeValue(filterValue));
    }
    
    // 添加时间条件
    if (entities.timeRange) {
      const timeCondition = this.buildTimeCondition(entities.timeRange, '');
      if (timeCondition) {
        whereClauses.push(timeCondition);
      }
    }
    
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    // 构建 LIMIT - MySQL LIMIT 不支持参数化，直接拼接
    const limit = Math.min(entities.limit || 100, 1000);
    sql += ` LIMIT ${limit}`;
    
    let explanation = `查询 ${metricTable} 表的 ${field} 字段的 ${agg} 值`;
    if (entities.timeRange) {
      explanation += `，时间范围：${entities.timeRange.expression}`;
    }
    
    return { sql, params, explanation };
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
      const tc = this.buildTimeCondition(entities.timeRange, metricTable.charAt(0));
      if (tc) whereClauses.push(tc);
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
      const tc = this.buildTimeCondition(entities.timeRange, table);
      if (tc) whereClauses.push(tc);
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
      const tc = this.buildTimeCondition(entities.timeRange, table);
      if (tc) whereClauses.push(tc);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    sql += ` GROUP BY \`${groupField}\``;
    
    // ORDER BY
    const direction = entities.orderBy?.direction || 'DESC';
    sql += ` ORDER BY \`total\` ${direction}`;
    
    sql += ` LIMIT ${Math.min(entities.limit || 100, 1000)}`;
    
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
        const tc = this.buildTimeCondition(entities.timeRange, '');
        if (tc) whereClauses.push(tc);
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
      const tc = this.buildTimeCondition(entities.timeRange, table);
      if (tc) clauses.push(tc);
    }
    
    return clauses;
  }
  
  /**
   * 构建时间条件
   */
  private buildTimeCondition(timeRange: any, tablePrefix: string = ''): string | null {
    const prefix = tablePrefix ? `${tablePrefix}.` : '';
    const dateField = `${prefix}\`record_date\``;

    // 年份
    if (timeRange.expression === 'year' && timeRange.year) {
      return `YEAR(${dateField}) = ${parseInt(timeRange.year)}`;
    }

    // 月份
    if (timeRange.expression === 'month' && timeRange.month) {
      return `MONTH(${dateField}) = ${parseInt(timeRange.month)}`;
    }

    // YEAR_2024 格式
    const yearMatch = timeRange.value?.match(/^YEAR_(\d{4})$/);
    if (yearMatch) {
      return `YEAR(${dateField}) = ${parseInt(yearMatch[1])}`;
    }

    // 相对时间
    const unit = timeRange.unit?.toUpperCase() || timeRange.type?.toUpperCase() || 'DAY';
    const value = parseInt(timeRange.value) || parseInt(timeRange.value) || 30;

    let dateFunc = '';
    switch (unit) {
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

    if (timeRange.operator === '=') {
      if (unit === 'DAY' && value === 0) {
        return `DATE(${dateField}) = CURDATE()`;
      }
      return `DATE(${dateField}) = ${dateFunc}`;
    } else {
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
