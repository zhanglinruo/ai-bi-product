import { query } from '../src/config/database';
import { v4 as uuidv4 } from 'uuid';

async function initSemanticLayer() {
  console.log('初始化语义层表结构...');
  
  const tables = [
    `CREATE TABLE IF NOT EXISTS semantic_metrics (
      id CHAR(36) PRIMARY KEY,
      datasource_id CHAR(36) NOT NULL,
      metric_id VARCHAR(100) NOT NULL,
      metric_name VARCHAR(200) NOT NULL,
      aliases JSON,
      business口径 TEXT,
      technical口径 TEXT,
      calculation TEXT,
      unit VARCHAR(50),
      data_mapping JSON,
      dimensions JSON,
      business_rules JSON,
      business_domain VARCHAR(50),
      category VARCHAR(50),
      version INT DEFAULT 1,
      status VARCHAR(20) DEFAULT 'published',
      vector JSON,
      created_by CHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_datasource_metric (datasource_id, metric_id),
      INDEX idx_status (status),
      INDEX idx_domain (business_domain)
    )`,
    
    `CREATE TABLE IF NOT EXISTS semantic_terms (
      id CHAR(36) PRIMARY KEY,
      datasource_id CHAR(36) NOT NULL,
      term_id VARCHAR(100) NOT NULL,
      term_name VARCHAR(200) NOT NULL,
      aliases JSON,
      definition TEXT,
      data_type VARCHAR(50),
      related_metrics JSON,
      related_dims JSON,
      business_domain VARCHAR(50),
      version INT DEFAULT 1,
      status VARCHAR(20) DEFAULT 'published',
      vector JSON,
      created_by CHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_datasource_term (datasource_id, term_id),
      INDEX idx_status (status)
    )`,
    
    `CREATE TABLE IF NOT EXISTS semantic_dimensions (
      id CHAR(36) PRIMARY KEY,
      datasource_id CHAR(36) NOT NULL,
      dim_id VARCHAR(100) NOT NULL,
      dim_name VARCHAR(200) NOT NULL,
      aliases JSON,
      hierarchy JSON,
      definition TEXT,
      data_mapping JSON,
      related_metrics JSON,
      business_domain VARCHAR(50),
      version INT DEFAULT 1,
      status VARCHAR(20) DEFAULT 'published',
      vector JSON,
      created_by CHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_datasource_dim (datasource_id, dim_id),
      INDEX idx_status (status)
    )`,
    
    `CREATE TABLE IF NOT EXISTS semantic_rules (
      id CHAR(36) PRIMARY KEY,
      datasource_id CHAR(36) NOT NULL,
      rule_id VARCHAR(100) NOT NULL,
      rule_name VARCHAR(200) NOT NULL,
      rule_content TEXT NOT NULL,
      applies_to JSON,
      priority INT DEFAULT 0,
      business_domain VARCHAR(50),
      version INT DEFAULT 1,
      status VARCHAR(20) DEFAULT 'published',
      created_by CHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_datasource_rule (datasource_id, rule_id),
      INDEX idx_status (status)
    )`,
    
    `CREATE TABLE IF NOT EXISTS semantic_field_whitelist (
      id CHAR(36) PRIMARY KEY,
      datasource_id CHAR(36) NOT NULL,
      table_name VARCHAR(100) NOT NULL,
      field_name VARCHAR(100) NOT NULL,
      field_alias VARCHAR(100),
      field_type VARCHAR(50),
      is_sensitive TINYINT(1) DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_table_field (datasource_id, table_name, field_name),
      INDEX idx_table (table_name)
    )`
  ];

  for (const sql of tables) {
    try {
      await query(sql);
      console.log('  表创建成功');
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('  表已存在，跳过');
      } else {
        console.error('  创建表失败:', error.message);
      }
    }
  }

  console.log('\n初始化语义层基础数据...');
  await seedSampleData();
  
  console.log('\n✅ 语义层初始化完成！');
}

async function seedSampleData() {
  const datasourceId = 'default-datasource';
  
  const metrics = [
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      metric_id: 'purchase_amount',
      metric_name: '采购金额',
      aliases: JSON.stringify(['采购额', '采购总价', '订单金额', '成交金额', '总金额']),
      business口径: '医疗机构采购商品的总金额，包含所有已完成的采购订单',
      technical口径: 'SUM(t_ai_medical_product_records.amount)',
      calculation: 'SUM(amount)',
      unit: '元',
      data_mapping: JSON.stringify({ table: 't_ai_medical_product_records', field: 'amount' }),
      dimensions: JSON.stringify(['corporate_group', 'hospital_name', 'product_name']),
      business_domain: '采购',
      category: '金额类',
      status: 'published'
    },
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      metric_id: 'purchase_quantity',
      metric_name: '采购数量',
      aliases: JSON.stringify(['采购件数', '订单数量', '产品数量']),
      business口径: '医疗机构采购商品的总数量',
      technical口径: 'SUM(t_ai_medical_product_records.quantity)',
      calculation: 'SUM(quantity)',
      unit: '件',
      data_mapping: JSON.stringify({ table: 't_ai_medical_product_records', field: 'quantity' }),
      dimensions: JSON.stringify(['corporate_group', 'hospital_name', 'product_name']),
      business_domain: '采购',
      category: '数量类',
      status: 'published'
    },
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      metric_id: 'corporate_purchase',
      metric_name: '企业集团采购',
      aliases: JSON.stringify(['集团采购', '企业采购']),
      business口径: '按企业集团维度统计的采购数据',
      technical口径: 'GROUP BY corporate_group',
      calculation: 'GROUP BY corporate_group',
      unit: '元',
      data_mapping: JSON.stringify({ table: 't_ai_medical_product_records', field: 'corporate_group' }),
      dimensions: JSON.stringify(['corporate_group']),
      business_domain: '采购',
      category: '维度类',
      status: 'published'
    }
  ];

  const terms = [
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      term_id: 'corporate_group',
      term_name: '企业集团',
      aliases: JSON.stringify(['集团', '企业', '公司', '企业名称']),
      definition: '采购企业的集团公司名称，用于标识采购主体',
      data_type: 'varchar',
      related_metrics: JSON.stringify(['purchase_amount', 'purchase_quantity']),
      related_dims: JSON.stringify(['corporate_purchase']),
      business_domain: '采购',
      status: 'published'
    },
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      term_id: 'hospital_name',
      term_name: '医院',
      aliases: JSON.stringify(['医疗机构', '医院名称']),
      definition: '采购发生的医疗机构名称',
      data_type: 'varchar',
      related_metrics: JSON.stringify(['purchase_amount', 'purchase_quantity']),
      related_dims: JSON.stringify([]),
      business_domain: '采购',
      status: 'published'
    },
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      term_id: 'product_name',
      term_name: '产品名称',
      aliases: JSON.stringify(['商品名称', '物资名称', '产品']),
      definition: '采购的商品或产品的名称',
      data_type: 'varchar',
      related_metrics: JSON.stringify(['purchase_amount', 'purchase_quantity']),
      related_dims: JSON.stringify([]),
      business_domain: '采购',
      status: 'published'
    }
  ];

  const dimensions = [
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      dim_id: 'enterprise',
      dim_name: '企业集团',
      aliases: JSON.stringify(['集团', '企业']),
      hierarchy: JSON.stringify({ level1: '企业集团', level2: '子公司' }),
      definition: '采购企业的组织架构维度',
      data_mapping: JSON.stringify({ table: 't_ai_medical_product_records', field: 'corporate_group' }),
      related_metrics: JSON.stringify(['purchase_amount', 'purchase_quantity']),
      business_domain: '采购',
      status: 'published'
    },
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      dim_id: 'hospital',
      dim_name: '医院',
      aliases: JSON.stringify(['医疗机构', '采购机构']),
      hierarchy: JSON.stringify({ level1: '医院', level2: '科室' }),
      definition: '采购发生的医疗机构维度',
      data_mapping: JSON.stringify({ table: 't_ai_medical_product_records', field: 'hospital_name' }),
      related_metrics: JSON.stringify(['purchase_amount', 'purchase_quantity']),
      business_domain: '采购',
      status: 'published'
    },
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      dim_id: 'product',
      dim_name: '产品',
      aliases: JSON.stringify(['商品', '物资']),
      hierarchy: JSON.stringify({ level1: '产品分类', level2: '产品名称' }),
      definition: '采购的产品维度',
      data_mapping: JSON.stringify({ table: 't_ai_medical_product_records', field: 'product_name' }),
      related_metrics: JSON.stringify(['purchase_amount', 'purchase_quantity']),
      business_domain: '采购',
      status: 'published'
    }
  ];

  const rules = [
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      rule_id: 'amount_positive',
      rule_name: '金额必须为正',
      rule_content: '金额类指标查询时，必须添加 WHERE amount > 0 条件',
      applies_to: JSON.stringify({ metrics: ['purchase_amount'] }),
      priority: 10,
      business_domain: '采购',
      status: 'published'
    },
    {
      id: uuidv4(),
      datasource_id: datasourceId,
      rule_id: 'enterprise_grouping',
      rule_name: '企业集团汇总',
      rule_content: '按企业集团统计时，使用 corporate_group 字段分组',
      applies_to: JSON.stringify({ metrics: ['corporate_purchase'] }),
      priority: 5,
      business_domain: '采购',
      status: 'published'
    }
  ];

  const whitelist = [
    { table_name: 't_ai_medical_product_records', field_name: 'id', field_alias: 'ID', field_type: 'int', is_sensitive: 0, description: '主键ID' },
    { table_name: 't_ai_medical_product_records', field_name: 'hospital_code', field_alias: '医院编码', field_type: 'varchar', is_sensitive: 0, description: '医院编码' },
    { table_name: 't_ai_medical_product_records', field_name: 'province', field_alias: '省份', field_type: 'varchar', is_sensitive: 0, description: '省份' },
    { table_name: 't_ai_medical_product_records', field_name: 'city', field_alias: '城市', field_type: 'varchar', is_sensitive: 0, description: '城市' },
    { table_name: 't_ai_medical_product_records', field_name: 'county', field_alias: '区县', field_type: 'varchar', is_sensitive: 0, description: '区县' },
    { table_name: 't_ai_medical_product_records', field_name: 'hospital_name', field_alias: '医院', field_type: 'varchar', is_sensitive: 0, description: '采购的医疗机构名称' },
    { table_name: 't_ai_medical_product_records', field_name: 'hospital_level', field_alias: '医院等级', field_type: 'varchar', is_sensitive: 0, description: '医院等级' },
    { table_name: 't_ai_medical_product_records', field_name: 'record_date', field_alias: '记录日期', field_type: 'date', is_sensitive: 0, description: '记录日期' },
    { table_name: 't_ai_medical_product_records', field_name: 'price', field_alias: '单价', field_type: 'decimal', is_sensitive: 0, description: '产品单价' },
    { table_name: 't_ai_medical_product_records', field_name: 'quantity', field_alias: '采购数量', field_type: 'int', is_sensitive: 0, description: '采购数量' },
    { table_name: 't_ai_medical_product_records', field_name: 'amount', field_alias: '采购金额', field_type: 'decimal', is_sensitive: 0, description: '采购金额' },
    { table_name: 't_ai_medical_product_records', field_name: 'generic_name', field_alias: '通用名', field_type: 'varchar', is_sensitive: 0, description: '产品通用名' },
    { table_name: 't_ai_medical_product_records', field_name: 'product_name', field_alias: '产品名称', field_type: 'varchar', is_sensitive: 0, description: '采购的产品名称' },
    { table_name: 't_ai_medical_product_records', field_name: 'brand_name', field_alias: '品牌名称', field_type: 'varchar', is_sensitive: 0, description: '产品品牌名称' },
    { table_name: 't_ai_medical_product_records', field_name: 'manufacturer', field_alias: '生产企业', field_type: 'varchar', is_sensitive: 0, description: '生产企业' },
    { table_name: 't_ai_medical_product_records', field_name: 'dosage_form', field_alias: '剂型', field_type: 'varchar', is_sensitive: 0, description: '药品剂型' },
    { table_name: 't_ai_medical_product_records', field_name: 'specifications', field_alias: '规格', field_type: 'varchar', is_sensitive: 0, description: '产品规格' },
    { table_name: 't_ai_medical_product_records', field_name: 'packaging', field_alias: '包装', field_type: 'varchar', is_sensitive: 0, description: '产品包装' },
    { table_name: 't_ai_medical_product_records', field_name: 'corporate_group', field_alias: '企业集团', field_type: 'varchar', is_sensitive: 0, description: '采购企业所属的企业集团' },
    { table_name: 't_ai_medical_product_records', field_name: 'category', field_alias: '产品分类', field_type: 'varchar', is_sensitive: 0, description: '产品分类' }
  ];

  try {
    for (const m of metrics) {
      await query(
        `INSERT IGNORE INTO semantic_metrics (id, datasource_id, metric_id, metric_name, aliases, business口径, technical口径, calculation, unit, data_mapping, dimensions, business_domain, category, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [m.id, m.datasource_id, m.metric_id, m.metric_name, m.aliases, m.business口径, m.technical口径, m.calculation, m.unit, m.data_mapping, m.dimensions, m.business_domain, m.category, m.status]
      );
    }
    console.log('  指标数据导入完成');
  } catch (error: any) {
    console.error('  导入指标数据失败:', error.message);
  }

  try {
    for (const t of terms) {
      await query(
        `INSERT IGNORE INTO semantic_terms (id, datasource_id, term_id, term_name, aliases, definition, data_type, related_metrics, related_dims, business_domain, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.datasource_id, t.term_id, t.term_name, t.aliases, t.definition, t.data_type, t.related_metrics, t.related_dims, t.business_domain, t.status]
      );
    }
    console.log('  术语数据导入完成');
  } catch (error: any) {
    console.error('  导入术语数据失败:', error.message);
  }

  try {
    for (const d of dimensions) {
      await query(
        `INSERT IGNORE INTO semantic_dimensions (id, datasource_id, dim_id, dim_name, aliases, hierarchy, definition, data_mapping, related_metrics, business_domain, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.id, d.datasource_id, d.dim_id, d.dim_name, d.aliases, d.hierarchy, d.definition, d.data_mapping, d.related_metrics, d.business_domain, d.status]
      );
    }
    console.log('  维度数据导入完成');
  } catch (error: any) {
    console.error('  导入维度数据失败:', error.message);
  }

  try {
    for (const r of rules) {
      await query(
        `INSERT IGNORE INTO semantic_rules (id, datasource_id, rule_id, rule_name, rule_content, applies_to, priority, business_domain, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.datasource_id, r.rule_id, r.rule_name, r.rule_content, r.applies_to, r.priority, r.business_domain, r.status]
      );
    }
    console.log('  规则数据导入完成');
  } catch (error: any) {
    console.error('  导入规则数据失败:', error.message);
  }

  try {
    for (const w of whitelist) {
      await query(
        `INSERT IGNORE INTO semantic_field_whitelist (id, datasource_id, table_name, field_name, field_alias, field_type, is_sensitive, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), datasourceId, w.table_name, w.field_name, w.field_alias, w.field_type, w.is_sensitive, w.description]
      );
    }
    console.log('  字段白名单导入完成');
  } catch (error: any) {
    console.error('  导入字段白名单失败:', error.message);
  }
}

initSemanticLayer().catch(console.error);
