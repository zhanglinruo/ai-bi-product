/**
 * Executor Agent - 查询执行器
 * 
 * 负责执行 SQL 并处理结果
 */

import { RuleBasedAgent } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  ExecutorOutput,
} from '../types';

export interface ExecutorInput {
  sql: string;
  datasourceId?: string;
  params?: any[];
  timeout?: number;
  maxRows?: number;
}

export class ExecutorAgent extends RuleBasedAgent<ExecutorInput, ExecutorOutput> {
  definition: AgentDefinition = {
    name: 'executor-agent',
    description: '执行 SQL 查询并返回结果',
    version: '1.0.0',
    layer: 'execution',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string' },
        datasourceId: { type: 'string' },
        timeout: { type: 'number' },
        maxRows: { type: 'number' },
      },
      required: ['sql'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'array' },
        rowCount: { type: 'number' },
        executionTime: { type: 'number' },
      },
    },
  };
  
  // 数据库连接池（实际应该从外部注入）
  private dbPool: any;
  
  constructor(dbPool: any, config?: { timeout?: number; maxRows?: number }) {
    super({
      timeout: config?.timeout || 30000,
      enableCache: true,
    });
    this.dbPool = dbPool;
  }
  
  protected async run(input: ExecutorInput, context: AgentContext): Promise<ExecutorOutput> {
    const { sql, params, timeout = 30000, maxRows = 1000 } = input;
    const startTime = Date.now();
    console.log('[Executor] SQL:', sql);
    console.log('[Executor] Params:', JSON.stringify(params));

    try {
      const result = await this.executeWithTimeout(sql, params, timeout);
      
      // 处理结果
      let data = result.rows || result;
      const totalCount = data.length;
      
      // 如果超过最大行数，截断
      let truncated = false;
      if (data.length > maxRows) {
        data = data.slice(0, maxRows);
        truncated = true;
      }
      
      return {
        success: true,
        data,
        rowCount: data.length,
        executionTime: Date.now() - startTime,
        truncated,
      };
      
    } catch (error: any) {
      return {
        success: false,
        data: [],
        rowCount: 0,
        executionTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }
  
  /**
   * 带超时的查询执行
   */
  private async executeWithTimeout(sql: string, params: any[] | undefined, timeout: number): Promise<any> {
    if (!this.dbPool) {
      throw new Error('数据库连接池未初始化');
    }

    const queryPromise = this.dbPool.query(sql, params);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('查询超时')), timeout);
    });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    const [rows] = result;
    return { rows };
  }
  
  /**
   * 降级：返回空结果
   */
  async fallback(input: ExecutorInput, context: AgentContext): Promise<AgentResult<ExecutorOutput>> {
    return this.success({
      success: false,
      data: [],
      rowCount: 0,
      executionTime: 0,
      error: '查询执行失败，请稍后重试',
    });
  }
}
