/**
 * 数据库 Schema 工具
 */

import dbPool from '../config/database';

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  key: string;
  defaultValue: any;
}

/**
 * 获取数据库所有表的结构
 */
export async function getDatabaseSchema(): Promise<TableSchema[]> {
  const tables: TableSchema[] = [];
  
  try {
    // 获取所有表名
    const [tableRows] = await dbPool.query('SHOW TABLES');
    
    for (const tableRow of tableRows as any[]) {
      const tableName = Object.values(tableRow)[0] as string;
      
      // 获取表结构
      const [columnRows] = await dbPool.query(`DESCRIBE \`${tableName}\``);
      
      const columns: ColumnSchema[] = (columnRows as any[]).map(col => ({
        name: col.Field,
        type: col.Type,
        nullable: col.Null === 'YES',
        key: col.Key,
        defaultValue: col.Default,
      }));
      
      tables.push({
        name: tableName,
        columns,
      });
    }
    
    return tables;
  } catch (error) {
    console.error('获取数据库 Schema 失败:', error);
    return [];
  }
}

/**
 * 获取表的示例数据
 */
export async function getTableSample(tableName: string, limit: number = 3): Promise<any[]> {
  try {
    const [rows] = await dbPool.query(`SELECT * FROM \`${tableName}\` LIMIT ?`, [limit]);
    return rows as any[];
  } catch (error) {
    console.error(`获取表 ${tableName} 示例数据失败:`, error);
    return [];
  }
}

/**
 * 获取表的统计信息
 */
export async function getTableStats(tableName: string): Promise<{ rowCount: number }> {
  try {
    const [rows] = await dbPool.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
    return { rowCount: (rows as any[])[0].count };
  } catch (error) {
    console.error(`获取表 ${tableName} 统计信息失败:`, error);
    return { rowCount: 0 };
  }
}

/**
 * 生成 Schema 描述文本（用于 LLM prompt）
 */
export function generateSchemaDescription(tables: TableSchema[]): string {
  return tables.map(table => {
    const columns = table.columns.map(col => {
      let desc = `  - ${col.name}: ${col.type}`;
      if (col.key === 'PRI') desc += ' (主键)';
      else if (col.key === 'UNI') desc += ' (唯一)';
      else if (col.key === 'MUL') desc += ' (索引)';
      return desc;
    }).join('\n');
    
    return `表: ${table.name}\n${columns}`;
  }).join('\n\n');
}
