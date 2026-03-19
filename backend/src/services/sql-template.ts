/**
 * SQL 模板服务
 *
 * 管理 SQL 模板的 CRUD 和向量检索
 */

import dbPool from '../config/database';
import { getLocalEmbeddingService } from './local-embedding';

export interface SQLTemplate {
  id?: number;
  name: string;
  description?: string;
  sql_template: string;
  keywords?: string;
  dimensions?: string;
  metrics?: string;
  category?: string;
  embedding?: number[];
  datasource_id?: string;
  is_active?: boolean;
  use_count?: number;
  last_used_at?: Date;
  created_at?: Date;
  updated_at?: Date;
  created_by?: string;
}

export interface SQLRule {
  id?: number;
  rule_code: string;
  rule_name: string;
  rule_content: string;
  rule_type?: string;
  applies_to?: string;
  priority?: number;
  is_active?: boolean;
  description?: string;
  examples?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface TemplateMatchResult {
  template: SQLTemplate;
  score: number;
}

export class SQLTemplateService {
  private embeddingService = getLocalEmbeddingService();

  async createTemplate(template: Omit<SQLTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<SQLTemplate> {
    const searchText = `${template.name} ${template.description || ''} ${template.keywords || ''} ${template.sql_template}`;
    const embedding = await this.embeddingService.embed(searchText);

    const [result] = await dbPool.query(
      `INSERT INTO sql_templates
       (name, description, sql_template, keywords, dimensions, metrics, category, embedding, datasource_id, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        template.name,
        template.description,
        template.sql_template,
        template.keywords,
        template.dimensions,
        template.metrics,
        template.category || 'general',
        JSON.stringify(embedding),
        template.datasource_id,
        template.is_active !== false ? 1 : 0,
        template.created_by,
      ]
    );

    return { ...template, id: (result as any).insertId, embedding };
  }

  async updateTemplate(id: number, updates: Partial<SQLTemplate>): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.sql_template !== undefined) {
      fields.push('sql_template = ?');
      values.push(updates.sql_template);
    }
    if (updates.keywords !== undefined) {
      fields.push('keywords = ?');
      values.push(updates.keywords);
    }
    if (updates.dimensions !== undefined) {
      fields.push('dimensions = ?');
      values.push(updates.dimensions);
    }
    if (updates.metrics !== undefined) {
      fields.push('metrics = ?');
      values.push(updates.metrics);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }

    if (updates.sql_template || updates.name || updates.description) {
      const searchText = `${updates.name || ''} ${updates.description || ''} ${updates.keywords || ''} ${updates.sql_template || ''}`;
      const embedding = await this.embeddingService.embed(searchText);
      fields.push('embedding = ?');
      values.push(JSON.stringify(embedding));
    }

    values.push(id);

    const [result] = await dbPool.query(
      `UPDATE sql_templates SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return (result as any).affectedRows > 0;
  }

  async deleteTemplate(id: number): Promise<boolean> {
    const [result] = await dbPool.query('DELETE FROM sql_templates WHERE id = ?', [id]);
    return (result as any).affectedRows > 0;
  }

  async getTemplateById(id: number): Promise<SQLTemplate | null> {
    const [rows] = await dbPool.query('SELECT * FROM sql_templates WHERE id = ?', [id]);
    const templates = rows as SQLTemplate[];
    if (templates.length === 0) return null;
    return this.parseTemplate(templates[0]);
  }

  async listTemplates(options: {
    category?: string;
    datasource_id?: string;
    is_active?: boolean;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ templates: SQLTemplate[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const values: any[] = [];

    if (options.category) {
      conditions.push('category = ?');
      values.push(options.category);
    }
    if (options.datasource_id) {
      conditions.push('datasource_id = ?');
      values.push(options.datasource_id);
    }
    if (options.is_active !== undefined) {
      conditions.push('is_active = ?');
      values.push(options.is_active ? 1 : 0);
    }

    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const countSql = `SELECT COUNT(*) as total FROM sql_templates WHERE ${conditions.join(' AND ')}`;
    const [countResult] = await dbPool.query(countSql, values);
    const total = (countResult as any)[0]?.total || 0;

    const dataSql = `SELECT * FROM sql_templates WHERE ${conditions.join(' AND ')} ORDER BY use_count DESC, id DESC LIMIT ? OFFSET ?`;
    const [rows] = await dbPool.query(dataSql, [...values, pageSize, offset]);
    const templates = (rows as SQLTemplate[]).map(t => this.parseTemplate(t));

    return { templates, total };
  }

  async findSimilarTemplates(query: string, topK: number = 5, datasourceId?: string): Promise<TemplateMatchResult[]> {
    const queryEmbedding = await this.embeddingService.embed(query);

    let sql = `
      SELECT *,
             (SELECT embedding FROM sql_templates WHERE id = t.id) as emb
      FROM sql_templates t
      WHERE is_active = 1
    `;
    const params: any[] = [];

    if (datasourceId) {
      sql += ' AND (datasource_id = ? OR datasource_id IS NULL)';
      params.push(datasourceId);
    }

    const [rows] = await dbPool.query(sql, params);
    const templates = rows as any[];

    const results: TemplateMatchResult[] = [];
    for (const row of templates) {
      if (!row.emb) continue;
      const storedEmbedding = typeof row.emb === 'string' ? JSON.parse(row.emb) : row.emb;
      if (!storedEmbedding || !Array.isArray(storedEmbedding)) continue;
      const score = this.cosineSimilarity(queryEmbedding, storedEmbedding);
      results.push({
        template: this.parseTemplate(row),
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async incrementUsage(id: number): Promise<void> {
    await dbPool.query(
      'UPDATE sql_templates SET use_count = use_count + 1, last_used_at = NOW() WHERE id = ?',
      [id]
    );
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private parseTemplate(row: any): SQLTemplate {
    return {
      ...row,
      embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
      is_active: Boolean(row.is_active),
    };
  }

  async createRule(rule: Omit<SQLRule, 'id' | 'created_at' | 'updated_at'>): Promise<SQLRule> {
    const [result] = await dbPool.query(
      `INSERT INTO sql_rules (rule_code, rule_name, rule_content, rule_type, applies_to, priority, is_active, description, examples)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rule.rule_code,
        rule.rule_name,
        rule.rule_content,
        rule.rule_type || 'constraint',
        rule.applies_to || 'all',
        rule.priority || 100,
        rule.is_active !== false ? 1 : 0,
        rule.description,
        rule.examples,
      ]
    );
    return { ...rule, id: (result as any).insertId };
  }

  async getActiveRules(appliesTo?: string): Promise<SQLRule[]> {
    let sql = 'SELECT * FROM sql_rules WHERE is_active = 1';
    const params: any[] = [];

    if (appliesTo) {
      sql += ' AND (applies_to = ? OR applies_to = "all")';
      params.push(appliesTo);
    }

    sql += ' ORDER BY priority ASC';

    const [rows] = await dbPool.query(sql, params);
    return (rows as SQLRule[]).map(r => ({
      ...r,
      is_active: Boolean(r.is_active),
    }));
  }
}

let templateService: SQLTemplateService | null = null;

export function getSQLTemplateService(): SQLTemplateService {
  if (!templateService) {
    templateService = new SQLTemplateService();
  }
  return templateService;
}
