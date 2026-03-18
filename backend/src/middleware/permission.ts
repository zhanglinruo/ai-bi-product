/**
 * 权限中间件
 * 
 * 检查用户是否有特定权限
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';

// 权限定义
export const PERMISSIONS = {
  // 查询相关
  'query:execute': '执行查询',
  'query:advanced': '高级查询',
  
  // 历史相关
  'history:view': '查看历史',
  'history:save': '保存历史',
  'history:delete': '删除历史',
  
  // 导出相关
  'export:csv': '导出 CSV',
  'export:excel': '导出 Excel',
  
  // 数据源相关
  'datasource:view': '查看数据源',
  'datasource:create': '创建数据源',
  'datasource:edit': '编辑数据源',
  'datasource:delete': '删除数据源',
  
  // 用户管理
  'user:manage': '用户管理',
  
  // 权限管理
  'permission:manage': '权限管理',
  
  // 审计
  'audit:view': '查看审计日志',
};

// 角色默认权限
const ROLE_PERMISSIONS: Record<string, string[]> = {
  user: [
    'query:execute',
    'history:view',
    'history:save',
    'export:csv',
  ],
  analyst: [
    'query:execute',
    'query:advanced',
    'history:view',
    'history:save',
    'export:csv',
    'export:excel',
    'datasource:view',
  ],
  admin: [
    'query:execute',
    'query:advanced',
    'history:view',
    'history:save',
    'history:delete',
    'export:csv',
    'export:excel',
    'datasource:view',
    'datasource:create',
    'datasource:edit',
    'datasource:delete',
    'user:manage',
    'permission:manage',
    'audit:view',
  ],
};

/**
 * 检查用户是否有指定权限
 */
export function hasPermission(userRole: string, permission: string): boolean {
  const rolePerms = ROLE_PERMISSIONS[userRole] || [];
  return rolePerms.includes(permission);
}

/**
 * 权限检查中间件
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证',
      });
      return;
    }
    
    const userRole = req.user.role;
    
    if (!hasPermission(userRole, permission)) {
      // 记录权限拒绝日志
      await query(
        'INSERT INTO audit_logs (id, user_id, action, resource_type, details, created_at) VALUES (UUID(), ?, ?, ?, ?, NOW())',
        [req.user.id, 'permission_denied', permission, JSON.stringify({ permission, path: req.path })]
      ).catch(() => {});
      
      res.status(403).json({
        success: false,
        message: '权限不足',
        required: permission,
      });
      return;
    }
    
    next();
  };
}

/**
 * 数据源权限检查
 */
export function requireDatasourcePermission(permission: 'read' | 'write' | 'admin') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证',
      });
      return;
    }
    
    // 管理员跳过检查
    if (req.user.role === 'admin') {
      next();
      return;
    }
    
    const datasourceId = req.params.id || req.body.datasource_id;
    
    if (!datasourceId) {
      // 创建数据源时，检查是否有创建权限
      if (req.path.endsWith('/datasources') && req.method === 'POST') {
        if (!hasPermission(req.user.role, 'datasource:create')) {
          res.status(403).json({
            success: false,
            message: '没有创建数据源的权限',
          });
          return;
        }
      }
      next();
      return;
    }
    
    // 检查数据源权限
    const permissions = await query<any[]>(
      'SELECT permission FROM datasource_permissions WHERE datasource_id = ? AND user_id = ?',
      [datasourceId, req.user.id]
    );
    
    if (permissions.length === 0) {
      res.status(403).json({
        success: false,
        message: '没有访问该数据源的权限',
      });
      return;
    }
    
    const userPerm = permissions[0].permission as 'read' | 'write' | 'admin';
    const permLevel: Record<string, number> = { read: 1, write: 2, admin: 3 };
    
    if (permLevel[userPerm] < permLevel[permission]) {
      res.status(403).json({
        success: false,
        message: `需要 ${permission} 权限`,
      });
      return;
    }
    
    next();
  };
}

/**
 * 获取用户的所有权限
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const users = await query<any[]>('SELECT role FROM users WHERE id = ?', [userId]);
  
  if (users.length === 0) {
    return [];
  }
  
  const role = users[0].role;
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * 获取用户可访问的数据源列表
 */
export async function getUserDatasources(userId: string, userRole: string): Promise<string[]> {
  // 管理员可以访问所有数据源
  if (userRole === 'admin') {
    const datasources = await query<any[]>('SELECT id FROM datasources WHERE status = ?', ['active']);
    return datasources.map(d => d.id);
  }
  
  // 普通用户只能访问授权的数据源
  const permissions = await query<any[]>(
    'SELECT datasource_id FROM datasource_permissions WHERE user_id = ?',
    [userId]
  );
  
  return permissions.map(p => p.datasource_id);
}
