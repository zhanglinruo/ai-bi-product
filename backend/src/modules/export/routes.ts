/**
 * 导出路由
 * 
 * 支持 CSV 和 Excel 导出
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

/**
 * 导出数据为 CSV
 */
router.post('/csv', async (req: Request, res: Response) => {
  try {
    const { data, filename = 'export' } = req.body;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ success: false, message: '没有可导出的数据' });
    }
    
    // 生成 CSV
    const keys = Object.keys(data[0]);
    
    let csv = keys.join(',') + '\n';
    data.forEach((row: any) => {
      csv += keys.map(k => {
        const val = row[k];
        // 处理包含逗号的值
        if (typeof val === 'string' && val.includes(',')) {
          return `"${val}"`;
        }
        return val ?? '';
      }).join(',') + '\n';
    });
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    
    // 添加 BOM 以支持 Excel 正确显示中文
    res.send('\ufeff' + csv);
    
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 导出数据为 Excel
 */
router.post('/excel', async (req: Request, res: Response) => {
  try {
    const { data, filename = 'export', sheetName = 'Sheet1' } = req.body;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ success: false, message: '没有可导出的数据' });
    }
    
    // 动态导入 xlsx
    const XLSX = await import('xlsx');
    
    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    
    // 创建工作表
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // 设置列宽
    const keys = Object.keys(data[0]);
    const colWidths = keys.map(key => ({ wch: Math.max(key.length * 2, 15) }));
    worksheet['!cols'] = colWidths;
    
    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // 生成 Excel 文件
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    
    res.send(buffer);
    
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
