import { AbstractTool, ToolDefinition, ToolExecutionContext, ToolResult } from './types';
import { query } from '../../config/database';

export interface EntityFixInput {
  sql: string;
}

export interface EntityFixOutput {
  fixedSql: string;
  fixes: { field: string; original: string; corrected: string; method: string }[];
}

export class EntityFixerTool extends AbstractTool {
  definition: ToolDefinition = {
    name: 'entityFixer',
    description: '枚举值探查和SQL改写工具 - 根据SQL的WHERE条件，探查字段的实际枚举值，自动匹配并修正SQL中的条件值',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: '需要修正的SQL语句' }
      },
      required: ['sql']
    },
    outputSchema: {
      type: 'object',
      properties: {
        fixedSql: { type: 'string' },
        fixes: { type: 'array' }
      }
    }
  };

  async execute(input: EntityFixInput, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { sql } = input;
      console.log('[EntityFixer] 开始探查枚举值...');
      
      const fixes: { field: string; original: string; corrected: string; method: string }[] = [];
      
      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+GROUP|\s+ORDER|\s+LIMIT|\s*$)/is);
      if (!whereMatch) {
        return { success: true, data: { fixedSql: sql, fixes: [] } };
      }
      
      const whereClause = whereMatch[1];
      const conditionPattern = /(\w+)\s*(?:=|IN)\s*\(?['"`]([^'"`]+)['"`]/gi;
      
      let match;
      while ((match = conditionPattern.exec(whereClause)) !== null) {
        const fieldName = match[1];
        const fieldValue = match[2].trim();
        
        const tableMatch = sql.match(/FROM\s+`?(\w+)`?/i);
        if (!tableMatch) continue;
        
        const tableName = tableMatch[1];
        
        const enumValues = await this.getEnumValues(tableName, fieldName);
        if (enumValues.length === 0) continue;
        
        const corrected = this.findBestMatch(fieldValue, enumValues);
        if (corrected && corrected !== fieldValue) {
          fixes.push({
            field: fieldName,
            original: fieldValue,
            corrected: corrected,
            method: 'enum_probe'
          });
          console.log(`[EntityFixer] ${fieldName}: "${fieldValue}" -> "${corrected}"`);
        }
      }
      
      let fixedSql = sql;
      for (const fix of fixes) {
        const escaped = fix.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        fixedSql = fixedSql.replace(new RegExp(`'${escaped}'`, 'gi'), `'${fix.corrected}'`);
        fixedSql = fixedSql.replace(new RegExp(`"${escaped}"`, 'gi'), `"${fix.corrected}"`);
      }
      
      console.log(`[EntityFixer] 修正完成，共修正 ${fixes.length} 处`);
      
      return {
        success: true,
        data: { fixedSql, fixes }
      };
    } catch (error: any) {
      console.error('[EntityFixer] 错误:', error.message);
      return { success: false, error: error.message };
    }
  }

  private async getEnumValues(tableName: string, fieldName: string): Promise<string[]> {
    try {
      const results = await query(
        `SELECT DISTINCT \`${fieldName}\` as val FROM \`${tableName}\` WHERE \`${fieldName}\` IS NOT NULL AND \`${fieldName}\` != '' LIMIT 100`,
        []
      ) as any[];
      
      return results.map(r => r.val).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  private findBestMatch(inputValue: string, enumValues: string[]): string | null {
    const normalizedInput = this.normalize(inputValue);
    
    for (const enumVal of enumValues) {
      const normalizedEnum = this.normalize(enumVal);
      
      if (normalizedEnum === normalizedInput) return enumVal;
      if (normalizedEnum.includes(normalizedInput) || normalizedInput.includes(normalizedEnum)) return enumVal;
      
      const similarity = this.calculateSimilarity(normalizedInput, normalizedEnum);
      if (similarity >= 0.7) return enumVal;
    }
    
    return null;
  }

  private normalize(value: string): string {
    return value
      .replace(/省$/, '')
      .replace(/市$/, '')
      .replace(/县$/, '')
      .replace(/区$/, '')
      .toLowerCase()
      .trim();
  }

  private calculateSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    const len1 = s1.length;
    const len2 = s2.length;
    const dp: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
    
    for (let i = 0; i <= len1; i++) dp[i][0] = i;
    for (let j = 0; j <= len2; j++) dp[0][j] = j;
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i][j - 1] + 1, dp[i - 1][j] + 1);
        }
      }
    }
    
    const distance = dp[len1][len2];
    return 1 - distance / Math.max(len1, len2);
  }
}
