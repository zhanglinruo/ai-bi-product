/**
 * 数据源向量索引服务
 * 
 * 根据数据源动态加载语义配置，构建向量索引
 */

import { getLocalEmbeddingService, LocalEmbeddingService } from './local-embedding';
import { query } from '../config/database';

export interface DatasourceVectorIndex {
  datasourceId: string;
  metrics: Array<{
    field: string;
    table: string;
    name: string;
    aggregation: string;
    aliases: string[];
  }>;
  dimensions: Array<{
    field: string;
    table: string;
    name: string;
    aliases: string[];
  }>;
  indexedAt: Date;
}

export class DatasourceVectorService {
  private embeddingService: LocalEmbeddingService;
  private indexedDatasources: Map<string, DatasourceVectorIndex> = new Map();

  constructor() {
    this.embeddingService = getLocalEmbeddingService();
  }

  /**
   * 为数据源构建向量索引
   */
  async indexDatasource(datasourceId: string): Promise<DatasourceVectorIndex> {
    console.log(`[DatasourceVector] 开始索引数据源: ${datasourceId}`);

    // 检查是否已索引
    if (this.indexedDatasources.has(datasourceId)) {
      const cached = this.indexedDatasources.get(datasourceId)!;
      console.log(`[DatasourceVector] 使用缓存索引`);
      return cached;
    }

    // 从数据库加载语义配置
    const config = await this.loadSemanticConfig(datasourceId);

    // 清空该数据源的旧索引
    this.clearDatasourceIndex(datasourceId);

    // 索引指标
    for (const metric of config.metrics) {
      const texts = [metric.name, ...metric.aliases];
      for (let i = 0; i < texts.length; i++) {
        await this.embeddingService.addDocument(
          `${datasourceId}_metric_${metric.field}_${i}`,
          texts[i],
          {
            type: 'metric',
            datasourceId,
            field: metric.field,
            table: metric.table,
            name: metric.name,
            aggregation: metric.aggregation,
          }
        );
      }
    }

    // 索引维度
    for (const dim of config.dimensions) {
      const texts = [dim.name, ...dim.aliases];
      for (let i = 0; i < texts.length; i++) {
        await this.embeddingService.addDocument(
          `${datasourceId}_dim_${dim.field}_${i}`,
          texts[i],
          {
            type: 'dimension',
            datasourceId,
            field: dim.field,
            table: dim.table,
            name: dim.name,
          }
        );
      }
    }

    const index: DatasourceVectorIndex = {
      datasourceId,
      metrics: config.metrics,
      dimensions: config.dimensions,
      indexedAt: new Date(),
    };

    this.indexedDatasources.set(datasourceId, index);

    console.log(`[DatasourceVector] 索引完成: ${config.metrics.length} 指标, ${config.dimensions.length} 维度`);

    return index;
  }

  /**
   * 从数据库加载语义配置
   */
  private async loadSemanticConfig(datasourceId: string): Promise<{
    metrics: Array<{
      field: string;
      table: string;
      name: string;
      aggregation: string;
      aliases: string[];
    }>;
    dimensions: Array<{
      field: string;
      table: string;
      name: string;
      aliases: string[];
    }>;
  }> {
    // 获取指标
    const metricRows = await query<any>(`
      SELECT
        column_name as field,
        table_name as \`table\`,
        COALESCE(semantic_name, column_name) as name,
        semantic_description,
        'SUM' as aggregation
      FROM schema_columns
      WHERE datasource_id = ? AND is_metric = TRUE
      ORDER BY table_name, column_name
    `, [datasourceId]);

    // 获取维度
    const dimensionRows = await query<any>(`
      SELECT
        column_name as field,
        table_name as \`table\`,
        COALESCE(semantic_name, column_name) as name,
        semantic_description
      FROM schema_columns
      WHERE datasource_id = ? AND is_dimension = TRUE
      ORDER BY table_name, column_name
    `, [datasourceId]);

    return {
      metrics: metricRows.map((r: any) => ({
        field: r.field,
        table: r.table,
        name: r.name,
        aggregation: r.aggregation || 'SUM',
        aliases: [],
      })),
      dimensions: dimensionRows.map((r: any) => ({
        field: r.field,
        table: r.table,
        name: r.name,
        aliases: [],
      })),
    };
  }

  /**
   * 清空数据源的向量索引
   */
  private clearDatasourceIndex(datasourceId: string): void {
    // 注意：当前 LocalEmbeddingService 没有按前缀删除的功能
    // 这里我们标记为需要重建
    console.log(`[DatasourceVector] 标记数据源 ${datasourceId} 需要重建索引`);
  }

  /**
   * 搜索数据源的实体
   */
  async searchDatasource(
    datasourceId: string,
    query: string,
    topK: number = 5,
    minScore: number = 0.5
  ): Promise<{
    metrics: Array<{
      field: string;
      table: string;
      name: string;
      aggregation: string;
      score: number;
    }>;
    dimensions: Array<{
      field: string;
      table: string;
      name: string;
      score: number;
    }>;
  }> {
    // 确保已索引
    await this.indexDatasource(datasourceId);

    // 搜索向量
    const results = await this.embeddingService.search(query, topK * 2, minScore);

    // 按数据源过滤
    const metrics: any[] = [];
    const dimensions: any[] = [];

    for (const result of results) {
      if (result.metadata.datasourceId !== datasourceId) continue;

      if (result.metadata.type === 'metric') {
        metrics.push({
          field: result.metadata.field,
          table: result.metadata.table,
          name: result.metadata.name,
          aggregation: result.metadata.aggregation,
          score: result.score,
        });
      } else if (result.metadata.type === 'dimension') {
        dimensions.push({
          field: result.metadata.field,
          table: result.metadata.table,
          name: result.metadata.name,
          score: result.score,
        });
      }

      if (metrics.length >= topK && dimensions.length >= topK) break;
    }

    return { metrics, dimensions };
  }

  /**
   * 检查数据源是否已索引
   */
  isIndexed(datasourceId: string): boolean {
    return this.indexedDatasources.has(datasourceId);
  }

  /**
   * 获取已索引的数据源列表
   */
  getIndexedDatasources(): string[] {
    return Array.from(this.indexedDatasources.keys());
  }

  /**
   * 清空所有索引
   */
  clearAll(): void {
    this.indexedDatasources.clear();
    this.embeddingService.clearVectorStore();
    console.log(`[DatasourceVector] 已清空所有索引`);
  }
}

// 单例
let datasourceVectorService: DatasourceVectorService | null = null;

export function getDatasourceVectorService(): DatasourceVectorService {
  if (!datasourceVectorService) {
    datasourceVectorService = new DatasourceVectorService();
  }
  return datasourceVectorService;
}
