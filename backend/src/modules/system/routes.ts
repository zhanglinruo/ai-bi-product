import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database';

const router = Router();

router.get('/config', async (_req: Request, res: Response) => {
  try {
    const configs = await query<any[]>('SELECT config_key, config_value, description FROM system_config');
    const configMap: Record<string, any> = {};
    configs.forEach(c => {
      configMap[c.config_key] = c.config_value;
    });
    res.json({ success: true, data: configMap });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/config', async (_req: Request, res: Response) => {
  try {
    const { config_key, config_value } = _req.body;
    if (!config_key) {
      return res.status(400).json({ success: false, message: '配置键不能为空' });
    }
    await query(
      'UPDATE system_config SET config_value = ?, updated_at = NOW() WHERE config_key = ?',
      [config_value, config_key]
    );
    res.json({ success: true, message: '配置更新成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/logs', async (_req: Request, res: Response) => {
  try {
    const { action, limit = 50, offset = 0 } = _req.query;
    let sql = 'SELECT * FROM logs';
    const params: any[] = [];
    if (action) {
      sql += ' WHERE action = ?';
      params.push(action);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));
    
    const logs = await query<any[]>(sql, params);
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const userCount = await query<any[]>('SELECT COUNT(*) as count FROM users');
    const datasourceCount = await query<any[]>('SELECT COUNT(*) as count FROM datasources');
    const queryCount = await query<any[]>('SELECT COUNT(*) as count FROM query_history');
    
    res.json({
      success: true,
      data: {
        userCount: userCount[0]?.count || 0,
        datasourceCount: datasourceCount[0]?.count || 0,
        queryCount: queryCount[0]?.count || 0
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
