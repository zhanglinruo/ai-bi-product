/**
 * 语义层配置 - 动态从数据库加载
 */

import { query } from './database';

export interface SemanticMetric {
  id: string;
  name: string;
  aliases: string[];
  dbField: string;
  dbTable: string;
  aggregation: string;
  formula?: string;
}

export interface SemanticDimension {
  id: string;
  name: string;
  aliases: string[];
  dbField: string;
  dbTable: string;
  values?: Record<string, string>;
}

export interface SemanticTerm {
  id: string;
  term: string;
  category: string;
  mappings: string[];
}

export interface SemanticRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  priority: number;
}

export interface SemanticLayerConfig {
  metrics: SemanticMetric[];
  dimensions: SemanticDimension[];
  terms: SemanticTerm[];
  rules: SemanticRule[];
  fieldWhitelist: string[];
}

let cachedConfig: SemanticLayerConfig | null = null;

export async function loadSemanticConfig(): Promise<SemanticLayerConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const config: SemanticLayerConfig = {
    metrics: [],
    dimensions: [],
    terms: [],
    rules: [],
    fieldWhitelist: []
  };

  try {
    const [metricsRows] = await query('SELECT * FROM semantic_metrics WHERE is_active = 1');
    config.metrics = (metricsRows as any[]).map(row => ({
      id: row.id,
      name: row.name_cn,
      aliases: row.aliases ? row.aliases.split(',').map((s: string) => s.trim()) : [],
      dbField: row.data_mapping ? JSON.parse(row.data_mapping).field : row.name_en,
      dbTable: row.data_mapping ? JSON.parse(row.data_mapping).table : '',
      aggregation: row.aggregation || 'SUM',
      formula: row.formula
    }));
    console.log(`[语义层] 加载 ${config.metrics.length} 个指标`);
  } catch (e) {
    console.log('[语义层] semantic_metrics 表不存在，使用默认配置');
  }

  try {
    const [dimsRows] = await query('SELECT * FROM semantic_dimensions WHERE is_active = 1');
    config.dimensions = (dimsRows as any[]).map(row => ({
      id: row.id,
      name: row.name_cn,
      aliases: row.aliases ? row.aliases.split(',').map((s: string) => s.trim()) : [],
      dbField: row.data_mapping ? JSON.parse(row.data_mapping).field : row.name_en,
      dbTable: row.data_mapping ? JSON.parse(row.data_mapping).table : '',
      values: row.values ? JSON.parse(row.values) : undefined
    }));
    console.log(`[语义层] 加载 ${config.dimensions.length} 个维度`);
  } catch (e) {
    console.log('[语义层] semantic_dimensions 表不存在，使用默认配置');
  }

  try {
    const [termsRows] = await query('SELECT * FROM semantic_terms');
    config.terms = (termsRows as any[]).map(row => ({
      id: row.id,
      term: row.term,
      category: row.category,
      mappings: row.mappings ? JSON.parse(row.mappings) : []
    }));
    console.log(`[语义层] 加载 ${config.terms.length} 个术语`);
  } catch (e) {
    console.log('[语义层] semantic_terms 表不存在');
  }

  try {
    const [whitelistRows] = await query('SELECT field_name FROM semantic_field_whitelist');
    config.fieldWhitelist = (whitelistRows as any[]).map(row => row.field_name);
    console.log(`[语义层] 加载 ${config.fieldWhitelist.length} 个白名单字段`);
  } catch (e) {
    config.fieldWhitelist = ['*'];
    console.log('[语义层] semantic_field_whitelist 表不存在');
  }

  if (config.metrics.length === 0 && config.dimensions.length === 0) {
    console.log('[语义层] 数据库无配置，尝试加载默认配置...');
    return getDefaultConfig();
  }

  cachedConfig = config;
  return config;
}

function getDefaultConfig(): SemanticLayerConfig {
  return {
    metrics: [
      {
        id: 'metric_amount',
        name: '采购金额',
        aliases: ['金额', '总额', '总金额', '销售', '销售额'],
        dbField: 'amount',
        dbTable: 't_ai_medical_product_records',
        aggregation: 'SUM',
      },
      {
        id: 'metric_quantity',
        name: '采购数量',
        aliases: ['数量', '件数', '总量'],
        dbField: 'quantity',
        dbTable: 't_ai_medical_product_records',
        aggregation: 'SUM',
      },
      {
        id: 'metric_price',
        name: '单价',
        aliases: ['价格', '售价'],
        dbField: 'price',
        dbTable: 't_ai_medical_product_records',
        aggregation: 'AVG',
      }
    ],
    dimensions: [
      {
        id: 'dim_province',
        name: '省份',
        aliases: ['省', '地区'],
        dbField: 'province',
        dbTable: 't_ai_medical_product_records',
      },
      {
        id: 'dim_city',
        name: '城市',
        aliases: ['市'],
        dbField: 'city',
        dbTable: 't_ai_medical_product_records',
      },
      {
        id: 'dim_hospital',
        name: '医院',
        aliases: ['医疗机构', '医院名称'],
        dbField: 'hospital_name',
        dbTable: 't_ai_medical_product_records',
      },
      {
        id: 'dim_corporate_group',
        name: '企业集团',
        aliases: ['集团', '企业'],
        dbField: 'corporate_group',
        dbTable: 't_ai_medical_product_records',
      },
      {
        id: 'dim_product',
        name: '产品',
        aliases: ['药品', '产品名称'],
        dbField: 'product_name',
        dbTable: 't_ai_medical_product_records',
      },
      {
        id: 'dim_manufacturer',
        name: '生产企业',
        aliases: ['厂家', '制造商'],
        dbField: 'manufacturer',
        dbTable: 't_ai_medical_product_records',
      },
      {
        id: 'dim_record_date',
        name: '日期',
        aliases: ['时间', '记录日期'],
        dbField: 'record_date',
        dbTable: 't_ai_medical_product_records',
      }
    ],
    terms: [
      { id: 'term_1', term: '采购', category: 'action', mappings: ['采购'] },
      { id: 'term_2', term: '销售', category: 'action', mappings: ['销售', '采购'] }
    ],
    rules: [],
    fieldWhitelist: ['*']
  };
}

export const semanticConfig: SemanticLayerConfig = getDefaultConfig();

let initPromise: Promise<SemanticLayerConfig> | null = null;

export async function ensureSemanticConfig(): Promise<SemanticLayerConfig> {
  if (initPromise) {
    return initPromise;
  }
  
  initPromise = loadSemanticConfig();
  const config = await initPromise;
  Object.assign(semanticConfig, config);
  console.log('[语义层] 初始化完成');
  return semanticConfig;
}

loadSemanticConfig().then(config => {
  Object.assign(semanticConfig, config);
  console.log('[语义层] 初始化完成');
}).catch(e => {
  console.error('[语义层] 初始化失败:', e);
});

export default semanticConfig;
