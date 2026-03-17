/**
 * Semantic Agent - 语义匹配
 * 
 * 负责将用户术语映射到数据库字段
 * 这是一个规则型 Agent，不需要 LLM
 */

import { RuleBasedAgent } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  SemanticOutput,
  MappedField,
  JoinHint,
} from '../types';

/**
 * 语义层配置
 */
export interface SemanticLayerConfig {
  metrics: SemanticMetric[];
  dimensions: SemanticDimension[];
  terms: SemanticTerm[];
  rules: SemanticRule[];
  fieldWhitelist: string[];
}

export interface SemanticMetric {
  id: string;
  name: string;           // 业务名称
  aliases: string[];      // 别名
  dbField: string;        // 数据库字段
  dbTable: string;        // 数据库表
  aggregation: string;    // 聚合方式
  formula?: string;       // 计算公式
}

export interface SemanticDimension {
  id: string;
  name: string;
  aliases: string[];
  dbField: string;
  dbTable: string;
  values?: Record<string, string>; // 值映射
}

export interface SemanticTerm {
  id: string;
  term: string;           // 业务术语
  category: string;       // 分类
  mappings: string[];     // 映射到的字段
}

export interface SemanticRule {
  id: string;
  name: string;
  condition: string;      // 触发条件
  action: string;         // 执行动作
  priority: number;
}

export class SemanticAgent extends RuleBasedAgent<{ entities: any; query: string }, SemanticOutput> {
  definition: AgentDefinition = {
    name: 'semantic-agent',
    description: '将用户术语映射到数据库字段',
    version: '1.0.0',
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
  
  private semanticConfig: SemanticLayerConfig;
  
  constructor(semanticConfig: SemanticLayerConfig) {
    super({ enableCache: true });
    this.semanticConfig = semanticConfig;
  }
  
  protected async run(input: { entities: any; query: string }, context: AgentContext): Promise<SemanticOutput> {
    const { entities, query } = input;
    const mappedFields: MappedField[] = [];
    const unmappedTerms: string[] = [];
    const tables = new Set<string>();
    
    // 1. 映射指标
    for (const metric of entities.metrics || []) {
      // metric 可能是字符串或对象 { field, table, aggregation }
      const term = typeof metric === 'string' ? metric : (metric.field || metric);
      if (typeof term !== 'string') {
        unmappedTerms.push(JSON.stringify(metric));
        continue;
      }
      
      const mapping = this.findMetricMapping(term);
      if (mapping) {
        mappedFields.push({
          userTerm: term,
          dbField: mapping.dbField,
          dbTable: mapping.dbTable,
          fieldType: 'metric',
          confidence: mapping.confidence,
        });
        tables.add(mapping.dbTable);
      } else {
        unmappedTerms.push(term);
      }
    }
    
    // 2. 映射维度
    for (const dimension of entities.dimensions || []) {
      // dimension 可能是字符串或对象 { field, table }
      const term = typeof dimension === 'string' ? dimension : (dimension.field || dimension);
      if (typeof term !== 'string') {
        unmappedTerms.push(JSON.stringify(dimension));
        continue;
      }
      
      const mapping = this.findDimensionMapping(term);
      if (mapping) {
        mappedFields.push({
          userTerm: term,
          dbField: mapping.dbField,
          dbTable: mapping.dbTable,
          fieldType: 'dimension',
          confidence: mapping.confidence,
        });
        tables.add(mapping.dbTable);
      } else {
        unmappedTerms.push(term);
      }
    }
    
    // 3. 映射筛选条件
    for (const [field, value] of Object.entries(entities.filters || {})) {
      const mapping = this.findDimensionMapping(field);
      if (mapping) {
        // 检查是否有值映射
        const dbValue = mapping.valueMapping?.[value as string] || value;
        mappedFields.push({
          userTerm: field,
          dbField: mapping.dbField,
          dbTable: mapping.dbTable,
          fieldType: 'filter',
          confidence: mapping.confidence,
        });
        tables.add(mapping.dbTable);
      }
    }
    
    // 4. 查找原查询中未识别的术语
    const unrecognizedTerms = this.findUnrecognizedTerms(query, mappedFields);
    unmappedTerms.push(...unrecognizedTerms);
    
    // 5. 生成表关联提示
    const joinHints = this.generateJoinHints(Array.from(tables));
    
    return {
      mappedFields,
      availableTables: Array.from(tables),
      joinHints,
      unmappedTerms: [...new Set(unmappedTerms)], // 去重
    };
  }
  
  /**
   * 查找指标映射
   */
  private findMetricMapping(term: string): { dbField: string; dbTable: string; confidence: number } | null {
    // 精确匹配
    for (const metric of this.semanticConfig.metrics) {
      if (metric.name === term || metric.aliases.includes(term)) {
        return {
          dbField: metric.dbField,
          dbTable: metric.dbTable,
          confidence: 1.0,
        };
      }
    }
    
    // 模糊匹配（包含）
    for (const metric of this.semanticConfig.metrics) {
      if (metric.name.includes(term) || term.includes(metric.name)) {
        return {
          dbField: metric.dbField,
          dbTable: metric.dbTable,
          confidence: 0.8,
        };
      }
      for (const alias of metric.aliases) {
        if (alias.includes(term) || term.includes(alias)) {
          return {
            dbField: metric.dbField,
            dbTable: metric.dbTable,
            confidence: 0.7,
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * 查找维度映射
   */
  private findDimensionMapping(term: string): { dbField: string; dbTable: string; confidence: number; valueMapping?: Record<string, string> } | null {
    for (const dimension of this.semanticConfig.dimensions) {
      if (dimension.name === term || dimension.aliases.includes(term)) {
        return {
          dbField: dimension.dbField,
          dbTable: dimension.dbTable,
          confidence: 1.0,
          valueMapping: dimension.values,
        };
      }
    }
    
    // 模糊匹配
    for (const dimension of this.semanticConfig.dimensions) {
      if (dimension.name.includes(term) || term.includes(dimension.name)) {
        return {
          dbField: dimension.dbField,
          dbTable: dimension.dbTable,
          confidence: 0.8,
          valueMapping: dimension.values,
        };
      }
    }
    
    return null;
  }
  
  /**
   * 查找未识别的术语
   */
  private findUnrecognizedTerms(query: string, mappedFields: MappedField[]): string[] {
    const unrecognized: string[] = [];
    const mappedTerms = new Set(mappedFields.map(f => f.userTerm));
    
    // 检查语义术语表
    for (const term of this.semanticConfig.terms) {
      if (query.includes(term.term) && !mappedTerms.has(term.term)) {
        unrecognized.push(term.term);
      }
    }
    
    return unrecognized;
  }
  
  /**
   * 生成表关联提示
   */
  private generateJoinHints(tables: string[]): JoinHint[] {
    // 如果只有一个表，不需要关联
    if (tables.length <= 1) {
      return [];
    }
    
    // 简单的关联规则（实际应该从配置中读取）
    const hints: JoinHint[] = [];
    
    // 假设所有表都可以通过 id 关联
    for (let i = 1; i < tables.length; i++) {
      hints.push({
        fromTable: tables[0],
        toTable: tables[i],
        joinCondition: `${tables[0]}.id = ${tables[i]}.ref_id`,
        joinType: 'LEFT',
      });
    }
    
    return hints;
  }
  
  /**
   * 检查字段是否在白名单中
   */
  isFieldAllowed(field: string): boolean {
    return this.semanticConfig.fieldWhitelist.includes(field);
  }
}
