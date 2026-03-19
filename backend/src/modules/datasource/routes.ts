import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database';
import bcrypt from 'bcryptjs';
import { createPool } from 'mysql2/promise';
import { authMiddleware } from '../../middleware/auth';
import { encrypt } from '../../utils/crypto';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 获取当前用户的数据源列表
router.get('/', async (_req: Request, res: Response) => {
  try {
    const userId = _req.user!.id;
    const datasources = await query<any[]>(
      'SELECT id, name, type, host, port, database_name, username, status, created_at, updated_at FROM datasources WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json({ success: true, data: datasources });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 创建数据源
router.post('/', async (_req: Request, res: Response) => {
  try {
    const userId = _req.user!.id;
    const { name, type = 'mysql', host, port = 3306, database_name, username, password } = _req.body;
    
    if (!name || !host || !database_name) {
      return res.status(400).json({ success: false, message: '名称、主机和数据库名不能为空' });
    }
    
    const id = uuidv4();

    // 先测试连接
    if (type === 'mysql' && password) {
      const testPool = createPool({
        host,
        port,
        user: username,
        password,
        database: database_name,
        waitForConnections: true,
        connectionLimit: 1,
      });
      try {
        const connection = await testPool.getConnection();
        await connection.ping();
        connection.release();
      } finally {
        await testPool.end();
      }
    }

    // 连接成功，存加密后的密码
    const passwordEnc = password ? encrypt(password) : null;

    await query(
      `INSERT INTO datasources (id, user_id, name, type, host, port, database_name, username, password_encrypted, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [id, userId, name, type, host, port, database_name, username, passwordEnc]
    );

    res.status(201).json({ success: true, message: '数据源创建成功', data: { id, name, type } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 测试连接
router.post('/test', async (_req: Request, res: Response) => {
  try {
    const { type = 'mysql', host, port = 3306, database_name, username, password } = _req.body;
    
    if (type === 'mysql') {
      const testPool = createPool({
        host,
        port,
        user: username,
        password,
        database: database_name,
        waitForConnections: true,
        connectionLimit: 1,
      });
      
      const connection = await testPool.getConnection();
      await connection.ping();
      connection.release();
      await testPool.end();
      
      res.json({ success: true, message: '连接测试成功' });
    } else {
      res.json({ success: true, message: '连接测试成功（模拟）' });
    }
  } catch (error: any) {
    res.status(400).json({ success: false, message: '连接失败: ' + error.message });
  }
});

// 获取单个数据源
router.get('/:id', async (_req: Request, res: Response) => {
  try {
    const userId = _req.user!.id;
    const datasources = await query<any[]>(
      'SELECT id, name, type, host, port, database_name, username, status, created_at, updated_at FROM datasources WHERE id = ? AND user_id = ?',
      [_req.params.id, userId]
    );
    if (datasources.length === 0) {
      return res.status(404).json({ success: false, message: '数据源不存在' });
    }
    res.json({ success: true, data: datasources[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新数据源
router.put('/:id', async (_req: Request, res: Response) => {
  try {
    const userId = _req.user!.id;
    const { name, host, port, database_name, username, password, status } = _req.body;
    
    // 检查数据源是否属于当前用户
    const existing = await query<any[]>('SELECT id FROM datasources WHERE id = ? AND user_id = ?', [_req.params.id, userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: '数据源不存在' });
    }
    
    const updates: string[] = [];
    const values: any[] = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (host !== undefined) { updates.push('host = ?'); values.push(host); }
    if (port !== undefined) { updates.push('port = ?'); values.push(port); }
    if (database_name) { updates.push('database_name = ?'); values.push(database_name); }
    if (username !== undefined) { updates.push('username = ?'); values.push(username); }
    if (password) { updates.push('password_encrypted = ?'); values.push(await bcrypt.hash(password, 10)); }
    if (status) { updates.push('status = ?'); values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    }

    values.push(_req.params.id);
    await query(`UPDATE datasources SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, values);

    res.json({ success: true, message: '数据源更新成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除数据源
router.delete('/:id', async (_req: Request, res: Response) => {
  try {
    const userId = _req.user!.id;
    
    // 检查数据源是否属于当前用户
    const existing = await query<any[]>('SELECT id FROM datasources WHERE id = ? AND user_id = ?', [_req.params.id, userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: '数据源不存在' });
    }

    await query('DELETE FROM datasources WHERE id = ?', [_req.params.id]);
    res.json({ success: true, message: '数据源删除成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
