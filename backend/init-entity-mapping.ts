const { query } = require('./src/config/database');

async function init() {
  console.log('开始创建实体映射表...');
  
  await query(`
    CREATE TABLE IF NOT EXISTS semantic_entity_mapping (
      id CHAR(36) PRIMARY KEY,
      datasource_id CHAR(36) NOT NULL,
      dimension_id CHAR(36),
      dimension_name VARCHAR(100) NOT NULL,
      user_input VARCHAR(200) NOT NULL,
      db_value VARCHAR(200) NOT NULL,
      match_priority INT DEFAULT 10,
      status VARCHAR(20) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dimension (dimension_name),
      INDEX idx_user_input (user_input(100)),
      INDEX idx_status (status)
    )
  `);
  console.log('semantic_entity_mapping 表创建完成');
  
  await query(`
    CREATE TABLE IF NOT EXISTS semantic_normalization_rule (
      id CHAR(36) PRIMARY KEY,
      datasource_id CHAR(36) NOT NULL,
      dimension_id CHAR(36),
      dimension_name VARCHAR(100) NOT NULL,
      rule_type VARCHAR(50) NOT NULL,
      rule_pattern VARCHAR(200),
      rule_replacement VARCHAR(200),
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dimension (dimension_name),
      INDEX idx_rule_type (rule_type)
    )
  `);
  console.log('semantic_normalization_rule 表创建完成');
  
  console.log('开始导入映射数据...');
  const mappings = [
    { dimension: '省份', inputs: '安徽省,安徽,皖', db: '安徽' },
    { dimension: '省份', inputs: '浙江省,浙江,浙', db: '浙江' },
    { dimension: '省份', inputs: '江苏省,江苏,苏', db: '江苏' },
    { dimension: '省份', inputs: '广东省,广东,粤', db: '广东' },
    { dimension: '省份', inputs: '山东省,山东,鲁', db: '山东' },
    { dimension: '省份', inputs: '四川省,四川,川', db: '四川' },
    { dimension: '省份', inputs: '河南省,河南', db: '河南' },
    { dimension: '省份', inputs: '河北省,河北', db: '河北' },
    { dimension: '省份', inputs: '湖南省,湖南', db: '湖南' },
    { dimension: '省份', inputs: '湖北省,湖北', db: '湖北' },
    { dimension: '省份', inputs: '上海市,上海,沪', db: '上海' },
    { dimension: '省份', inputs: '北京市,北京,京', db: '北京' },
    { dimension: '省份', inputs: '重庆市,重庆,渝', db: '重庆' },
    { dimension: '省份', inputs: '天津市,天津,津', db: '天津' },
    { dimension: '医院等级', inputs: '三级甲等,三甲', db: '三甲' },
    { dimension: '医院等级', inputs: '三级乙等,三乙', db: '三乙' },
    { dimension: '医院等级', inputs: '二级甲等,二甲', db: '二甲' },
    { dimension: '医院等级', inputs: '二级乙等,二乙', db: '二乙' },
    { dimension: '医院等级', inputs: '一级甲等,一甲', db: '一甲' },
  ];
  
  for (const m of mappings) {
    await query(
      'INSERT IGNORE INTO semantic_entity_mapping (id, datasource_id, dimension_name, user_input, db_value, match_priority, status) VALUES (?, ?, ?, ?, ?, 1, ?)',
      [require('uuid').v4(), 'default-datasource', m.dimension, m.inputs, m.db, 'active']
    );
  }
  console.log('映射数据导入完成');
  
  const count = await query('SELECT COUNT(*) as cnt FROM semantic_entity_mapping');
  console.log('当前映射数量:', count[0].cnt);
}

init().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
