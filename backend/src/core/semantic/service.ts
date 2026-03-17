import { query } from '../../config/database';
import { globalToolRegistry } from '../tool';
import { ToolExecutionContext } from '../tool/types';

function safeJSONParse(val: any, defaultValue: any = null): any {
  if (val === null || val === undefined) return defaultValue;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

export interface SemanticMatch {
  type: 'metric' | 'term' | 'dimension' | 'rule';
  id: string;
  name: string;
  aliases: string[];
  definition?: string;
  business口径?: string;
  technical口径?: string;
  calculation?: string;
  dataMapping?: any;
  dimensions?: string[];
  businessRules?: any[];
  relevanceScore: number;
}

export interface SemanticSearchResult {
  matches: SemanticMatch[];
  businessDomain?: string;
  isMatchValid: boolean;
}

export class SemanticService {
  private datasourceId = 'default-datasource';
  private matchThreshold = 0.7;

  async search(question: string, context: ToolExecutionContext): Promise<SemanticSearchResult> {
    const normalizedQuestion = question.toLowerCase();
    
    const metrics = await this.searchMetrics(normalizedQuestion);
    const terms = await this.searchTerms(normalizedQuestion);
    const dimensions = await this.searchDimensions(normalizedQuestion);
    const rules = await this.searchRules(normalizedQuestion);

    const allMatches: SemanticMatch[] = [
      ...metrics.map(m => ({ ...m, type: 'metric' as const })),
      ...terms.map(t => ({ ...t, type: 'term' as const })),
      ...dimensions.map(d => ({ ...d, type: 'dimension' as const })),
      ...rules.map(r => ({ ...r, type: 'rule' as const }))
    ];

    allMatches.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topMatches = allMatches.slice(0, 5);

    const isMatchValid = topMatches.length > 0 && topMatches[0].relevanceScore >= this.matchThreshold;
    const businessDomain = this.detectBusinessDomain(normalizedQuestion);

    console.log('[语义层] 检索结果:', {
      metrics: metrics.length,
      terms: terms.length,
      dimensions: dimensions.length,
      rules: rules.length,
      valid: isMatchValid,
      topScore: topMatches[0]?.relevanceScore || 0
    });

    return {
      matches: topMatches,
      businessDomain,
      isMatchValid
    };
  }

  private async searchMetrics(question: string): Promise<Omit<SemanticMatch, 'type'>[]> {
    const results = await query<any[]>(
      `SELECT * FROM semantic_metrics WHERE datasource_id = ? AND status = 'published'`,
      [this.datasourceId]
    );

    return results
      .map(row => {
        const aliases: string[] = safeJSONParse(row.aliases, []);
        const allNames = [row.metric_name, ...aliases].map(n => n.toLowerCase());
        
        let maxScore = 0;
        for (const name of allNames) {
          if (question.includes(name)) {
            maxScore = 1.0;
            break;
          }
          const similarity = this.calculateSimilarity(question, name);
          maxScore = Math.max(maxScore, similarity);
        }

        return maxScore >= 0.3 ? {
          id: row.id,
          name: row.metric_name,
          aliases,
          definition: row.business口径,
          business口径: row.business口径,
          technical口径: row.technical口径,
          calculation: row.calculation,
          dataMapping: safeJSONParse(row.data_mapping),
          dimensions: safeJSONParse(row.dimensions, []),
          businessRules: safeJSONParse(row.business_rules, []),
          relevanceScore: maxScore
        } : null;
      })
      .filter(Boolean) as Omit<SemanticMatch, 'type'>[];
  }

  private async searchTerms(question: string): Promise<Omit<SemanticMatch, 'type'>[]> {
    const results = await query<any[]>(
      `SELECT * FROM semantic_terms WHERE datasource_id = ? AND status = 'published'`,
      [this.datasourceId]
    );

    return results
      .map(row => {
        const aliases: string[] = safeJSONParse(row.aliases, []);
        const allNames = [row.term_name, ...aliases].map(n => n.toLowerCase());
        
        let maxScore = 0;
        for (const name of allNames) {
          if (question.includes(name)) {
            maxScore = 1.0;
            break;
          }
          const similarity = this.calculateSimilarity(question, name);
          maxScore = Math.max(maxScore, similarity);
        }

        return maxScore >= 0.3 ? {
          id: row.id,
          name: row.term_name,
          aliases,
          definition: row.definition,
          dataMapping: safeJSONParse(row.data_mapping),
          relevanceScore: maxScore
        } : null;
      })
      .filter(Boolean) as Omit<SemanticMatch, 'type'>[];
  }

  private async searchDimensions(question: string): Promise<Omit<SemanticMatch, 'type'>[]> {
    const results = await query<any[]>(
      `SELECT * FROM semantic_dimensions WHERE datasource_id = ? AND status = 'published'`,
      [this.datasourceId]
    );

    return results
      .map(row => {
        const aliases: string[] = safeJSONParse(row.aliases, []);
        const allNames = [row.dim_name, ...aliases].map(n => n.toLowerCase());
        
        let maxScore = 0;
        for (const name of allNames) {
          if (question.includes(name)) {
            maxScore = 1.0;
            break;
          }
          const similarity = this.calculateSimilarity(question, name);
          maxScore = Math.max(maxScore, similarity);
        }

        return maxScore >= 0.3 ? {
          id: row.id,
          name: row.dim_name,
          aliases,
          definition: row.definition,
          dataMapping: safeJSONParse(row.data_mapping),
          relevanceScore: maxScore
        } : null;
      })
      .filter(Boolean) as Omit<SemanticMatch, 'type'>[];
  }

  private async searchRules(question: string): Promise<Omit<SemanticMatch, 'type'>[]> {
    const results = await query<any[]>(
      `SELECT * FROM semantic_rules WHERE datasource_id = ? AND status = 'published'`,
      [this.datasourceId]
    );

    return results
      .map(row => {
        const name = row.rule_name.toLowerCase();
        const content = row.rule_content.toLowerCase();
        
        let maxScore = 0;
        if (question.includes(name)) maxScore = 1.0;
        else if (question.includes(content.substring(0, 20))) maxScore = 0.8;
        else maxScore = this.calculateSimilarity(question, name + ' ' + content);

        return maxScore >= 0.3 ? {
          id: row.id,
          name: row.rule_name,
          definition: row.rule_content,
          businessRules: safeJSONParse(row.applies_to, {}),
          relevanceScore: maxScore
        } : null;
      })
      .filter(Boolean) as Omit<SemanticMatch, 'type'>[];
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const set1 = new Set(text1.split(/[\s,\.]+/).filter(Boolean));
    const set2 = new Set(text2.split(/[\s,\.]+/).filter(Boolean));
    
    if (set2.size === 0) return 0;
    
    let matchCount = 0;
    for (const word of set2) {
      if (text1.includes(word)) matchCount++;
    }
    
    return matchCount / set2.size;
  }

  private detectBusinessDomain(question: string): string | undefined {
    const domainKeywords: Record<string, string[]> = {
      '采购': ['采购', '购买', '订单', '供应商', '采购金额', '采购数量'],
      '销售': ['销售', '卖出', '营收', '收入', '营业额'],
      '财务': ['财务', '成本', '利润', '支出', '预算'],
      '库存': ['库存', '存货', '仓储', '进出库']
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      for (const keyword of keywords) {
        if (question.includes(keyword)) return domain;
      }
    }
    return undefined;
  }

  async buildSemanticPrompt(matches: SemanticMatch[]): Promise<string> {
    if (matches.length === 0) {
      return '';
    }

    let prompt = '\n【语义层匹配结果】\n';
    prompt += '以下是当前用户问题匹配到的语义层定义，你必须严格遵循：\n\n';

    const metrics = matches.filter(m => m.type === 'metric');
    const terms = matches.filter(m => m.type === 'term');
    const dimensions = matches.filter(m => m.type === 'dimension');
    const rules = matches.filter(m => m.type === 'rule');

    if (metrics.length > 0) {
      prompt += '【指标定义】\n';
      for (const m of metrics) {
        prompt += `- ${m.name}:\n`;
        prompt += `  - 业务口径: ${m.business口径 || '无'}\n`;
        prompt += `  - 技术口径: ${m.technical口径 || '无'}\n`;
        prompt += `  - 计算公式: ${m.calculation || '无'}\n`;
        if (m.dataMapping) {
          prompt += `  - 数据映射: 表=${m.dataMapping.table}, 字段=${m.dataMapping.field}\n`;
        }
      }
      prompt += '\n';
    }

    prompt += '【重要：字段映射表】\n';
    prompt += '以下是你必须使用的准确字段名，禁止使用其他字段名：\n';
    
    const whitelist = await this.getFieldWhitelist();
    for (const w of whitelist) {
      if (w.alias && w.alias !== w.field) {
        prompt += `  - ${w.alias} → ${w.field}\n`;
      }
    }
    prompt += '\n';

    if (terms.length > 0) {
      prompt += '【术语定义】\n';
      for (const t of terms) {
        prompt += `- ${t.name}: ${t.definition || '无'}\n`;
        if (t.dataMapping) {
          prompt += `  - 数据映射: ${JSON.stringify(t.dataMapping)}\n`;
        }
      }
      prompt += '\n';
    }

    if (dimensions.length > 0) {
      prompt += '【维度定义】\n';
      for (const d of dimensions) {
        prompt += `- ${d.name}: ${d.definition || '无'}\n`;
        if (d.dataMapping) {
          prompt += `  - 数据映射: ${JSON.stringify(d.dataMapping)}\n`;
        }
      }
      prompt += '\n';
    }

    if (rules.length > 0) {
      prompt += '【业务规则】\n';
      for (const r of rules) {
        prompt += `- ${r.name}: ${r.definition || '无'}\n`;
      }
      prompt += '\n';
    }

    return prompt;
  }

  async getFieldWhitelist(): Promise<{ table: string; field: string; alias: string }[]> {
    const results = await query<any[]>(
      `SELECT table_name, field_name, field_alias FROM semantic_field_whitelist WHERE datasource_id = ?`,
      [this.datasourceId]
    );
    
    return results.map(r => ({
      table: r.table_name,
      field: r.field_name,
      alias: r.field_alias || r.field_name
    }));
  }
}

export const semanticService = new SemanticService();
