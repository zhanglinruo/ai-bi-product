/**
 * Agent Orchestrator - 调度器
 * 
 * 协调多个 Agent 的工作流程
 */

import {
  AgentContext,
  AgentResult,
  WorkflowState,
  WorkflowNode,
  AgentError,
  NLUOutput,
  SemanticOutput,
  ClarificationOutput,
  SQLGeneratorOutput,
  ValidatorOutput,
  ExecutorOutput,
  InsightOutput,
  VisualizationOutput,
  BaseAgent,
} from '../agents/types';
import { LLMClient } from '../agents/base';
import { UnifiedSemanticAgent } from '../agents/understanding/unified-semantic-agent';
import { ClarificationAgent } from '../agents/understanding/clarification-agent';
import { SQLGeneratorAgent } from '../agents/execution/sql-generator-agent';
import { ValidatorAgent } from '../agents/execution/validator-agent';
import { ExecutorAgent } from '../agents/execution/executor-agent';
import { InsightAgent } from '../agents/output/insight-agent';
import { VisualizationAgent } from '../agents/output/visualization-agent';
import { queryCache } from '../utils/cache';
import { contextManager, ContextManager } from '../utils/context-manager';
import { getSchemaScanService } from '../services/schema-scan';
import { query as dbQuery } from '../config/database';
import { decrypt } from '../utils/crypto';

/**
 * 完整的查询结果
 */
export interface QueryResult {
  success: boolean;
  
  // 理解层结果
  intent?: string;
  entities?: any;
  
  // 执行层结果
  sql?: string;
  sqlExplanation?: string;
  data?: Record<string, any>[];
  rowCount?: number;
  
  // 输出层结果
  summary?: string;
  insights?: any[];
  anomalies?: any[];
  recommendations?: string[];
  chartType?: string;
  chartConfig?: any;
  
  // 元数据
  executionTime?: number;
  errors?: AgentError[];
  needsClarification?: boolean;
  clarificationQuestions?: any[];
}

/**
 * Orchestrator 配置
 */
export interface OrchestratorConfig {
  enableCache?: boolean;
  maxRetries?: number;
  timeout?: number;
  debug?: boolean;
}

/**
 * Agent Orchestrator
 */
export class AgentOrchestrator {
  private agents: Map<string, BaseAgent> = new Map();
  private config: OrchestratorConfig;
  
  constructor(config?: OrchestratorConfig) {
    this.config = {
      enableCache: true,
      maxRetries: 3,
      timeout: 60000,
      debug: false,
      ...config,
    };
  }
  
  /**
   * 注册 Agent
   */
  register(name: string, agent: BaseAgent): void {
    this.agents.set(name, agent);
    if (this.config.debug) {
      console.log(`[Orchestrator] 注册 Agent: ${name}`);
    }
  }
  
  /**
   * 执行完整查询流程
   */
  async execute(query: string, context: AgentContext, datasourceId?: string): Promise<QueryResult> {
    const startTime = Date.now();
    const result: QueryResult = { success: true };
    const errors: AgentError[] = [];
    
    // 获取或创建会话上下文
    const sessionId = context.sessionId || `session_${Date.now()}`;
    const sessionContext = contextManager.getOrCreate(sessionId, context.userId);
    
    // 检查是否是追问
    const isFollowUp = contextManager.isFollowUp(query);
    const previousEntities = contextManager.getPreviousEntities(sessionId);
    
    if (this.config.debug) {
      console.log(`[Orchestrator] 会话ID: ${sessionId}`);
      console.log(`[Orchestrator] 是否追问: ${isFollowUp}`);
      if (datasourceId) {
        console.log(`[Orchestrator] 数据源: ${datasourceId}`);
      }
    }
    
    try {
      // ========================================
      // 第 1 层：理解层
      // ========================================
      
      // 1.1 NLU Agent
      if (this.config.debug) console.log('[Orchestrator] 执行 NLU Agent...');
      const nluResult = await this.executeAgent<NLUOutput>('nlu-agent', { 
        query, 
        datasourceId,
        context 
      }, context);
      
      if (!nluResult.success) {
        errors.push(nluResult.error!);
        result.success = false;
        result.errors = errors;
        return result;
      }
      
      result.intent = nluResult.data!.intent;
      result.entities = nluResult.data!.entities;
      
      // 如果是追问，合并之前的实体
      if (isFollowUp && previousEntities) {
        result.entities = contextManager.mergeFollowUpEntities(previousEntities, result.entities);
        if (this.config.debug) {
          console.log(`[Orchestrator] 合并追问实体: ${JSON.stringify(result.entities)}`);
        }
      }
      
      // 添加用户消息
      contextManager.addMessage(sessionId, 'user', query);

      // 自动扫描数据源（如果未扫描）
      if (datasourceId) {
        const scanService = getSchemaScanService();
        const alreadyScanned = await scanService.isScanned(datasourceId);
        if (!alreadyScanned) {
          console.log(`[Orchestrator] 数据源 ${datasourceId} 尚未扫描，开始自动扫描...`);
          try {
            const [datasource] = await dbQuery<any>(`
              SELECT id, name, type, host, port, database_name, username, password_encrypted, connection_config
              FROM datasources
              WHERE id = ?
            `, [datasourceId]);

            if (datasource) {
              let connectionConfig;
              try {
                if (datasource.connection_config) {
                  connectionConfig = typeof datasource.connection_config === 'string'
                    ? JSON.parse(datasource.connection_config)
                    : datasource.connection_config;
                } else if (datasource.host) {
                  connectionConfig = {
                    host: datasource.host,
                    port: datasource.port || 3306,
                    database: datasource.database_name,
                    user: datasource.username,
                    password: datasource.password_encrypted ? decrypt(datasource.password_encrypted) : null,
                  };
                } else {
                  throw new Error('数据源缺少连接配置');
                }
              } catch (e) {
                console.error(`[Orchestrator] 解析连接配置失败: ${e}`);
                connectionConfig = null;
              }

              if (connectionConfig) {
                const scanResult = await scanService.scanDatasource(datasourceId, connectionConfig);
                await scanService.saveScanResult(scanResult);
                console.log(`[Orchestrator] 数据源扫描完成: ${scanResult.totalCount} 表`);
              }
            }
          } catch (scanError: any) {
            console.error(`[Orchestrator] 数据源扫描失败: ${scanError.message}`);
          }
        }
      }

      // 1.2 构建 mappedFields（基于 NLU 结果）
      // UnifiedSemanticAgent 已经返回了完整的实体信息，直接使用
      const mappedFields: any[] = [];
      const tables = new Set<string>();
      
      // 构建 SQL Generator 需要的 entities 格式
      // 已经是完整格式，包含表名和聚合方式
      const sqlEntities = {
        metrics: result.entities.metrics || [],
        dimensions: result.entities.dimensions || [],
        filters: result.entities.filters || {},
        groupBy: result.entities.groupBy || [],
        orderBy: result.entities.orderBy,
        limit: result.entities.limit || 100,
        timeRange: result.entities.timeRange,
      };
      
      // 构建 mappedFields（用于可视化提示等）
      for (const metric of result.entities.metrics || []) {
        mappedFields.push({
          userTerm: metric.field,
          dbField: metric.field,
          dbTable: metric.table,
          fieldType: 'metric',
          confidence: metric.confidence || 0.9,
        });
        tables.add(metric.table);
      }
      
      for (const dim of result.entities.dimensions || []) {
        mappedFields.push({
          userTerm: dim.field,
          dbField: dim.field,
          dbTable: dim.table,
          fieldType: 'dimension',
          confidence: dim.confidence || 0.9,
        });
        tables.add(dim.table);
      }
      
      const semanticResult = {
        success: true,
        data: {
          mappedFields,
          availableTables: Array.from(tables),
          joinHints: [],
          unmappedTerms: [],
        },
      };
      
      // 1.3 Clarification Agent（如果需要）
      const unmappedTermsLength = semanticResult.data?.unmappedTerms?.length ?? 0;
      if (nluResult.data!.confidence < 0.7 || unmappedTermsLength > 0) {
        console.log('[Orchestrator] 需要澄清: confidence=' + nluResult.data!.confidence + ', unmappedTerms=' + unmappedTermsLength);
        
        if (this.config.debug) console.log('[Orchestrator] 执行 Clarification Agent...');
        const clarificationResult = await this.executeAgent<ClarificationOutput>('clarification-agent', {
          nluResult: nluResult.data,
          semanticResult: semanticResult.data,
        }, context);
        
        if (clarificationResult.success && clarificationResult.data!.needsClarification) {
          result.needsClarification = true;
          result.clarificationQuestions = clarificationResult.data!.questions;
        }
      }
      
      // ========================================
      // 第 2 层：执行层
      // ========================================
      
      // 1.4 SQL Generator Agent
      if (this.config.debug) console.log('[Orchestrator] 执行 SQL Generator Agent...');
      console.log('[Orchestrator] 调用 SQLGenerator，entities:', JSON.stringify(result.entities));
      const sqlResult = await this.executeAgent<SQLGeneratorOutput>('sql-generator-agent', {
        intent: result.intent || 'query',
        entities: result.entities,
        mappedFields: semanticResult.data?.mappedFields || [],
      }, context);
      console.log('[Orchestrator] SQLGenerator 结果:', JSON.stringify(sqlResult));
      
      if (!sqlResult.success) {
        errors.push(sqlResult.error!);
        result.success = false;
        result.errors = errors;
        return result;
      }
      
      result.sql = sqlResult.data!.sql;
      result.sqlExplanation = sqlResult.data!.explanation;

      const params = this.extractParams(sqlResult.data!.sql, result.entities);
      const cacheKey = queryCache.generateKey(result.sql, params);
      const cachedResult = queryCache.get<{ data: any[]; rowCount: number }>(cacheKey);
      if (cachedResult) {
        if (this.config.debug) console.log(`[Orchestrator] 缓存命中，跳过执行`);
        result.data = cachedResult.data;
        result.rowCount = cachedResult.rowCount;
        
        contextManager.addMessage(sessionId, 'assistant', '（来自缓存）查询完成', {
          entities: result.entities,
          sql: result.sql,
          result: result.data,
        });
        
        result.executionTime = Date.now() - startTime;
        result.errors = errors;
        return result;
      }
      
      // 2.2 Validator Agent
      if (this.config.debug) console.log('[Orchestrator] 执行 Validator Agent...');
      const validationResult = await this.executeAgent<ValidatorOutput>('validator-agent', {
        sql: sqlResult.data!.sql,
        fieldWhitelist: [], // TODO: 从语义层获取
        userPermissions: context.permissions,
      }, context);
      
      if (!validationResult.success || !validationResult.data!.isValid) {
        // 转换 ValidationError 为 AgentError
        const validationErrors = validationResult.data?.errors || [];
        for (const ve of validationErrors) {
          errors.push({
            code: ve.type.toUpperCase(),
            message: ve.message,
            recoverable: ve.severity !== 'critical',
            details: ve.details,
          });
        }
        
        // 如果有修正后的 SQL，使用修正版本
        if (validationResult.data?.fixedSQL) {
          result.sql = validationResult.data!.fixedSQL;
        } else if (validationResult.data?.errors?.some(e => e.severity === 'critical')) {
          result.success = false;
          result.errors = errors;
          return result;
        }
      }
      
      // 2.3 Executor Agent
      if (this.config.debug) console.log('[Orchestrator] 执行 Executor Agent...');
      console.log('[Orchestrator] 传递给Executor的params:', JSON.stringify(params));
      const executorResult = await this.executeAgent<ExecutorOutput>('executor-agent', {
        sql: result.sql,
        datasourceId: context.datasourceId,
        params: params,
      }, context);
      
      if (!executorResult.success || !executorResult.data!.success) {
        errors.push({
          code: 'EXECUTION_ERROR',
          message: executorResult.data?.error || '查询执行失败',
          recoverable: false,
        });
        result.success = false;
        result.errors = errors;
        return result;
      }
      
      result.data = executorResult.data!.data;
      result.rowCount = executorResult.data!.rowCount;
      
      queryCache.set(cacheKey, { data: result.data, rowCount: result.rowCount }, 5 * 60 * 1000);
      
      // ========================================
      // 第 3 层：输出层
      // ========================================
      
      // 3.1 Insight Agent
      if (this.config.debug) console.log('[Orchestrator] 执行 Insight Agent...');
      const insightResult = await this.executeAgent<InsightOutput>('insight-agent', {
        data: result.data!,
        query,
        sql: result.sql,
      }, context);
      
      if (insightResult.success) {
        result.summary = insightResult.data!.summary;
        result.insights = insightResult.data!.insights;
        result.anomalies = insightResult.data!.anomalies;
        result.recommendations = insightResult.data!.recommendations;
      }
      
      // 3.2 Visualization Agent
      if (this.config.debug) console.log('[Orchestrator] 执行 Visualization Agent...');
      const vizResult = await this.executeAgent<VisualizationOutput>('visualization-agent', {
        data: result.data!,
        insights: result.insights,
      }, context);
      
      if (vizResult.success) {
        result.chartType = vizResult.data!.chartType;
        result.chartConfig = vizResult.data!.chartConfig;
      }
      
    } catch (error: any) {
      result.success = false;
      errors.push({
        code: 'ORCHESTRATOR_ERROR',
        message: error.message,
        recoverable: false,
      });
    }
    
    result.executionTime = Date.now() - startTime;
    result.errors = errors;
    
    // 保存上下文（用于多轮对话）
    if (result.success) {
      contextManager.addMessage(sessionId, 'assistant', result.summary || '查询完成', {
        entities: result.entities,
        sql: result.sql,
        result: result.data,
      });
    }
    
    return result;
  }
  
  /**
   * 执行单个 Agent
   */
  private async executeAgent<T>(name: string, input: any, context: AgentContext): Promise<AgentResult<T>> {
    const agent = this.agents.get(name);
    
    if (!agent) {
      return {
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `Agent "${name}" 未注册`,
          recoverable: false,
        },
      };
    }
    
    return agent.execute(input, context) as Promise<AgentResult<T>>;
  }
  
  /**
   * 创建工作流状态
   */
  createWorkflowState(query: string, context: AgentContext): WorkflowState {
    return {
      workflowId: `wf_${Date.now()}`,
      query,
      nodes: [
        { agentName: 'nlu-agent', input: { query }, status: 'pending' },
        { agentName: 'semantic-agent', input: {}, status: 'pending' },
        { agentName: 'sql-generator-agent', input: {}, status: 'pending' },
        { agentName: 'validator-agent', input: {}, status: 'pending' },
        { agentName: 'executor-agent', input: {}, status: 'pending' },
        { agentName: 'insight-agent', input: {}, status: 'pending' },
        { agentName: 'visualization-agent', input: {}, status: 'pending' },
      ],
      currentNode: 0,
      status: 'pending',
      startTime: new Date(),
      context,
    };
  }
  
  /**
   * 分步执行工作流
   */
  async executeStep(state: WorkflowState): Promise<WorkflowState> {
    if (state.currentNode >= state.nodes.length) {
      state.status = 'completed';
      state.endTime = new Date();
      return state;
    }
    
    const node = state.nodes[state.currentNode];
    node.status = 'running';
    
    try {
      const agent = this.agents.get(node.agentName);
      if (!agent) {
        throw new Error(`Agent "${node.agentName}" 未注册`);
      }
      
      const result = await agent.execute(node.input, state.context);
      
      if (result.success) {
        node.output = result.data;
        node.status = 'success';
        node.metadata = result.metadata;
        
        // 将输出传递给下一个节点
        if (state.currentNode + 1 < state.nodes.length) {
          state.nodes[state.currentNode + 1].input = result.data;
        }
      } else {
        node.status = 'failed';
        node.error = result.error;
        state.status = 'failed';
      }
      
    } catch (error: any) {
      node.status = 'failed';
      node.error = {
        code: 'EXECUTION_ERROR',
        message: error.message,
        recoverable: false,
      };
      state.status = 'failed';
    }
    
    state.currentNode++;
    return state;
  }

  private extractParams(sql: string, entities: any): any[] {
    const params: any[] = [];
    const filterCount = (sql.match(/\?/g) || []).length;

    if (entities.filters) {
      for (const value of Object.values(entities.filters)) {
        if (params.length < filterCount) {
          params.push(value);
        }
      }
    }

    return params;
  }
}

/**
 * 创建 Orchestrator 工厂函数
 */
export function createOrchestrator(
  llmClient: LLMClient,
  dbPool: any,
  semanticConfig: any,
  config?: OrchestratorConfig
): AgentOrchestrator {
  const orchestrator = new AgentOrchestrator(config);
  
  // 使用统一的语义理解 Agent（向量 + 规则 + LLM）
  const unifiedAgent = new UnifiedSemanticAgent(llmClient);
  
  // 注册理解层 Agent
  orchestrator.register('nlu-agent', unifiedAgent);
  orchestrator.register('semantic-agent', unifiedAgent);  // 同一个实例
  orchestrator.register('clarification-agent', new ClarificationAgent(llmClient));
  
  // 注册执行层 Agent
  orchestrator.register('sql-generator-agent', new SQLGeneratorAgent(llmClient));
  orchestrator.register('validator-agent', new ValidatorAgent());
  orchestrator.register('executor-agent', new ExecutorAgent(dbPool));
  
  // 注册输出层 Agent
  orchestrator.register('insight-agent', new InsightAgent(llmClient));
  orchestrator.register('visualization-agent', new VisualizationAgent());
  
  console.log('[Orchestrator] 使用统一语义理解 Agent（向量 + 规则 + LLM）');
  
  return orchestrator;
}
