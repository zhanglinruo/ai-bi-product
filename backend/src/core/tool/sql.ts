import { AbstractTool, ToolDefinition, ToolExecutionContext, ToolResult } from './types';
import { query } from '../../config/database';

export interface SQLResult {
  rows: any[];
  rowCount: number;
  fields?: any[];
}

export class SQLTool extends AbstractTool {
  definition: ToolDefinition = {
    name: 'sql',
    description: 'SQL数据库执行工具 - 用于执行SELECT查询',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: '要执行的SQL语句（仅支持SELECT）'
        },
        params: {
          type: 'array',
          description: 'SQL参数'
        },
        limit: {
          type: 'number',
          description: '返回结果数量限制'
        }
      },
      required: ['sql']
    },
    outputSchema: {
      type: 'object',
      properties: {
        rows: { type: 'array' },
        rowCount: { type: 'number' },
        fields: { type: 'array' }
      }
    }
  };
  
  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const sql = input.sql.trim().toUpperCase();
      
      if (!sql.startsWith('SELECT')) {
        return this.failure('只允许执行SELECT查询语句');
      }
      
      if (sql.includes('DROP') || sql.includes('DELETE') || sql.includes('UPDATE') || sql.includes('INSERT')) {
        return this.failure('不允许执行危险操作');
      }
      
      let sqlQuery = input.sql;
      if (input.limit && !sql.includes('LIMIT')) {
        sqlQuery += ` LIMIT ${input.limit}`;
      }
      
      const rows = await query<any[]>(sqlQuery, input.params);
      
      return this.success({
        rows,
        rowCount: rows.length
      }, { executionTime: Date.now() });
    } catch (error: any) {
      return this.failure(`SQL执行失败: ${error.message}`);
    }
  }
}
