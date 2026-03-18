/**
 * 审计日志服务
 */

import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogData {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 记录审计日志
 */
export async function logAudit(data: AuditLogData): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        uuidv4(),
        data.userId || null,
        data.action,
        data.resourceType || null,
        data.resourceId || null,
        data.details ? JSON.stringify(data.details) : null,
        data.ipAddress || null,
        data.userAgent || null,
      ]
    );
  } catch (error) {
    console.error('审计日志记录失败:', error);
  }
}

/**
 * 查询审计日志
 */
export async function getAuditLogs(options: {
  userId?: string;
  action?: string;
  resourceType?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  
  if (options.userId) {
    conditions.push('user_id = ?');
    params.push(options.userId);
  }
  
  if (options.action) {
    conditions.push('action = ?');
    params.push(options.action);
  }
  
  if (options.resourceType) {
    conditions.push('resource_type = ?');
    params.push(options.resourceType);
  }
  
  if (options.startTime) {
    conditions.push('created_at >= ?');
    params.push(options.startTime);
  }
  
  if (options.endTime) {
    conditions.push('created_at <= ?');
    params.push(options.endTime);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const offset = options.offset || 0;
  
  const logs = await query<any[]>(
    `SELECT al.*, u.username 
     FROM audit_logs al 
     LEFT JOIN users u ON al.user_id = u.id 
     ${whereClause} 
     ORDER BY al.created_at DESC 
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  
  return logs;
}

/**
 * 获取用户活动统计
 */
export async function getUserActivityStats(userId: string, days: number = 7): Promise<any> {
  const stats = await query<any[]>(
    `SELECT 
      action,
      COUNT(*) as count,
      DATE(created_at) as date
     FROM audit_logs 
     WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY action, DATE(created_at)
     ORDER BY date DESC`,
    [userId, days]
  );
  
  return stats;
}

/**
 * 获取系统活动概览
 */
export async function getSystemActivityOverview(days: number = 7): Promise<any> {
  const overview = await query<any[]>(
    `SELECT 
      action,
      COUNT(*) as count,
      COUNT(DISTINCT user_id) as unique_users
     FROM audit_logs 
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY action
     ORDER BY count DESC`,
    [days]
  );
  
  return overview;
}
