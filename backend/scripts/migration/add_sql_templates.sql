-- SQL 模板表
CREATE TABLE IF NOT EXISTS `sql_templates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL COMMENT '模板名称',
  `description` TEXT COMMENT '模板描述',
  `sql_template` TEXT NOT NULL COMMENT 'SQL 模板',
  `keywords` VARCHAR(500) COMMENT '关键词（逗号分隔）用于快速匹配',
  `dimensions` VARCHAR(500) COMMENT '支持的维度字段',
  `metrics` VARCHAR(500) COMMENT '关联的指标字段',
  `category` VARCHAR(100) DEFAULT 'general' COMMENT '分类：market_share, ranking, trend, etc.',
  `embedding` TEXT COMMENT '向量表示（JSON 数组）',
  `datasource_id` VARCHAR(100) COMMENT '关联的数据源ID',
  `is_active` TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  `use_count` INT DEFAULT 0 COMMENT '使用次数',
  `last_used_at` DATETIME COMMENT '最后使用时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` VARCHAR(100) COMMENT '创建者',
  INDEX `idx_keywords` (`keywords`(100)),
  INDEX `idx_category` (`category`),
  INDEX `idx_datasource` (`datasource_id`),
  INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SQL 模板库';

-- SQL 规范规则表
CREATE TABLE IF NOT EXISTS `sql_rules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rule_code` VARCHAR(100) NOT NULL UNIQUE COMMENT '规则代码',
  `rule_name` VARCHAR(255) NOT NULL COMMENT '规则名称',
  `rule_content` TEXT NOT NULL COMMENT '规则内容',
  `rule_type` VARCHAR(50) DEFAULT 'constraint' COMMENT '类型：constraint, template, standard',
  `applies_to` VARCHAR(100) DEFAULT 'all' COMMENT '应用的查询类型',
  `priority` INT DEFAULT 100 COMMENT '优先级（越小越高）',
  `is_active` TINYINT(1) DEFAULT 1,
  `description` TEXT COMMENT '规则描述',
  `examples` TEXT COMMENT '示例',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_rule_code` (`rule_code`),
  INDEX `idx_type` (`rule_type`),
  INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SQL 生成规则库';
