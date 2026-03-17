import { query } from '../../config/database';

export interface EntityMapping {
  id: string;
  datasource_id: string;
  dimension_id?: string;
  dimension_name: string;
  user_input: string;
  db_value: string;
  match_priority: number;
  status: string;
}

export interface NormalizationRule {
  id: string;
  datasource_id: string;
  dimension_id?: string;
  dimension_name: string;
  rule_type: string;
  rule_pattern?: string;
  rule_replacement?: string;
  is_active: boolean;
}

export interface EntityMatchResult {
  matched: boolean;
  layer: 1 | 2 | 3 | 4;
  userInput: string;
  dbValue?: string;
  candidates?: { value: string; similarity: number }[];
  needsConfirmation?: boolean;
}

export class EntityMappingService {
  private datasourceId: string;

  constructor(datasourceId: string = 'default-datasource') {
    this.datasourceId = datasourceId;
  }

  async findMapping(userInput: string, dimensionName?: string): Promise<EntityMatchResult> {
    const normalizedInput = userInput.trim().toLowerCase();

    const layer1Result = await this.layer1_ExactMatch(normalizedInput, dimensionName);
    if (layer1Result.matched) {
      return layer1Result;
    }

    const layer2Result = await this.layer2_Normalization(normalizedInput, dimensionName);
    if (layer2Result.matched) {
      return layer2Result;
    }

    const layer3Result = await this.layer3_FuzzyMatch(normalizedInput, dimensionName);
    if (layer3Result.matched) {
      return layer3Result;
    }

    return {
      matched: false,
      layer: 4,
      userInput,
      needsConfirmation: true
    };
  }

  private async layer1_ExactMatch(userInput: string, dimensionName?: string): Promise<EntityMatchResult> {
    let sql = `
      SELECT * FROM semantic_entity_mapping 
      WHERE datasource_id = ? AND status = 'active' 
      AND (LOWER(user_input) = ? OR LOWER(user_input) LIKE ?)
    `;
    const params: any[] = [this.datasourceId, userInput, `%,${userInput}%`];

    if (dimensionName) {
      sql += ' AND dimension_name = ?';
      params.push(dimensionName);
    }

    sql += ' ORDER BY match_priority ASC LIMIT 1';

    const results = await query(sql, params) as any[];

    if (results.length > 0) {
      const mapping = results[0];
      const inputs = mapping.user_input.split(',').map((s: string) => s.trim().toLowerCase());
      if (inputs.includes(userInput)) {
        return {
          matched: true,
          layer: 1,
          userInput,
          dbValue: mapping.db_value
        };
      }
    }

    return { matched: false, layer: 1, userInput };
  }

  private async layer2_Normalization(userInput: string, dimensionName?: string): Promise<EntityMatchResult> {
    const normalizedInput = this.normalizeValue(userInput, dimensionName);

    let sql = `
      SELECT * FROM semantic_entity_mapping 
      WHERE datasource_id = ? AND status = 'active' 
      AND LOWER(db_value) = ?
    `;
    const params: any[] = [this.datasourceId, normalizedInput];

    if (dimensionName) {
      sql += ' AND dimension_name = ?';
      params.push(dimensionName);
    }

    sql += ' LIMIT 1';
    const results = await query(sql, params) as any[];

    if (results.length > 0) {
      return {
        matched: true,
        layer: 2,
        userInput,
        dbValue: results[0].db_value
      };
    }

    return { matched: false, layer: 2, userInput };
  }

  private async layer3_FuzzyMatch(userInput: string, dimensionName?: string): Promise<EntityMatchResult> {
    let sql = `
      SELECT db_value, user_input FROM semantic_entity_mapping 
      WHERE datasource_id = ? AND status = 'active'
    `;
    const params: any[] = [this.datasourceId];

    if (dimensionName) {
      sql += ' AND dimension_name = ?';
      params.push(dimensionName);
    }

    const results = await query(sql, params) as any[];

    const candidates: { value: string; similarity: number }[] = [];
    for (const row of results) {
      const dbValues = row.user_input.split(',').map((s: string) => s.trim().toLowerCase());
      for (const dbVal of dbValues) {
        const similarity = this.calculateSimilarity(userInput, dbVal);
        if (similarity >= 0.6) {
          candidates.push({ value: row.db_value, similarity });
        }
      }
    }

    candidates.sort((a, b) => b.similarity - a.similarity);
    const top3 = candidates.slice(0, 3);

    if (top3.length > 0) {
      if (top3[0].similarity >= 0.9) {
        return {
          matched: true,
          layer: 3,
          userInput,
          dbValue: top3[0].value
        };
      } else if (top3[0].similarity >= 0.7) {
        return {
          matched: false,
          layer: 3,
          userInput,
          candidates: top3,
          needsConfirmation: true
        };
      }
    }

    return { matched: false, layer: 3, userInput };
  }

  private normalizeValue(value: string, dimensionName?: string): string {
    let normalized = value.trim();

    normalized = normalized.replace(/省$/, '');
    normalized = normalized.replace(/市$/, '');
    normalized = normalized.replace(/县$/, '');
    normalized = normalized.replace(/区$/, '');

    const suffixMap: Record<string, string> = {
      '安徽省': '安徽',
      '上海市': '上海',
      '北京市': '北京',
      '重庆市': '重庆',
      '天津市': '天津',
      '浙江省': '浙江',
      '江苏省': '江苏',
      '广东省': '广东',
      '山东省': '山东',
      '四川省': '四川',
      '河南省': '河南',
      '河北省': '河北',
      '湖南省': '湖南',
      '湖北省': '湖北',
      '福建省': '福建',
      '江西省': '江西',
      '辽宁省': '辽宁',
      '吉林省': '吉林',
      '黑龙江省': '黑龙江',
      '陕西省': '陕西',
      '山西省': '山西',
      '云南省': '云南',
      '贵州省': '贵州',
      '甘肃省': '甘肃',
      '青海省': '青海',
      '海南省': '海南',
      '内蒙古': '内蒙古',
      '广西': '广西',
      '西藏': '西藏',
      '宁夏': '宁夏',
      '新疆': '新疆',
      '皖': '安徽',
      '浙': '浙江',
      '沪': '上海',
      '京': '北京',
      '粤': '广东',
      '苏': '江苏',
      '鲁': '山东',
      '川': '四川',
      '渝': '重庆',
      '津': '天津'
    };

    for (const [key, val] of Object.entries(suffixMap)) {
      if (normalized.includes(key)) {
        normalized = normalized.replace(key, val);
      }
    }

    return normalized;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

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

  async addMapping(dimensionName: string, userInput: string, dbValue: string): Promise<void> {
    const id = require('uuid').v4();
    await query(
      `INSERT INTO semantic_entity_mapping (id, datasource_id, dimension_name, user_input, db_value, match_priority, status)
       VALUES (?, ?, ?, ?, ?, 1, 'active')`,
      [id, this.datasourceId, dimensionName, userInput, dbValue]
    );
  }
}

export const entityMappingService = new EntityMappingService();
