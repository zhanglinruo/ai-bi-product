/**
 * Agent API 路由
 * 
 * 使用新的 Agent 架构处理查询
 */

import { Router, Request, Response } from 'express';
import { createOrchestrator, AgentOrchestrator, QueryResult } from '../../orchestrator';
import { AgentContext } from '../../agents/types';
import { QianfanLLMClient } from '../../config/llm';
import { semanticConfig } from '../../config/semantic-layer';

const router = Router();

// Orchestrator 实例
let orchestrator: AgentOrchestrator | null = null;

/**
 * 初始化 Orchestrator
 */
export function initOrchestrator(config: {
  llmClient: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
  };
  dbPool: any;
  semanticConfig: any;
}): void {
  const llmClient = new QianfanLLMClient({
    baseUrl: config.llmClient.baseUrl,
    apiKey: config.llmClient.apiKey,
    model: config.llmClient.model,
    temperature: config.llmClient.temperature,
  });
  
  orchestrator = createOrchestrator(
    llmClient as any,
    config.dbPool,
    config.semanticConfig,
    { debug: process.env.NODE_ENV === 'development' }
  );
  
  console.log('[Agent API] Orchestrator 初始化完成');
}

/**
 * 执行查询（使用 Agent 架构）
 * 
 * POST /api/agent/query
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, datasourceId } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: '查询内容不能为空',
      });
    }
    
    if (!orchestrator) {
      return res.status(500).json({
        success: false,
        message: 'Orchestrator 未初始化',
      });
    }
    
    // 构建上下文
    const context: AgentContext = {
      userId: (req as any).user?.id || 'anonymous',
      sessionId: req.headers['x-session-id'] as string,
      datasourceId,
      permissions: (req as any).user?.permissions || ['query'],
    };
    
    // 执行查询（传递数据源 ID）
    const result = await orchestrator.execute(query, context, datasourceId);
    
    // 返回结果
    res.json({
      success: result.success,
      data: {
        intent: result.intent,
        sql: result.sql,
        sqlExplanation: result.sqlExplanation,
        data: result.data,
        rowCount: result.rowCount,
        summary: result.summary,
        insights: result.insights,
        anomalies: result.anomalies,
        recommendations: result.recommendations,
        chartType: result.chartType,
        chartConfig: result.chartConfig,
        needsClarification: result.needsClarification,
        clarificationQuestions: result.clarificationQuestions,
      },
      executionTime: result.executionTime,
      errors: result.errors,
    });
    
  } catch (error: any) {
    console.error('[Agent API] 查询错误:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 分步执行查询（用于调试和展示）
 * 
 * POST /api/agent/query/steps
 */
router.post('/query/steps', async (req: Request, res: Response) => {
  try {
    const { query, datasourceId } = req.body;
    
    if (!query || !orchestrator) {
      return res.status(400).json({
        success: false,
        message: '参数错误',
      });
    }
    
    const context: AgentContext = {
      userId: (req as any).user?.id || 'anonymous',
      datasourceId,
    };
    
    // 创建工作流状态
    let state = orchestrator.createWorkflowState(query, context);
    
    // 逐步执行
    const steps = [];
    while (state.status === 'pending' || state.currentNode < state.nodes.length) {
      state = await orchestrator.executeStep(state);
      steps.push({
        agentName: state.nodes[state.currentNode - 1]?.agentName,
        status: state.nodes[state.currentNode - 1]?.status,
        output: state.nodes[state.currentNode - 1]?.output,
        error: state.nodes[state.currentNode - 1]?.error,
      });
      
      if (state.status === 'failed') break;
    }
    
    res.json({
      success: state.status === 'completed',
      steps,
      finalOutput: state.nodes[state.nodes.length - 1]?.output,
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 获取 Agent 列表
 * 
 * GET /api/agent/list
 */
router.get('/list', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      understanding: [
        { name: 'nlu-agent', description: '自然语言理解' },
        { name: 'semantic-agent', description: '语义匹配' },
        { name: 'clarification-agent', description: '澄清询问' },
      ],
      execution: [
        { name: 'sql-generator-agent', description: 'SQL 生成' },
        { name: 'validator-agent', description: 'SQL 校验' },
        { name: 'executor-agent', description: '查询执行' },
      ],
      output: [
        { name: 'insight-agent', description: '洞察分析' },
        { name: 'visualization-agent', description: '可视化生成' },
      ],
    },
  });
});

export default router;
