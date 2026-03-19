/**
 * 查询历史管理
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 获取查询历史
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const history = await query<any[]>(
      `SELECT id, question, sql_generated, conclusion, row_count, execution_time, status, created_at
       FROM query_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
    
    // 获取总数
    const countResult = await query<any[]>(
      'SELECT COUNT(*) as total FROM query_history WHERE user_id = ?',
      [userId]
    );
    
    res.json({
      success: true,
      data: history,
      total: countResult[0]?.total || 0,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存查询历史
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { query_text, sql, result_summary, row_count, execution_time } = req.body;

    if (!query_text) {
      return res.status(400).json({ success: false, message: '查询内容不能为空' });
    }

    const id = uuidv4();

    await query(
      `INSERT INTO query_history (id, user_id, question, sql_generated, conclusion, row_count, execution_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success')`,
      [id, userId, query_text, sql, result_summary, row_count, execution_time]
    );

    res.status(201).json({
      success: true,
      message: '保存成功',
      data: { id },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取单条历史
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const history = await query<any[]>(
      'SELECT * FROM query_history WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    
    if (history.length === 0) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    
    res.json({ success: true, data: history[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除历史
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const result = await query<any[]>(
      'DELETE FROM query_history WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    
    res.json({ success: true, message: '删除成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 切换收藏状态
router.put('/:id/favorite', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    // 获取当前状态
    const history = await query<any[]>(
      'SELECT is_favorite FROM query_history WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    
    if (history.length === 0) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    
    const newStatus = !history[0].is_favorite;
    
    await query(
      'UPDATE query_history SET is_favorite = ? WHERE id = ?',
      [newStatus, req.params.id]
    );
    
    res.json({
      success: true,
      message: newStatus ? '已收藏' : '已取消收藏',
      data: { is_favorite: newStatus },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
