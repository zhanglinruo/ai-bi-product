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

initializeTools();

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: '数答API服务运行中' });
});

app.use('/api/users', userRoutes);
app.use('/api/datasources', datasourceRoutes);
app.use('/api/ai', aiEngineRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/progress', progressRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

app.listen(serverConfig.port, () => {
  console.log(`🚀 数答API服务启动成功，端口: ${serverConfig.port}`);
  console.log(`📊 环境: ${serverConfig.env}`);
});

export default app;
