/**
 * SQL 安全校验器
 * 
 * 增强 SQL 安全防护
 */

// 危险 SQL 关键词
const DANGEROUS_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE',
  'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'XP_', 'SP_', 
  'UNION', 'INTO OUTFILE', 'INTO DUMPFILE',
];

// SQL 注入模式
const INJECTION_PATTERNS = [
  /;\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)/i,
  /--/,
  /\/\*/,
  /\*\//,
  /\bOR\s+1\s*=\s*1\b/i,
  /\bOR\s+'[^']*'\s*=\s*'[^']*'/i,
  /\bOR\s+"[^"]*"\s*=\s*"[^"]*"/i,
  /\bUNION\s+(ALL\s+)?SELECT\b/i,
  /'\s*OR\s*'/i,
  /"\s*OR\s*"/i,
  /\bSLEEP\s*\(/i,
  /\bBENCHMARK\s*\(/i,
  /\bLOAD_FILE\s*\(/i,
  /\bINTO\s+(OUT|DUMP)FILE\b/i,
];

// 敏感字段（需要脱敏）
const SENSITIVE_FIELDS = [
  'password', 'passwd', 'pwd',
  'secret', 'token', 'api_key', 'apikey',
  'credit_card', 'creditcard', 'card_number',
  'ssn', 'social_security',
  'salary', 'income',
];

// 敏感表
const SENSITIVE_TABLES = [
  'users', 'accounts', 'passwords', 'secrets',
];

export interface SecurityCheckResult {
  isSafe: boolean;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  issues: SecurityIssue[];
  sanitizedSQL?: string;
}

export interface SecurityIssue {
  type: 'dangerous_keyword' | 'injection_pattern' | 'sensitive_field' | 'sensitive_table' | 'suspicious_syntax';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: string;
}

/**
 * SQL 安全校验
 */
export function checkSQLSecurity(sql: string, options: {
  fieldWhitelist?: string[];
  tableWhitelist?: string[];
  allowSensitive?: boolean;
} = {}): SecurityCheckResult {
  const issues: SecurityIssue[] = [];
  let riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical' = 'safe';
  
  // 1. 检查危险关键词
  const upperSQL = sql.toUpperCase();
  for (const keyword of DANGEROUS_KEYWORDS) {
    if (upperSQL.includes(keyword)) {
      issues.push({
        type: 'dangerous_keyword',
        message: `检测到危险关键词: ${keyword}`,
        severity: 'critical',
        details: keyword,
      });
      riskLevel = 'critical';
    }
  }
  
  // 2. 检查 SQL 注入模式
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sql)) {
      issues.push({
        type: 'injection_pattern',
        message: '检测到潜在的 SQL 注入风险',
        severity: 'critical',
        details: pattern.source,
      });
      riskLevel = 'critical';
    }
  }
  
  // 3. 检查敏感字段
  if (!options.allowSensitive) {
    for (const field of SENSITIVE_FIELDS) {
      const regex = new RegExp(`\`${field}\`|\\b${field}\\b`, 'i');
      if (regex.test(sql)) {
        issues.push({
          type: 'sensitive_field',
          message: `访问敏感字段: ${field}`,
          severity: 'high',
          details: field,
        });
        if (riskLevel !== 'critical') riskLevel = 'high';
      }
    }
  }
  
  // 4. 检查敏感表
  if (!options.allowSensitive) {
    for (const table of SENSITIVE_TABLES) {
      const regex = new RegExp(`FROM\s+\`${table}\`|JOIN\s+\`${table}\``, 'i');
      if (regex.test(sql)) {
        issues.push({
          type: 'sensitive_table',
          message: `访问敏感表: ${table}`,
          severity: 'high',
          details: table,
        });
        if (riskLevel !== 'critical') riskLevel = 'high';
      }
    }
  }
  
  // 5. 检查字段白名单
  if (options.fieldWhitelist && options.fieldWhitelist.length > 0) {
    const fieldPattern = /`([^`]+)`|(?<=\s)[a-zA-Z_][a-zA-Z0-9_]*(?=\s*(?:,|FROM|WHERE|GROUP|ORDER|LIMIT|AND|OR))/g;
    const matches = sql.matchAll(fieldPattern);
    
    for (const match of matches) {
      const field = match[1] || match[0];
      const normalizedField = field.toLowerCase();
      
      // 跳过 SQL 关键词
      const sqlKeywords = ['select', 'from', 'where', 'and', 'or', 'group', 'order', 'by', 'having', 'limit', 'as', 'join', 'on', 'left', 'right', 'inner', 'outer'];
      if (sqlKeywords.includes(normalizedField)) continue;
      
      // 检查白名单
      if (!options.fieldWhitelist.some(f => f.toLowerCase() === normalizedField)) {
        issues.push({
          type: 'suspicious_syntax',
          message: `字段不在白名单中: ${field}`,
          severity: 'medium',
          details: field,
        });
        if (riskLevel === 'safe') riskLevel = 'medium';
      }
    }
  }
  
  // 6. 检查表白名单
  if (options.tableWhitelist && options.tableWhitelist.length > 0) {
    const tablePattern = /FROM\s+`([^`]+)`|JOIN\s+`([^`]+)`/gi;
    const matches = sql.matchAll(tablePattern);
    
    for (const match of matches) {
      const table = match[1] || match[2];
      const normalizedTable = table.toLowerCase();
      
      if (!options.tableWhitelist.some(t => t.toLowerCase() === normalizedTable)) {
        issues.push({
          type: 'suspicious_syntax',
          message: `表不在白名单中: ${table}`,
          severity: 'high',
          details: table,
        });
        if (riskLevel !== 'critical') riskLevel = 'high';
      }
    }
  }
  
  // 7. 检查可疑语法
  if (sql.includes('*') && !sql.includes('COUNT(*)')) {
    // SELECT * 可能泄露数据
    if (/SELECT\s+\*/i.test(sql)) {
      issues.push({
        type: 'suspicious_syntax',
        message: '使用 SELECT * 可能返回过多数据',
        severity: 'low',
        details: 'SELECT *',
      });
      if (riskLevel === 'safe') riskLevel = 'low';
    }
  }
  
  // 8. 检查子查询
  if (/\(\s*SELECT/i.test(sql)) {
    issues.push({
      type: 'suspicious_syntax',
      message: '包含子查询，需要额外审查',
      severity: 'low',
      details: 'SUBQUERY',
    });
    if (riskLevel === 'safe') riskLevel = 'low';
  }
  
  return {
    isSafe: riskLevel !== 'critical',
    riskLevel,
    issues,
  };
}

/**
 * 数据脱敏
 */
export function maskSensitiveData(data: Record<string, any>[]): Record<string, any>[] {
  return data.map(row => {
    const maskedRow = { ...row };
    
    for (const field of SENSITIVE_FIELDS) {
      if (maskedRow[field] !== undefined) {
        const value = String(maskedRow[field]);
        if (value.length > 4) {
          maskedRow[field] = value.substring(0, 2) + '****' + value.substring(value.length - 2);
        } else {
          maskedRow[field] = '****';
        }
      }
    }
    
    return maskedRow;
  });
}

/**
 * 记录审计日志
 */
export interface AuditLog {
  timestamp: Date;
  userId: string;
  sessionId?: string;
  query: string;
  sql: string;
  riskLevel: string;
  issues: SecurityIssue[];
  executed: boolean;
  rowCount?: number;
  executionTime?: number;
}

const auditLogs: AuditLog[] = [];
const MAX_AUDIT_LOGS = 10000;

export function logAudit(log: Omit<AuditLog, 'timestamp'>): void {
  auditLogs.push({
    ...log,
    timestamp: new Date(),
  });
  
  // 限制日志数量
  if (auditLogs.length > MAX_AUDIT_LOGS) {
    auditLogs.shift();
  }
}

export function getAuditLogs(options: {
  userId?: string;
  riskLevel?: string;
  limit?: number;
} = {}): AuditLog[] {
  let filtered = [...auditLogs];
  
  if (options.userId) {
    filtered = filtered.filter(log => log.userId === options.userId);
  }
  
  if (options.riskLevel) {
    filtered = filtered.filter(log => log.riskLevel === options.riskLevel);
  }
  
  const limit = options.limit || 100;
  return filtered.slice(-limit);
}

export function getAuditStats(): {
  totalQueries: number;
  riskDistribution: Record<string, number>;
  topUsers: Array<{ userId: string; count: number }>;
} {
  const riskDistribution: Record<string, number> = {};
  const userCounts: Record<string, number> = {};
  
  for (const log of auditLogs) {
    riskDistribution[log.riskLevel] = (riskDistribution[log.riskLevel] || 0) + 1;
    userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
  }
  
  const topUsers = Object.entries(userCounts)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  return {
    totalQueries: auditLogs.length,
    riskDistribution,
    topUsers,
  };
}
