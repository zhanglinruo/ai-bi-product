/**
 * LLM 语义分析服务
 * 
 * 使用 LLM 自动分析数据库字段，生成语义信息
 */

import { QianfanLLMClient } from '../config/llm';

export interface FieldSemantic {
  fieldName: string;
  fieldType: string;
  isMetric: boolean;
  isDimension: boolean;
  semanticName: string;
  semanticDescription: string;
  aggregationType?: 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN';
  aliases: string[];
}

export interface TableSemantic {
  tableName: string;
  tableComment: string;
  semanticName: string;
  semanticDescription: string;
  fields: FieldSemantic[];
}

export class LLMSemanticService {
  private llmClient: QianfanLLMClient;

  constructor(llmClient: QianfanLLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * 分析表结构，生成语义信息
   */
  async analyzeTable(
    tableName: string,
    tableComment: string,
    columns: Array<{
      columnName: string;
      columnType: string;
      columnComment: string;
    }>
  ): Promise<TableSemantic> {
    // 构建 prompt
    const prompt = this.buildPrompt(tableName, tableComment, columns);

    try {
      // 调用 LLM
      const response = await this.llmClient.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 2000,
      });

      const content = response.content || '';
      
      // 解析 JSON 响应
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.validateAndMerge(tableName, tableComment, columns, parsed);
      }
    } catch (error: any) {
      console.warn(`[LLMSemantic] 分析表 ${tableName} 失败:`, error.message);
    }

    // 降级：使用规则推断
    return this.fallbackAnalysis(tableName, tableComment, columns);
  }

  /**
   * 构建 LLM prompt
   */
  private buildPrompt(
    tableName: string,
    tableComment: string,
    columns: Array<{ columnName: string; columnType: string; columnComment: string }>
  ): string {
    const columnList = columns
      .map(c => `- ${c.columnName} (${c.columnType})${c.columnComment ? `: ${c.columnComment}` : ''}`)
      .join('\n');

    return `分析以下数据库表结构，生成语义映射信息。

表名: ${tableName}
${tableComment ? `表注释: ${tableComment}` : ''}

字段列表:
${columnList}

请以 JSON 格式返回以下信息：
{
  "semanticName": "表的中文业务名称",
  "semanticDescription": "表的业务含义描述",
  "fields": [
    {
      "fieldName": "字段名",
      "isMetric": true/false,
      "isDimension": true/false,
      "semanticName": "字段的中文业务名称",
      "semanticDescription": "字段的业务含义",
      "aggregationType": "SUM/COUNT/AVG/MAX/MIN 或 null",
      "aliases": ["别名1", "别名2"]
    }
  ]
}

规则：
1. 指标(isMetric=true): 可聚合的数值字段，如金额、数量、计数等
2. 维度(isDimension=true): 用于分组的字段，如类型、状态、时间、地区等
3. 一个字段可以同时是指标和维度
4. aggregationType: 如果是指标，建议的聚合方式
5. aliases: 字段的常见同义词或别名

只返回 JSON，不要其他内容。`;
  }

  /**
   * 验证并合并 LLM 结果
   */
  private validateAndMerge(
    tableName: string,
    tableComment: string,
    columns: Array<{ columnName: string; columnType: string; columnComment: string }>,
    llmResult: any
  ): TableSemantic {
    const fields: FieldSemantic[] = columns.map(col => {
      // 从 LLM 结果中查找对应字段
      const llmField = llmResult.fields?.find((f: any) => f.fieldName === col.columnName);
      
      if (llmField) {
        return {
          fieldName: col.columnName,
          fieldType: col.columnType,
          isMetric: llmField.isMetric ?? false,
          isDimension: llmField.isDimension ?? false,
          semanticName: llmField.semanticName || col.columnName,
          semanticDescription: llmField.semanticDescription || col.columnComment || '',
          aggregationType: llmField.aggregationType,
          aliases: llmField.aliases || [],
        };
      }

      // 没有匹配，使用规则推断
      const inferred = this.inferFieldType(col.columnName, col.columnType);
      return {
        fieldName: col.columnName,
        fieldType: col.columnType,
        ...inferred,
        semanticName: col.columnName,
        semanticDescription: col.columnComment || '',
        aliases: [],
      };
    });

    return {
      tableName,
      tableComment,
      semanticName: llmResult.semanticName || tableName,
      semanticDescription: llmResult.semanticDescription || tableComment,
      fields,
    };
  }

  /**
   * 降级分析（规则推断）
   */
  private fallbackAnalysis(
    tableName: string,
    tableComment: string,
    columns: Array<{ columnName: string; columnType: string; columnComment: string }>
  ): TableSemantic {
    const fields: FieldSemantic[] = columns.map(col => {
      const inferred = this.inferFieldType(col.columnName, col.columnType);
      return {
        fieldName: col.columnName,
        fieldType: col.columnType,
        ...inferred,
        semanticName: this.generateSemanticName(col.columnName),
        semanticDescription: col.columnComment || '',
        aliases: [],
      };
    });

    return {
      tableName,
      tableComment,
      semanticName: this.generateSemanticName(tableName),
      semanticDescription: tableComment,
      fields,
    };
  }

  /**
   * 规则推断字段类型
   */
  private inferFieldType(columnName: string, columnType: string): {
    isMetric: boolean;
    isDimension: boolean;
    aggregationType?: 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN';
  } {
    const name = columnName.toLowerCase();
    const type = columnType.toLowerCase();

    // 数值类型
    const isNumeric = /int|decimal|double|float|numeric|number/.test(type);

    // 指标关键词
    const metricKeywords = /amount|total|sum|count|avg|max|min|price|cost|revenue|sales|quantity|qty|num|money|fee|rate|percent|ratio/;
    const isMetric = isNumeric && metricKeywords.test(name);

    // 维度关键词
    const dimensionKeywords = /name|type|category|status|code|id|date|time|year|month|day|region|area|city|country|user|customer|product|brand|channel/;
    const isDimension = dimensionKeywords.test(name) || !isNumeric;

    // 聚合类型
    let aggregationType: 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN' | undefined;
    if (isMetric) {
      if (/count|num|qty|quantity/.test(name)) {
        aggregationType = 'COUNT';
      } else if (/avg|average|rate|ratio|percent/.test(name)) {
        aggregationType = 'AVG';
      } else if (/max|maximum|highest/.test(name)) {
        aggregationType = 'MAX';
      } else if (/min|minimum|lowest/.test(name)) {
        aggregationType = 'MIN';
      } else {
        aggregationType = 'SUM';
      }
    }

    return { isMetric, isDimension, aggregationType };
  }

  /**
   * 生成语义名称
   */
  private generateSemanticName(name: string): string {
    // 常见字段名映射
    const nameMap: Record<string, string> = {
      'total_amount': '总金额',
      'order_id': '订单ID',
      'customer_id': '客户ID',
      'customer_type': '客户类型',
      'order_date': '订单日期',
      'order_status': '订单状态',
      'payment_method': '支付方式',
      'product_id': '产品ID',
      'category': '产品类别',
      'manufacturer': '制造商',
      'city': '城市',
      'country': '国家',
      'create_time': '创建时间',
      'update_time': '更新时间',
    };

    return nameMap[name.toLowerCase()] || name;
  }

  /**
   * 批量分析多个表
   */
  async analyzeTables(
    tables: Array<{
      tableName: string;
      tableComment: string;
      columns: Array<{ columnName: string; columnType: string; columnComment: string }>;
    }>,
    concurrency: number = 3
  ): Promise<TableSemantic[]> {
    const results: TableSemantic[] = [];
    
    // 分批并发处理
    for (let i = 0; i < tables.length; i += concurrency) {
      const batch = tables.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(table => this.analyzeTable(table.tableName, table.tableComment, table.columns))
      );
      results.push(...batchResults);
      
      console.log(`[LLMSemantic] 已分析 ${results.length}/${tables.length} 个表`);
    }

    return results;
  }
}

// 单例
let llmSemanticService: LLMSemanticService | null = null;

export function getLLMSemanticService(llmClient: QianfanLLMClient): LLMSemanticService {
  if (!llmSemanticService) {
    llmSemanticService = new LLMSemanticService(llmClient);
  }
  return llmSemanticService;
}
