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
  mappedFields: any[];
  schema: any;
  semanticRules?: any[];
  joinHints?: any[];
}

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
        mappedFields: { type: 'array' },
        schema: { type: 'object' },
      },
      required: ['intent', 'mappedFields', 'schema'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string' },
        explanation: { type: 'string' },
        estimatedRows: { type: 'number' },
      },
    },
  };
  
  constructor(llmClient: LLMClient) {
    super(llmClient, {
      model: 'qwen-plus',  // 使用更强的模型
      temperature: 0.1,    // 低温度，更确定性
      maxTokens: 1000,
      maxRetries: 3,
    });
  }
  
  protected async run(input: SQLGeneratorInput, context: AgentContext): Promise<SQLGeneratorOutput> {
    const systemPrompt = this.buildSystemPrompt(input);
    const userPrompt = this.buildUserPrompt(input);
    
    const response = await this.callLLM(userPrompt, systemPrompt);
    return this.parseResponse(response);
  }
  
  private buildSystemPrompt(input: SQLGeneratorInput): string {
    const { schema, semanticRules } = input;
    
    return `你是一个 SQL 生成专家。根据用户的需求和数据库结构，生成准确、安全的 SQL 查询。

## 数据库结构
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

## 生成规则
1. 只生成 SELECT 查询，禁止 INSERT/UPDATE/DELETE
2. 使用正确的 SQL 语法（MySQL 兼容）
3. 字段名使用反引号包裹
4. 字符串值使用单引号
5. 数字值不加引号
6. 日期格式使用 YYYY-MM-DD
7. 合理使用别名，让结果更易读
8. 对于大表，考虑添加 LIMIT

## 业务规则
${semanticRules?.map(r => `- ${r.name}: ${r.description}`).join('\n') || '无特殊规则'}

## 输出格式
返回 JSON:
{
  "sql": "生成的 SQL",
  "explanation": "SQL 解释",
  "estimatedRows": 预估行数,
  "warnings": ["警告信息"]
}

只返回 JSON，不要其他内容。`;
  }
  
  private buildUserPrompt(input: SQLGeneratorInput): string {
    const { intent, mappedFields, joinHints } = input;
    
    const fields = mappedFields.map(f => 
      `- ${f.userTerm} → ${f.dbTable}.${f.dbField} (${f.fieldType})`
    ).join('\n');
    
    const joins = joinHints?.map(j => 
      `${j.fromTable} JOIN ${j.toTable} ON ${j.joinCondition}`
    ).join('\n') || '无需关联';
    
    return `## 用户意图
${intent}

## 字段映射
${fields}

## 表关联提示
${joins}

请生成 SQL 查询。`;
  }
  
  private parseResponse(response: string): SQLGeneratorOutput {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          sql: parsed.sql || '',
          explanation: parsed.explanation || '',
          estimatedRows: parsed.estimatedRows,
          warnings: parsed.warnings,
        };
      }
    } catch (error) {
      console.error('SQL Generator JSON 解析失败:', error);
    }
    
    // 尝试直接提取 SQL
    const sqlMatch = response.match(/SELECT[\s\S]+?;/i);
    if (sqlMatch) {
      return {
        sql: sqlMatch[0],
        explanation: '自动提取的 SQL',
      };
    }
    
    throw new Error('无法解析 SQL 生成结果');
  }
  
  /**
   * 重试：使用更简单的 prompt
   */
  async retry(input: SQLGeneratorInput, context: AgentContext, error: any): Promise<AgentResult<SQLGeneratorOutput>> {
    const simplePrompt = `根据以下字段生成 SQL 查询：
表: ${input.schema.tables?.[0]?.name || 'unknown'}
字段: ${input.mappedFields.map(f => f.dbField).join(', ')}
筛选: ${JSON.stringify(input.mappedFields.filter(f => f.fieldType === 'filter'))}

只返回 SQL 语句。`;
    
    try {
      const response = await this.callLLM(simplePrompt);
      const sql = response.trim();
      return this.success({
        sql,
        explanation: '简化生成的 SQL',
      });
    } catch (e) {
      return this.failure(error);
    }
  }
}
