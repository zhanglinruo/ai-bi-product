/**
 * Validator Agent - SQL 校验器
 * 
 * 负责校验 SQL 安全性和正确性
 * 这是一个规则型 Agent，不需要 LLM
 */

import { RuleBasedAgent } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  ValidatorOutput,
  ValidationError,
  ValidationWarning,
} from '../types';
import { checkSQLSecurity, logAudit } from '../../utils/security';

export interface ValidatorInput {
  sql: string;
  fieldWhitelist?: string[];
  tableWhitelist?: string[];
  userPermissions?: string[];
  maxRows?: number;
  userId?: string;
  sessionId?: string;
}

export class ValidatorAgent extends RuleBasedAgent<ValidatorInput, ValidatorOutput> {
  definition: AgentDefinition = {
    name: 'validator-agent',
    description: '校验 SQL 安全性和正确性',
    version: '2.0.0',
    layer: 'execution',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string' },
        fieldWhitelist: { type: 'array' },
        userPermissions: { type: 'array' },
      },
      required: ['sql'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' },
        errors: { type: 'array' },
        warnings: { type: 'array' },
        fixedSQL: { type: 'string' },
      },
    },
  };
  
  protected async run(input: ValidatorInput, context: AgentContext): Promise<ValidatorOutput> {
    const { sql, fieldWhitelist = [], tableWhitelist = [], userPermissions = [], userId, sessionId } = input;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // 1. 使用增强的安全校验器
    const securityResult = checkSQLSecurity(sql, {
      fieldWhitelist,
      tableWhitelist,
    });
    
    // 转换安全问题为错误
    for (const issue of securityResult.issues) {
      if (issue.severity === 'critical' || issue.severity === 'high') {
        errors.push({
          type: issue.type === 'injection_pattern' ? 'sql_injection' : 
                issue.type === 'dangerous_keyword' ? 'sql_injection' :
                issue.type === 'sensitive_field' ? 'permission_denied' : 'syntax_error',
          message: issue.message,
          severity: issue.severity as any,
          details: { original: issue.details },
        });
      } else if (issue.severity === 'medium' || issue.severity === 'low') {
        warnings.push({
          type: issue.type === 'suspicious_syntax' ? 'deprecated' : 'performance',
          message: issue.message,
          suggestion: '建议修改查询以符合安全规范',
        });
      }
    }
    
    // 2. 检查权限
    if (userPermissions.length > 0 && !userPermissions.includes('query')) {
      errors.push({
        type: 'permission_denied',
        message: '用户没有查询权限',
        severity: 'critical',
      });
    }
    
    // 3. 基础语法检查
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      errors.push({
        type: 'syntax_error',
        message: 'SQL 必须以 SELECT 开头',
        severity: 'critical',
      });
    }
    
    // 4. 检查括号匹配
    const openParens = (sql.match(/\(/g) || []).length;
    const closeParens = (sql.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push({
        type: 'syntax_error',
        message: '括号不匹配',
        severity: 'high',
      });
    }
    
    // 5. 性能警告
    if (!sql.toUpperCase().includes('LIMIT')) {
      warnings.push({
        type: 'performance',
        message: '查询没有 LIMIT，可能返回大量数据',
        suggestion: '建议添加 LIMIT 限制结果数量',
      });
    }
    
    if (!sql.toUpperCase().includes('WHERE') && sql.toUpperCase().includes('FROM')) {
      warnings.push({
        type: 'performance',
        message: '查询没有 WHERE 条件，可能扫描全表',
        suggestion: '建议添加筛选条件',
      });
    }
    
    if (sql.includes('*') && !sql.includes('COUNT(*)')) {
      if (/SELECT\s+\*/i.test(sql)) {
        warnings.push({
          type: 'performance',
          message: '使用 SELECT * 可能返回不必要的字段',
          suggestion: '建议明确指定需要的字段',
        });
      }
    }
    
    // 6. 记录审计日志
    logAudit({
      userId: userId || context.userId || 'unknown',
      sessionId,
      query: 'SQL validation',
      sql,
      riskLevel: securityResult.riskLevel,
      issues: securityResult.issues,
      executed: errors.length === 0,
    });
    
    // 7. 尝试自动修复
    let fixedSQL = sql;
    if (errors.length === 0 && warnings.length > 0) {
      fixedSQL = this.tryFix(sql, warnings);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      fixedSQL: fixedSQL !== sql ? fixedSQL : undefined,
    };
  }
  
  /**
   * 尝试自动修复
   */
  private tryFix(sql: string, warnings: ValidationWarning[]): string {
    let fixed = sql;
    
    // 自动添加 LIMIT
    if (!fixed.toUpperCase().includes('LIMIT')) {
      fixed = fixed.replace(/;?\s*$/, ' LIMIT 1000');
    }
    
    return fixed;
  }
}
