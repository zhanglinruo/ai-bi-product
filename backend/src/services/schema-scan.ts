/**
 * 数据库结构扫描服务
 * 
 * 自动扫描数据源的表结构，提取字段信息
 */

import { query } from '../config/database';
import mysql from 'mysql2/promise';

export interface TableSchema {
  tableName: string;
  tableComment: string;
  rowCount: number;
  columns: ColumnSchema[];
}

export interface ColumnSchema {
  columnName: string;
  columnType: string;
  isNullable: boolean;
  columnKey: string | null;
  columnDefault: string | null;
  columnComment: string;
}

export interface ScanResult {
  datasourceId: string;
  tables: TableSchema[];
  totalCount: number;
  executionTime: number;
}

export class SchemaScanService {
  /**
   * 扫描数据源结构
   */
  async scanDatasource(datasourceId: string, connectionConfig: any): Promise<ScanResult> {
    const startTime = Date.now();
    const tables: TableSchema[] = [];
    
    // 创建临时连接
    const connection = await mysql.createConnection({
      host: connectionConfig.host,
      port: connectionConfig.port || 3306,
      user: connectionConfig.user,
      password: connectionConfig.password,
      database: connectionConfig.database,
    });

    try {
      console.log(`[SchemaScan] 开始扫描数据源: ${datasourceId}`);

      // 1. 获取所有表
      const [tableRows] = await connection.query(`
        SELECT 
          TABLE_NAME as table_name,
          TABLE_COMMENT as table_comment,
          TABLE_ROWS as table_rows
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME
      `, [connectionConfig.database]);

      // 2. 遍历每个表
      for (const tableRow of tableRows as any[]) {
        const tableName = tableRow.table_name;
        
        // 获取表结构
        const columns = await this.scanTableColumns(connection, connectionConfig.database, tableName);
        
        tables.push({
          tableName,
          tableComment: tableRow.table_comment || '',
          rowCount: tableRow.table_rows || 0,
          columns,
        });
      }

      const executionTime = Date.now() - startTime;
      console.log(`[SchemaScan] 扫描完成: ${tables.length} 个表, 耗时 ${executionTime}ms`);

      return {
        datasourceId,
        tables,
        totalCount: tables.length,
        executionTime,
      };
    } finally {
      await connection.end();
    }
  }

  /**
   * 扫描表的字段
   */
  private async scanTableColumns(
    connection: mysql.Connection,
    database: string,
    tableName: string
  ): Promise<ColumnSchema[]> {
    const [columnRows] = await connection.query(`
      SELECT 
        COLUMN_NAME as column_name,
        COLUMN_TYPE as column_type,
        IS_NULLABLE as is_nullable,
        COLUMN_KEY as column_key,
        COLUMN_DEFAULT as column_default,
        COLUMN_COMMENT as column_comment
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [database, tableName]);

    return (columnRows as any[]).map(row => ({
      columnName: row.column_name,
      columnType: row.column_type,
      isNullable: row.is_nullable === 'YES',
      columnKey: row.column_key || null,
      columnDefault: row.column_default,
      columnComment: row.column_comment || '',
    }));
  }

  /**
   * 保存扫描结果到数据库
   */
  async saveScanResult(result: ScanResult): Promise<void> {
    const { datasourceId, tables } = result;

    // 1. 创建扫描历史记录
    const scanId = `scan_${Date.now()}`;
    await query(`
      INSERT INTO schema_scan_history (id, datasource_id, status, tables_count, columns_count, started_at, completed_at)
      VALUES (?, ?, 'completed', ?, ?, NOW(), NOW())
    `, [scanId, datasourceId, tables.length, tables.reduce((sum, t) => sum + t.columns.length, 0)]);

    // 2. 保存表结构
    for (const table of tables) {
      const tableId = `${datasourceId}_${table.tableName}`;
      
      // 插入或更新表信息
      await query(`
        INSERT INTO schema_tables (id, datasource_id, table_name, table_comment, row_count)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          table_comment = VALUES(table_comment),
          row_count = VALUES(row_count),
          updated_at = NOW()
      `, [tableId, datasourceId, table.tableName, table.tableComment, table.rowCount]);

      // 3. 保存字段结构
      for (const column of table.columns) {
        const columnId = `${datasourceId}_${table.tableName}_${column.columnName}`;
        
        await query(`
          INSERT INTO schema_columns (
            id, datasource_id, table_name, column_name, column_type, 
            is_nullable, column_key, column_default, column_comment
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            column_type = VALUES(column_type),
            is_nullable = VALUES(is_nullable),
            column_key = VALUES(column_key),
            column_default = VALUES(column_default),
            column_comment = VALUES(column_comment),
            updated_at = NOW()
        `, [
          columnId,
          datasourceId,
          table.tableName,
          column.columnName,
          column.columnType,
          column.isNullable,
          column.columnKey,
          column.columnDefault,
          column.columnComment,
        ]);
      }
    }

    console.log(`[SchemaScan] 保存完成: ${tables.length} 个表`);
  }

  /**
   * 获取数据源的表结构
   */
  async getDatasourceSchema(datasourceId: string): Promise<TableSchema[]> {
    // 获取所有表
    const tables = await query<any>(`
      SELECT id, table_name, table_comment, row_count
      FROM schema_tables
      WHERE datasource_id = ?
      ORDER BY table_name
    `, [datasourceId]);

    const result: TableSchema[] = [];

    for (const table of tables) {
      // 获取表的字段
      const columns = await query<any>(`
        SELECT 
          column_name, column_type, is_nullable, 
          column_key, column_default, column_comment,
          is_metric, is_dimension, semantic_name, semantic_description
        FROM schema_columns
        WHERE datasource_id = ? AND table_name = ?
        ORDER BY column_name
      `, [datasourceId, table.table_name]);

      result.push({
        tableName: table.table_name,
        tableComment: table.table_comment || '',
        rowCount: table.row_count || 0,
        columns: columns.map((col: any) => ({
          columnName: col.column_name,
          columnType: col.column_type,
          isNullable: col.is_nullable,
          columnKey: col.column_key,
          columnDefault: col.column_default,
          columnComment: col.column_comment || '',
          isMetric: col.is_metric,
          isDimension: col.is_dimension,
          semanticName: col.semantic_name,
          semanticDescription: col.semantic_description,
        })),
      });
    }

    return result;
  }

  /**
   * 检查数据源是否已扫描
   */
  async isScanned(datasourceId: string): Promise<boolean> {
    const [result] = await query<any>(`
      SELECT COUNT(*) as count
      FROM schema_tables
      WHERE datasource_id = ?
    `, [datasourceId]);

    return result.count > 0;
  }

  /**
   * 自动推断字段类型（指标或维度）
   */
  inferFieldType(column: ColumnSchema): { isMetric: boolean; isDimension: boolean } {
    const { columnName, columnType } = column;
    
    // 指标：数值类型且名字包含统计相关词
    const metricPatterns = /amount|total|sum|count|avg|max|min|price|cost|revenue|sales|quantity|qty|num/i;
    const numericTypes = /int|decimal|double|float|numeric|number/i;
    
    const isMetric = numericTypes.test(columnType) && metricPatterns.test(columnName);
    
    // 维度：非数值类型或名字包含维度相关词
    const dimensionPatterns = /name|type|category|status|code|id|date|time|year|month|day|region|area|city|country|user|customer|product/i;
    const isDimension = dimensionPatterns.test(columnName) || !numericTypes.test(columnType);
    
    return { isMetric, isDimension };
  }
}

// 单例
let schemaScanService: SchemaScanService | null = null;

export function getSchemaScanService(): SchemaScanService {
  if (!schemaScanService) {
    schemaScanService = new SchemaScanService();
  }
  return schemaScanService;
}
