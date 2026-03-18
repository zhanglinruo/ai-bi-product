/**
 * 动态语义映射服务
 * 从数据库加载语义配置，支持热更新
 */

import { query } from '../config/database';

export interface SemanticMetric {
  id: string;
  name: string;
  aliases: string[];
  dbField: string;
  dbTable: string;
  aggregation: 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN';
  description?: string;
}

export interface SemanticDimension {
  id: string;
  name: string;
  aliases: string[];
  dbField: string;
  dbTable: string;
  values?: string[];
  description?: string;
}

export interface SemanticTerm {
  id: string;
  term: string;
  category: string;
  mappings: Record<string, any>;
  description?: string;
}

export interface SemanticConfig {
  metrics: SemanticMetric[];
  dimensions: SemanticDimension[];
  terms: SemanticTerm[];
  lastUpdated: Date;
}

/**
 * 语义映射服务
 */
class SemanticMappingService {
  private config: SemanticConfig | null = null;
  private loading: boolean = false;
  private lastLoadTime: Date | null = null;
  private cacheTimeout: number = 5 * 60 * 1000; // 5分钟缓存
  
  /**
   * 获取语义配置
   */
  async getConfig(): Promise<SemanticConfig> {
    // 检查缓存是否有效
    if (this.config && this.lastLoadTime) {
      const elapsed = Date.now() - this.lastLoadTime.getTime();
      if (elapsed < this.cacheTimeout) {
        return this.config;
      }
    }
    
    // 重新加载
    await this.reload();
    return this.config!;
  }
  
  /**
   * 强制重新加载
   */
  async reload(): Promise<void> {
    if (this.loading) {
      // 等待加载完成
      while (this.loading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }
    
    this.loading = true;
    
    try {
      console.log('[SemanticMapping] 从数据库加载语义配置...');
      
      // 并行加载所有配置
      const [metrics, dimensions, terms] = await Promise.all([
        this.loadMetrics(),
        this.loadDimensions(),
        this.loadTerms(),
      ]);
      
      this.config = {
        metrics,
        dimensions,
        terms,
        lastUpdated: new Date(),
      };
      
      this.lastLoadTime = new Date();
      
      console.log(`[SemanticMapping] 加载完成: ${metrics.length} 指标, ${dimensions.length} 维度, ${terms.length} 术语`);
    } catch (error) {
      console.error('[SemanticMapping] 加载失败:', error);
      
      // 如果没有缓存，返回空配置
      if (!this.config) {
        this.config = {
          metrics: [],
          dimensions: [],
          terms: [],
          lastUpdated: new Date(),
        };
      }
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * 加载指标
   */
  private async loadMetrics(): Promise<SemanticMetric[]> {
    try {
      const results = await query(`
        SELECT id, name, aliases, db_field, db_table, aggregation, description
        FROM semantic_metrics
        WHERE is_active = TRUE
        ORDER BY name
      `);
      
      return results.map((r: any) => ({
        id: r.id,
        name: r.name,
        aliases: this.parseJson(r.aliases, []),
        dbField: r.db_field,
        dbTable: r.db_table,
        aggregation: r.aggregation,
        description: r.description,
      }));
    } catch (error) {
      console.warn('[SemanticMapping] 加载指标失败，使用默认配置');
      return this.getDefaultMetrics();
    }
  }
  
  /**
   * 加载维度
   */
  private async loadDimensions(): Promise<SemanticDimension[]> {
    try {
      const results = await query(`
        SELECT id, name, aliases, db_field, db_table, values, description
        FROM semantic_dimensions
        WHERE is_active = TRUE
        ORDER BY name
      `);
      
      return results.map((r: any) => ({
        id: r.id,
        name: r.name,
        aliases: this.parseJson(r.aliases, []),
        dbField: r.db_field,
        dbTable: r.db_table,
        values: this.parseJson(r.values, undefined),
        description: r.description,
      }));
    } catch (error) {
      console.warn('[SemanticMapping] 加载维度失败，使用默认配置');
      return this.getDefaultDimensions();
    }
  }
  
  /**
   * 加载术语
   */
  private async loadTerms(): Promise<SemanticTerm[]> {
    try {
      const results = await query(`
        SELECT id, term, category, mappings, description
        FROM semantic_terms
        WHERE is_active = TRUE
        ORDER BY term
      `);
      
      return results.map((r: any) => ({
        id: r.id,
        term: r.term,
        category: r.category,
        mappings: this.parseJson(r.mappings, {}),
        description: r.description,
      }));
    } catch (error) {
      console.warn('[SemanticMapping] 加载术语失败，使用默认配置');
      return this.getDefaultTerms();
    }
  }
  
  /**
   * 解析 JSON 字段
   */
  private parseJson<T>(value: any, defaultValue: T): T {
    if (!value) return defaultValue;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return defaultValue;
      }
    }
    return value;
  }
  
  /**
   * 默认指标（降级使用）
   */
  private getDefaultMetrics(): SemanticMetric[] {
    return [
      {
        id: 'metric_sales',
        name: '销售额',
        aliases: ['销售金额', '销售总额', '金额', '总计', '总额'],
        dbField: 'total_amount',
        dbTable: 'orders',
        aggregation: 'SUM',
      },
      {
        id: 'metric_order_count',
        name: '订单数',
        aliases: ['订单量', '订单数量', '订单'],
        dbField: 'order_id',
        dbTable: 'orders',
        aggregation: 'COUNT',
      },
    ];
  }
  
  /**
   * 默认维度（降级使用）
   */
  private getDefaultDimensions(): SemanticDimension[] {
    return [
      {
        id: 'dim_customer_type',
        name: '客户类型',
        aliases: ['客户类别'],
        dbField: 'customer_type',
        dbTable: 'customers',
      },
    ];
  }
  
  /**
   * 默认术语（降级使用）
   */
  private getDefaultTerms(): SemanticTerm[] {
    return [
      {
        id: 'term_retail',
        term: '零售',
        category: 'customer_type',
        mappings: { field: 'customer_type', value: 'RETAIL' },
      },
    ];
  }
  
  /**
   * 添加指标
   */
  async addMetric(metric: Omit<SemanticMetric, 'id'>): Promise<string> {
    const id = `metric_${Date.now()}`;
    
    await query(`
      INSERT INTO semantic_metrics (id, name, aliases, db_field, db_table, aggregation, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, metric.name, JSON.stringify(metric.aliases), metric.dbField, metric.dbTable, metric.aggregation, metric.description]);
    
    // 清除缓存
    this.config = null;
    
    return id;
  }
  
  /**
   * 更新指标
   */
  async updateMetric(id: string, updates: Partial<SemanticMetric>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.name) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.aliases) { fields.push('aliases = ?'); values.push(JSON.stringify(updates.aliases)); }
    if (updates.dbField) { fields.push('db_field = ?'); values.push(updates.dbField); }
    if (updates.dbTable) { fields.push('db_table = ?'); values.push(updates.dbTable); }
    if (updates.aggregation) { fields.push('aggregation = ?'); values.push(updates.aggregation); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    
    if (fields.length > 0) {
      values.push(id);
      await query(`UPDATE semantic_metrics SET ${fields.join(', ')} WHERE id = ?`, values);
      this.config = null;
    }
  }
  
  /**
   * 删除指标
   */
  async deleteMetric(id: string): Promise<void> {
    await query('UPDATE semantic_metrics SET is_active = FALSE WHERE id = ?', [id]);
    this.config = null;
  }
  
  /**
   * 添加维度
   */
  async addDimension(dimension: Omit<SemanticDimension, 'id'>): Promise<string> {
    const id = `dim_${Date.now()}`;
    
    await query(`
      INSERT INTO semantic_dimensions (id, name, aliases, db_field, db_table, values, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, dimension.name, JSON.stringify(dimension.aliases), dimension.dbField, dimension.dbTable, 
        dimension.values ? JSON.stringify(dimension.values) : null, dimension.description]);
    
    this.config = null;
    return id;
  }
  
  /**
   * 添加术语
   */
  async addTerm(term: Omit<SemanticTerm, 'id'>): Promise<string> {
    const id = `term_${Date.now()}`;
    
    await query(`
      INSERT INTO semantic_terms (id, term, category, mappings, description)
      VALUES (?, ?, ?, ?, ?)
    `, [id, term.term, term.category, JSON.stringify(term.mappings), term.description]);
    
    this.config = null;
    return id;
  }
}

// 单例
let semanticMappingService: SemanticMappingService | null = null;

export function getSemanticMappingService(): SemanticMappingService {
  if (!semanticMappingService) {
    semanticMappingService = new SemanticMappingService();
  }
  return semanticMappingService;
}

// 兼容旧代码的导出
export async function getSemanticConfig(): Promise<SemanticConfig> {
  return getSemanticMappingService().getConfig();
}
