import { semanticService } from './service';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class SQLValidator {
  async validate(sql: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const whitelist = await semanticService.getFieldWhitelist();
    const allowedTables = [...new Set(whitelist.map(w => w.table))];
    const allowedFields: Record<string, string[]> = {};
    
    for (const w of whitelist) {
      if (!allowedFields[w.table]) {
        allowedFields[w.table] = [];
      }
      allowedFields[w.table].push(w.field);
    }

    const normalizedSQL = sql.trim().toLowerCase();
    
    const tableMatch = normalizedSQL.match(/from\s+`?(\w+)`?/);
    if (tableMatch) {
      const tableName = tableMatch[1];
      if (!allowedTables.includes(tableName)) {
        errors.push(`使用了未授权的表: ${tableName}`);
      } else {
        const selectMatch = normalizedSQL.match(/select\s+(.+?)\s+from/is);
        if (selectMatch && selectMatch[1] !== '*') {
          const selectedFields = selectMatch[1].split(',').map(f => {
            const cleanField = f.replace(/\s+as\s+\w+/i, '').trim();
            const fieldMatch = cleanField.match(/`?(\w+)`?$/);
            return fieldMatch ? fieldMatch[1].trim() : cleanField;
          });
          
          for (const field of selectedFields) {
            if (field.includes('(') || field === '*') continue;
            
            const isAggregation = /sum|count|avg|min|max/i.test(field);
            const isCalculated = /case|if|null|coalesce/i.test(field);
            
            if (!isAggregation && !isCalculated) {
              if (!allowedFields[tableName]?.includes(field)) {
                errors.push(`表 ${tableName} 使用了未授权的字段: ${field}`);
              }
            }
          }
        }
      }
    } else {
      errors.push('SQL 语句缺少 FROM 子句');
    }

    const dangerousKeywords = ['insert', 'update', 'delete', 'drop', 'truncate', 'alter', 'create'];
    for (const keyword of dangerousKeywords) {
      const regex = new RegExp('\\b' + keyword + '\\b', 'i');
      if (regex.test(normalizedSQL)) {
        errors.push('禁止使用 ' + keyword.toUpperCase() + ' 操作');
      }
    }

    if (!normalizedSQL.startsWith('select')) {
      errors.push('只允许 SELECT 查询');
    }

    if (errors.length === 0) {
      console.log('[SQL校验] ✅ 校验通过');
    } else {
      console.log('[SQL校验] ❌ 校验失败:', errors);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

export const sqlValidator = new SQLValidator();
