/**
 * 语义映射管理 API
 */

import { Router, Request, Response } from 'express';
import { getSemanticMappingService } from '../../services/semantic-mapping';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

// 管理员检查中间件
const adminOnly = (req: Request, res: Response, next: Function) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: '需要管理员权限',
    });
  }
  next();
};

/**
 * 获取当前语义配置
 */
router.get('/config', authMiddleware, async (req: Request, res: Response) => {
  try {
    const service = getSemanticMappingService();
    const config = await service.getConfig();
    
    res.json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 重新加载语义配置
 */
router.post('/reload', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const service = getSemanticMappingService();
    await service.reload();
    const config = await service.getConfig();
    
    res.json({
      success: true,
      message: '语义配置已重新加载',
      data: config,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 添加指标
 */
router.post('/metrics', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const service = getSemanticMappingService();
    const id = await service.addMetric(req.body);
    
    res.json({
      success: true,
      message: '指标添加成功',
      data: { id },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 更新指标
 */
router.put('/metrics/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const service = getSemanticMappingService();
    await service.updateMetric(id, req.body);
    
    res.json({
      success: true,
      message: '指标更新成功',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 删除指标
 */
router.delete('/metrics/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const service = getSemanticMappingService();
    await service.deleteMetric(id);
    
    res.json({
      success: true,
      message: '指标已删除',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 添加维度
 */
router.post('/dimensions', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const service = getSemanticMappingService();
    const id = await service.addDimension(req.body);
    
    res.json({
      success: true,
      message: '维度添加成功',
      data: { id },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * 添加术语
 */
router.post('/terms', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const service = getSemanticMappingService();
    const id = await service.addTerm(req.body);
    
    res.json({
      success: true,
      message: '术语添加成功',
      data: { id },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
