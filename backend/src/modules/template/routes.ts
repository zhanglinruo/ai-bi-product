/**
 * SQL 模板管理 API
 */

import { Router, Request, Response } from 'express';
import { getSQLTemplateService } from '../../services/sql-template';
import { getFriendlyError } from '../../utils/errors';

const router = Router();
const templateService = getSQLTemplateService();

router.post('/', async (req: Request, res: Response) => {
  try {
    const template = await templateService.createTemplate(req.body);
    res.json({
      success: true,
      data: template,
      message: '模板创建成功'
    });
  } catch (error: any) {
    console.error('[Template API] 创建模板失败:', error);
    const friendly = getFriendlyError(error);
    res.status(500).json({
      success: false,
      message: friendly.userMessage,
      hint: friendly.hint
    });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, datasource_id, is_active, page, page_size } = req.query;

    const result = await templateService.listTemplates({
      category: category as string,
      datasource_id: datasource_id as string,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      page: page ? parseInt(page as string) : 1,
      pageSize: page_size ? parseInt(page_size as string) : 20,
    });

    res.json({
      success: true,
      data: result.templates,
      pagination: {
        page: page ? parseInt(page as string) : 1,
        pageSize: page_size ? parseInt(page_size as string) : 20,
        total: result.total
      }
    });
  } catch (error: any) {
    console.error('[Template API] 获取模板列表失败:', error);
    const friendly = getFriendlyError(error);
    res.status(500).json({
      success: false,
      message: friendly.userMessage
    });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, top_k, datasource_id } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: '查询参数 q 不能为空'
      });
    }

    const results = await templateService.findSimilarTemplates(
      q as string,
      top_k ? parseInt(top_k as string) : 5,
      datasource_id as string
    );

    res.json({
      success: true,
      data: results,
      query: q
    });
  } catch (error: any) {
    console.error('[Template API] 搜索模板失败:', error);
    const friendly = getFriendlyError(error);
    res.status(500).json({
      success: false,
      message: friendly.userMessage
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const template = await templateService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: '模板不存在'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error: any) {
    console.error('[Template API] 获取模板详情失败:', error);
    const friendly = getFriendlyError(error);
    res.status(500).json({
      success: false,
      message: friendly.userMessage
    });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const success = await templateService.updateTemplate(id, req.body);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: '模板不存在或更新失败'
      });
    }

    res.json({
      success: true,
      message: '模板更新成功'
    });
  } catch (error: any) {
    console.error('[Template API] 更新模板失败:', error);
    const friendly = getFriendlyError(error);
    res.status(500).json({
      success: false,
      message: friendly.userMessage
    });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const success = await templateService.deleteTemplate(id);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: '模板不存在或删除失败'
      });
    }

    res.json({
      success: true,
      message: '模板删除成功'
    });
  } catch (error: any) {
    console.error('[Template API] 删除模板失败:', error);
    const friendly = getFriendlyError(error);
    res.status(500).json({
      success: false,
      message: friendly.userMessage
    });
  }
});

router.post('/:id/use', async (req: Request, res: Response) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    await templateService.incrementUsage(id);
    res.json({
      success: true,
      message: '使用计数已更新'
    });
  } catch (error: any) {
    console.error('[Template API] 更新使用计数失败:', error);
    const friendly = getFriendlyError(error);
    res.status(500).json({
      success: false,
      message: friendly.userMessage
    });
  }
});

export default router;
