/**
 * 审计日志路由
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { getAuditLogs, getUserActivityStats, getSystemActivityOverview } from '../services/audit';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 获取审计日志列表（需要 admin 权限）
router.get('/', requirePermission('audit:view'), async (req: Request, res: Response) => {
  try {
    const { userId, action, resourceType, startTime, endTime, limit, offset } = req.query;
    
    const logs = await getAuditLogs({
      userId: userId as string,
      action: action as string,
      resourceType: resourceType as string,
      startTime: startTime ? new Date(startTime as string) : undefined,
      endTime: endTime ? new Date(endTime as string) : undefined,
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0,
    });
    
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取当前用户的活动统计
router.get('/my-stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 7;
    
    const stats = await getUserActivityStats(userId, days);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取系统活动概览（需要 admin 权限）
router.get('/overview', requirePermission('audit:view'), async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const overview = await getSystemActivityOverview(days);
    res.json({ success: true, data: overview });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
