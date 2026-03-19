/**
 * 数据库结构扫描 API
 */

import { Router, Request, Response } from 'express';
import { getSchemaScanService } from '../../services/schema-scan';
import { query } from '../../config/database';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

/**
 * 扫描数据源结构
 */
router.post('/scan/:datasourceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const datasourceId = Array.isArray(req.params.datasourceId) 
      ? req.params.datasourceId[0] 
      : req.params.datasourceId;
    
    // 获取数据源连接信息
    const [datasource] = await query<any>(`
      SELECT id, name, connection_config
      FROM datasources
      WHERE id = ?
    `, [datasourceId]);
    
    if (!datasource) {
      return res.status(404).json({
        success: false,
        message: '数据源不存在',
      });
    }
    
    // 解析连接配置
    let connectionConfig;
    try {
      connectionConfig = typeof datasource.connection_config === 'string' 
        ? JSON.parse(datasource.connection_config) 
        : datasource.connection_config;
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: '数据源配置格式错误',
      });
    }
    
    // 执行扫描
    const scanService = getSchemaScanService();
    const result = await scanService.scanDatasource(datasourceId, connectionConfig);
    
    // 保存结果
    await scanService.saveScanResult(result);
    
    res.json({
      success: true,
      message: '扫描完成',
      data: {
        tablesCount: result.totalCount,
        columnsCount: result.tables.reduce((sum, t) => sum + t.columns.length, 0),
        executionTime: result.executionTime,
      },
    });
  } catch (error: any) {
    console.error('[SchemaScan] 扫描失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '扫描失败',
    });
  }
});

/**
 * 执行语义分析（调用 LLM）
 */
router.post('/analyze/:datasourceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const datasourceId = Array.isArray(req.params.datasourceId) 
      ? req.params.datasourceId[0] 
      : req.params.datasourceId;
    
    const scanService = getSchemaScanService();
    
    // 检查是否已扫描
    const scanned = await scanService.isScanned(datasourceId);
    if (!scanned) {
      return res.status(400).json({
        success: false,
        message: '请先扫描数据源',
      });
    }
    
    // 执行语义分析
    await scanService.analyzeSemantics(datasourceId);
    
    res.json({
      success: true,
      message: '语义分析完成',
    });
  } catch (error: any) {
    console.error('[SchemaScan] 语义分析失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '语义分析失败',
    });
  }
});

/**
 * 获取数据源结构
 */
router.get('/schema/:datasourceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const datasourceId = Array.isArray(req.params.datasourceId) 
      ? req.params.datasourceId[0] 
      : req.params.datasourceId;
    
    const scanService = getSchemaScanService();
    const tables = await scanService.getDatasourceSchema(datasourceId);
    
    res.json({
      success: true,
      data: tables,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 检查是否已扫描
 */
router.get('/status/:datasourceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const datasourceId = Array.isArray(req.params.datasourceId) 
      ? req.params.datasourceId[0] 
      : req.params.datasourceId;
    
    const scanService = getSchemaScanService();
    const scanned = await scanService.isScanned(datasourceId);
    
    res.json({
      success: true,
      data: { scanned },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 获取扫描历史
 */
router.get('/history/:datasourceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { datasourceId } = req.params;
    
    const history = await query<any>(`
      SELECT id, status, tables_count, columns_count, error_message, started_at, completed_at
      FROM schema_scan_history
      WHERE datasource_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [datasourceId]);
    
    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 更新字段语义信息
 */
router.put('/column/:columnId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { columnId } = req.params;
    const { isMetric, isDimension, semanticName, semanticDescription } = req.body;
    
    await query(`
      UPDATE schema_columns
      SET 
        is_metric = ?,
        is_dimension = ?,
        semantic_name = ?,
        semantic_description = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [isMetric, isDimension, semanticName, semanticDescription, columnId]);
    
    res.json({
      success: true,
      message: '更新成功',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
