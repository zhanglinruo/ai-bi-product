/**
 * 向量化 Semantic Agent
 * 
 * 使用向量嵌入进行语义匹配
 */

import { RuleBasedAgent } from '../base';
import {
  AgentDefinition,
  AgentContext,
  SemanticOutput,
  MappedField,
} from '../types';
import { getLocalEmbeddingService, LocalEmbeddingService } from '../../services/local-embedding';
import { semanticConfig } from '../../config/semantic-layer';

export interface VectorSemanticInput {
  entities: any;
  query: string;
}

export class VectorSemanticAgent extends RuleBasedAgent<VectorSemanticInput, SemanticOutput> {
  definition: AgentDefinition = {
    name: 'semantic-agent',
    description: '使用向量嵌入进行语义匹配',
    version: '2.0.0',
    layer: 'understanding',
    inputSchema: {
      type: 'object',
      properties: {
        entities: { type: 'object' },
        query: { type: 'string' },
      },
      required: ['entities'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        mappedFields: { type: 'array' },
        availableTables: { type: 'array' },
        joinHints: { type: 'array' },
        unmappedTerms: { type: 'array' },
      },
    },
  };
  
  private embeddingService: LocalEmbeddingService;
  private initialized: boolean = false;
  
  constructor() {
    super({ enableCache: true });
    this.embeddingService = getLocalEmbeddingService();
  }
  
  /**
   * 初始化向量索引
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('[Semantic Agent] 初始化向量索引...');
    
    // 索引指标
    for (const metric of semanticConfig.metrics) {
      const texts = [metric.name, ...metric.aliases];
      for (let i = 0; i < texts.length; i++) {
        await this.embeddingService.addDocument(
          `metric_${metric.id}_${i}`,
          texts[i],
          {
            type: 'metric',
            id: metric.id,
            name: metric.name,
            dbField: metric.dbField,
            dbTable: metric.dbTable,
            aggregation: metric.aggregation,
          }
        );
      }
    }
    
    // 索引维度
    for (const dim of semanticConfig.dimensions) {
      const texts = [dim.name, ...dim.aliases];
      for (let i = 0; i < texts.length; i++) {
        await this.embeddingService.addDocument(
          `dim_${dim.id}_${i}`,
          texts[i],
          {
            type: 'dimension',
            id: dim.id,
            name: dim.name,
            dbField: dim.dbField,
            dbTable: dim.dbTable,
            values: dim.values,
          }
        );
      }
    }
    
    // 索引术语
    for (const term of semanticConfig.terms) {
      await this.embeddingService.addDocument(
        `term_${term.id}`,
        term.term,
        {
          type: 'term',
          id: term.id,
          term: term.term,
          category: term.category,
          mappings: term.mappings,
        }
      );
    }
    
    this.initialized = true;
    console.log(`[Semantic Agent] 向量索引初始化完成，共 ${this.embeddingService.getVectorStoreSize()} 个向量`);
  }
  
  protected async run(input: VectorSemanticInput, context: AgentContext): Promise<SemanticOutput> {
    // 确保初始化
    await this.initialize();
    
    const { entities, query } = input;
    console.log('[VectorSemanticAgent] Input entities:', JSON.stringify(entities));
    console.log('[VectorSemanticAgent] Query:', query);
    
    const mappedFields: MappedField[] = [];
    const unmappedTerms: string[] = [];
    const tables = new Set<string>();
    
    // 1. 使用向量检索映射指标
    if (entities.metrics && entities.metrics.length > 0) {
      for (const metric of entities.metrics) {
        const term = typeof metric === 'string' ? metric : (metric.field || metric);
        
        // 先尝试精确匹配
        const exactMatch = this.findMetricMapping(term);
        if (exactMatch) {
          mappedFields.push({
            userTerm: term,
            dbField: exactMatch.dbField,
            dbTable: exactMatch.dbTable,
            fieldType: 'metric',
            confidence: 1.0,
          });
          tables.add(exactMatch.dbTable);
          continue;
        }
        
        // 向量语义检索
        const results = await this.embeddingService.search(term, 3);
        const metricResult = results.find((r: any) => r.metadata.type === 'metric' && r.score > 0.7);
        
        if (metricResult) {
          mappedFields.push({
            userTerm: term,
            dbField: metricResult.metadata.dbField,
            dbTable: metricResult.metadata.dbTable,
            fieldType: 'metric',
            confidence: metricResult.score,
          });
          tables.add(metricResult.metadata.dbTable);
        } else {
          unmappedTerms.push(term);
        }
      }
    }
    
    // 2. 使用向量检索映射维度
    if (entities.dimensions && entities.dimensions.length > 0) {
      for (const dim of entities.dimensions) {
        const term = typeof dim === 'string' ? dim : (dim.field || dim);
        
        // 先尝试精确匹配
        const exactMatch = this.findDimensionMapping(term);
        if (exactMatch) {
          mappedFields.push({
            userTerm: term,
            dbField: exactMatch.dbField,
            dbTable: exactMatch.dbTable,
            fieldType: 'dimension',
            confidence: 1.0,
          });
          tables.add(exactMatch.dbTable);
          continue;
        }
        
        // 向量语义检索
        const results = await this.embeddingService.search(term, 3);
        const dimResult = results.find(r => r.metadata.type === 'dimension' && r.score > 0.65);
        
        if (dimResult) {
          mappedFields.push({
            userTerm: term,
            dbField: dimResult.metadata.dbField,
            dbTable: dimResult.metadata.dbTable,
            fieldType: 'dimension',
            confidence: dimResult.score,
          });
          tables.add(dimResult.metadata.dbTable);
        } else {
          unmappedTerms.push(term);
        }
      }
    }
    
    // 3. 映射筛选条件中的值
    if (entities.filters) {
      for (const [field, value] of Object.entries(entities.filters)) {
        // 检查是否需要值映射
        const dimConfig = semanticConfig.dimensions.find(d => d.dbField === field);
        if (dimConfig?.values) {
          const mappedValue = dimConfig.values[value as string];
          if (mappedValue) {
            entities.filters[field] = mappedValue;
          }
        }
      }
    }
    
    // 4. 生成 JOIN 提示
    const joinHints = this.generateJoinHints(Array.from(tables));
    
    return {
      mappedFields,
      availableTables: Array.from(tables),
      joinHints,
      unmappedTerms,
    };
  }
  
  /**
   * 精确匹配指标（快速路径）
   */
  private findMetricMapping(term: string): { dbField: string; dbTable: string } | null {
    for (const metric of semanticConfig.metrics) {
      if (metric.name === term || metric.aliases.includes(term)) {
        return {
          dbField: metric.dbField,
          dbTable: metric.dbTable,
        };
      }
    }
    return null;
  }
  
  /**
   * 精确匹配维度（快速路径）
   */
  private findDimensionMapping(term: string): { dbField: string; dbTable: string } | null {
    for (const dim of semanticConfig.dimensions) {
      if (dim.name === term || dim.aliases.includes(term)) {
        return {
          dbField: dim.dbField,
          dbTable: dim.dbTable,
        };
      }
    }
    return null;
  }
  
  /**
   * 生成 JOIN 提示
   */
  private generateJoinHints(tables: string[]): any[] {
    const hints: any[] = [];
    
    if (tables.includes('orders') && tables.includes('customers')) {
      hints.push({
        from: 'orders',
        to: 'customers',
        on: 'orders.customer_id = customers.customer_id',
        type: 'LEFT',
      });
    }
    
    if (tables.includes('orders') && tables.includes('products')) {
      hints.push({
        from: 'orders',
        to: 'order_items',
        on: 'orders.order_id = order_items.order_id',
        type: 'LEFT',
      });
      hints.push({
        from: 'order_items',
        to: 'products',
        on: 'order_items.product_id = products.product_id',
        type: 'LEFT',
      });
    }
    
    return hints;
  }
}
