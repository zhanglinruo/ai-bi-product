import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { serverConfig } from './config/index';
import { initializeTools } from './core/tool';
import userRoutes from './modules/user/routes';
import datasourceRoutes from './modules/datasource/routes';
import aiEngineRoutes from './modules/ai-engine/routes';
import queryRoutes from './modules/query/routes';
import systemRoutes from './modules/system/routes';
import progressRoutes from './modules/progress/routes';
import agentRoutes, { initOrchestrator } from './modules/agent/routes';
import historyRoutes from './modules/history/routes';
import dbPool from './config/database';
import { QianfanLLMClient } from './config/llm';
import { semanticConfig } from './config/semantic-layer';

// 初始化工具
initializeTools();

const app: Application = express();

// 中间件
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: '数答API服务运行中' });
});

// API 路由
app.use('/api/users', userRoutes);
app.use('/api/datasources', datasourceRoutes);
app.use('/api/ai', aiEngineRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/history', historyRoutes);

// 错误处理
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// 初始化 Agent Orchestrator
function initializeAgentSystem() {
  try {
    initOrchestrator({
      llmClient: {
        baseUrl: process.env.LLM_BASE_URL || 'https://qianfan.baidubce.com/v2/coding',
        apiKey: process.env.LLM_API_KEY || '',
        model: process.env.LLM_MODEL || 'qianfan-code-latest',
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
      },
      dbPool: dbPool,
      semanticConfig: semanticConfig,
    });
    console.log('✅ Agent Orchestrator 初始化成功');
  } catch (error: any) {
    console.error('❌ Agent Orchestrator 初始化失败:', error.message);
  }
}

// 启动服务
const server = app.listen(serverConfig.port, () => {
  console.log(`🚀 数答API服务启动成功，端口: ${serverConfig.port}`);
  console.log(`📊 环境: ${serverConfig.env}`);
  
  // 初始化 Agent 系统
  initializeAgentSystem();
  
  console.log('\n📚 API 端点:');
  console.log('   POST /api/agent/query      - Agent 架构查询');
  console.log('   POST /api/ai/generate-sql  - SQL 生成');
  console.log('   POST /api/ai/chat          - AI 对话');
  console.log('   GET  /api/agent/list       - Agent 列表');
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

export default app;
