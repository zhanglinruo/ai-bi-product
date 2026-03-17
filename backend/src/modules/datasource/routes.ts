import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database';
import bcrypt from 'bcryptjs';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const datasources = await query<any[]>('SELECT * FROM datasources ORDER BY created_at DESC');
    res.json({ success: true, data: datasources });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (_req: Request, res: Response) => {
  try {
    const { name, type, host, port, database_name, username, password, file_path } = _req.body;
    const id = uuidv4();
    const passwordEnc = password ? await bcrypt.hash(password, 10) : null;

    await query(
      `INSERT INTO datasources (id, name, type, host, port, database_name, username, password_enc, file_path, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [id, name, type, host, port, database_name, username, passwordEnc, file_path]
    );

    res.status(201).json({ success: true, message: '数据源创建成功', data: { id, name, type } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/test', async (_req: Request, res: Response) => {
  try {
    const { type, host, port, database_name, username, password } = _req.body;
    
    res.json({ success: true, message: '连接测试成功（模拟）' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: '连接失败: ' + error.message });
  }
});

router.get('/:id', async (_req: Request, res: Response) => {
  try {
    const datasources = await query<any[]>('SELECT * FROM datasources WHERE id = ?', [_req.params.id]);
    if (datasources.length === 0) {
      return res.status(404).json({ success: false, message: '数据源不存在' });
    }
    res.json({ success: true, data: datasources[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (_req: Request, res: Response) => {
  try {
    const { name, host, port, database_name, username, password, status } = _req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (host !== undefined) { updates.push('host = ?'); values.push(host); }
    if (port !== undefined) { updates.push('port = ?'); values.push(port); }
    if (database_name) { updates.push('database_name = ?'); values.push(database_name); }
    if (username !== undefined) { updates.push('username = ?'); values.push(username); }
    if (password) { updates.push('password_enc = ?'); values.push(await bcrypt.hash(password, 10)); }
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

router.delete('/:id', async (_req: Request, res: Response) => {
  try {
    const savedResults = await query<any[]>('SELECT id FROM saved_results WHERE id = ?', [_req.params.id]);
    if (savedResults.length > 0) {
      return res.status(400).json({ success: false, message: '该数据源下存在保存的查询结果，无法删除' });
    }

    await query('DELETE FROM datasources WHERE id = ?', [_req.params.id]);
    res.json({ success: true, message: '数据源删除成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
