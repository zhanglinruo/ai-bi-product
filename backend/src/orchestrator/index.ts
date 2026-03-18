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
import { contextManager, ContextManager } from '../utils/context-manager';

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
  async execute(query: string, context: AgentContext): Promise<QueryResult> {
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
    }
    
    try {
      // ========================================
      // 第 1 层：理解层
      // ========================================
      
      // 1.1 NLU Agent
      if (this.config.debug) console.log('[Orchestrator] 执行 NLU Agent...');
      const nluResult = await this.executeAgent<NLUOutput>('nlu-agent', { query, context }, context);
      
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
      
      // 1.2 构建 mappedFields（基于 NLU 结果）
      // 由于 UnifiedSemanticAgent 已经完成了语义映射，直接构建 mappedFields
      const mappedFields: any[] = [];
      const tables = new Set<string>();
      
      // 构建 SQL Generator 需要的 entities 格式
      const sqlEntities = {
        metrics: (result.entities.metrics || []).map((m: string) => ({
          field: m,
          table: FIELD_TABLE_MAPPING[m] || 'orders',
          aggregation: 'SUM',
        })),
        dimensions: (result.entities.dimensions || []).map((d: string) => ({
          field: d,
          table: FIELD_TABLE_MAPPING[d] || 'orders',
        })),
        filters: result.entities.filters || {},
        groupBy: result.entities.groupBy || [],
        orderBy: result.entities.orderBy,
        limit: result.entities.limit || 100,
        timeRange: result.entities.timeRange,
      };
      
      // 映射指标
      for (const metric of result.entities.metrics || []) {
        mappedFields.push({
          userTerm: metric,
          dbField: metric,
          dbTable: FIELD_TABLE_MAPPING[metric] || 'orders',
          fieldType: 'metric',
          confidence: 0.95,
        });
        tables.add(FIELD_TABLE_MAPPING[metric] || 'orders');
      }
      
      // 映射维度
      for (const dim of result.entities.dimensions || []) {
        const table = FIELD_TABLE_MAPPING[dim] || 'orders';
        mappedFields.push({
          userTerm: dim,
          dbField: dim,
          dbTable: table,
          fieldType: 'dimension',
          confidence: 0.95,
        });
        tables.add(table);
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
      
      // 更新 result.entities 为 SQL Generator 格式
      result.entities = sqlEntities;
      
      // 1.3 Clarification Agent（如果需要）
      if (nluResult.data!.confidence < 0.7 || 
          (semanticResult.data?.unmappedTerms?.length || 0) > 0) {
        
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
      
      // 2.1 SQL Generator Agent
      if (this.config.debug) console.log('[Orchestrator] 执行 SQL Generator Agent...');
      const sqlResult = await this.executeAgent<SQLGeneratorOutput>('sql-generator-agent', {
        intent: result.intent,
        entities: result.entities,
        mappedFields: semanticResult.data?.mappedFields || [],
      }, context);
      
      if (!sqlResult.success) {
        errors.push(sqlResult.error!);
        result.success = false;
        result.errors = errors;
        return result;
      }
      
      result.sql = sqlResult.data!.sql;
      result.sqlExplanation = sqlResult.data!.explanation;
      
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
      const executorResult = await this.executeAgent<ExecutorOutput>('executor-agent', {
        sql: result.sql,
        datasourceId: context.datasourceId,
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
