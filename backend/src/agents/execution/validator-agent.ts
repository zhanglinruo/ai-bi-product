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

export interface ValidatorInput {
  sql: string;
  fieldWhitelist: string[];
  userPermissions?: string[];
  maxRows?: number;
}

export class ValidatorAgent extends RuleBasedAgent<ValidatorInput, ValidatorOutput> {
  definition: AgentDefinition = {
    name: 'validator-agent',
    description: '校验 SQL 安全性和正确性',
    version: '1.0.0',
    layer: 'execution',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string' },
        fieldWhitelist: { type: 'array' },
        userPermissions: { type: 'array' },
      },
      required: ['sql', 'fieldWhitelist'],
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
  
  // 危险 SQL 关键词
  private dangerousKeywords = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE',
    'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'xp_', 'sp_', 'UNION',
  ];
  
  // SQL 注入模式
  private injectionPatterns = [
    /;\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)/i,
    /--/,
    /\/\*/,
    /\bOR\s+1\s*=\s*1\b/i,
    /\bOR\s+''\s*=\s*''\b/i,
    /UNION\s+SELECT/i,
  ];
  
  protected async run(input: ValidatorInput, context: AgentContext): Promise<ValidatorOutput> {
    const { sql, fieldWhitelist, userPermissions, maxRows = 1000 } = input;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let fixedSQL = sql;
    
    // 1. 检查危险关键词
    const dangerousError = this.checkDangerousKeywords(sql);
    if (dangerousError) {
      errors.push(dangerousError);
    }
    
    // 2. 检查 SQL 注入
    const injectionError = this.checkSQLInjection(sql);
    if (injectionError) {
      errors.push(injectionError);
    }
    
    // 3. 检查字段白名单
    const fieldErrors = this.checkFieldWhitelist(sql, fieldWhitelist);
    errors.push(...fieldErrors);
    
    // 4. 检查权限
    if (userPermissions && userPermissions.length > 0) {
      const permError = this.checkPermissions(sql, userPermissions);
      if (permError) {
        errors.push(permError);
      }
    }
    
    // 5. 语法检查（简化版）
    const syntaxError = this.checkSyntax(sql);
    if (syntaxError) {
      errors.push(syntaxError);
    }
    
    // 6. 性能警告
    const perfWarnings = this.checkPerformance(sql, maxRows);
    warnings.push(...perfWarnings);
    
    // 7. 尝试自动修复
    if (errors.length === 0 || errors.every(e => e.severity !== 'critical')) {
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
   * 检查危险关键词
   */
  private checkDangerousKeywords(sql: string): ValidationError | null {
    const upperSQL = sql.toUpperCase();
    
    for (const keyword of this.dangerousKeywords) {
      if (upperSQL.includes(keyword)) {
        return {
          type: 'sql_injection',
          message: `SQL 包含危险关键词: ${keyword}`,
          severity: 'critical',
        };
      }
    }
    
    return null;
  }
  
  /**
   * 检查 SQL 注入
   */
  private checkSQLInjection(sql: string): ValidationError | null {
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(sql)) {
        return {
          type: 'sql_injection',
          message: `检测到潜在的 SQL 注入风险`,
          severity: 'critical',
          details: { pattern: pattern.source },
        };
      }
    }
    
    return null;
  }
  
  /**
   * 检查字段白名单
   */
  private checkFieldWhitelist(sql: string, whitelist: string[]): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // 提取 SQL 中的字段名（简化版）
    const fieldPattern = /[`"]?(\w+)[`"]?\s*(?:,|\sFROM|\sWHERE|\sGROUP|\sORDER|\sHAVING|AS)/gi;
    const matches = sql.matchAll(fieldPattern);
    
    for (const match of matches) {
      const field = match[1].toLowerCase();
      
      // 跳过 SQL 关键词
      const sqlKeywords = ['select', 'from', 'where', 'and', 'or', 'group', 'order', 'by', 'having', 'limit', 'as'];
      if (sqlKeywords.includes(field)) continue;
      
      // 检查是否在白名单中
      if (whitelist.length > 0 && !whitelist.some(f => f.toLowerCase() === field)) {
        errors.push({
          type: 'field_not_allowed',
          field: match[1],
          message: `字段 "${match[1]}" 不在白名单中`,
          severity: 'high',
        });
      }
    }
    
    return errors;
  }
  
  /**
   * 检查权限
   */
  private checkPermissions(sql: string, permissions: string[]): ValidationError | null {
    // 简化版：检查是否有查询权限
    if (!permissions.includes('query')) {
      return {
        type: 'permission_denied',
        message: '用户没有查询权限',
        severity: 'critical',
      };
    }
    
    return null;
  }
  
  /**
   * 语法检查
   */
  private checkSyntax(sql: string): ValidationError | null {
    // 检查基本语法
    const upperSQL = sql.trim().toUpperCase();
    
    if (!upperSQL.startsWith('SELECT')) {
      return {
        type: 'syntax_error',
        message: 'SQL 必须以 SELECT 开头',
        severity: 'critical',
      };
    }
    
    // 检查括号匹配
    const openParens = (sql.match(/\(/g) || []).length;
    const closeParens = (sql.match(/\)/g) || []).length;
    
    if (openParens !== closeParens) {
      return {
        type: 'syntax_error',
        message: '括号不匹配',
        severity: 'high',
      };
    }
    
    return null;
  }
  
  /**
   * 性能检查
   */
  private checkPerformance(sql: string, maxRows: number): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const upperSQL = sql.toUpperCase();
    
    // 没有 LIMIT
    if (!upperSQL.includes('LIMIT')) {
      warnings.push({
        type: 'performance',
        message: '查询没有 LIMIT，可能返回大量数据',
        suggestion: `建议添加 LIMIT ${maxRows}`,
      });
    }
    
    // 没有 WHERE
    if (!upperSQL.includes('WHERE')) {
      warnings.push({
        type: 'performance',
        message: '查询没有 WHERE 条件，可能扫描全表',
        suggestion: '建议添加筛选条件',
      });
    }
    
    // SELECT *
    if (upperSQL.includes('SELECT *') || upperSQL.includes('SELECT  *')) {
      warnings.push({
        type: 'performance',
        message: '使用 SELECT * 可能返回不必要的字段',
        suggestion: '建议明确指定需要的字段',
      });
    }
    
    return warnings;
  }
  
  /**
   * 尝试自动修复
   */
  private tryFix(sql: string, warnings: ValidationWarning[]): string {
    let fixed = sql;
    
    // 自动添加 LIMIT
    const noLimit = !sql.toUpperCase().includes('LIMIT');
    if (noLimit && warnings.some(w => w.type === 'performance' && w.message.includes('LIMIT'))) {
      fixed = fixed.replace(/;?\s*$/, ' LIMIT 1000');
    }
    
    return fixed;
  }
}
