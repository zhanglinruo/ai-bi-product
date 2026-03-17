-- 语义层表结构
-- 用于存储业务语义定义，支持 RAG 检索

-- 1. 指标切片表
CREATE TABLE IF NOT EXISTS semantic_metrics (
    id              CHAR(36) PRIMARY KEY,
    datasource_id   CHAR(36) NOT NULL COMMENT '数据源ID',
    metric_id       VARCHAR(100) NOT NULL COMMENT '指标ID',
    metric_name     VARCHAR(200) NOT NULL COMMENT '指标名称',
    aliases         JSON COMMENT '别名列表 ["GMV", "订单金额", "成交额"]',
    business口径    TEXT COMMENT '业务口径描述',
    technical口径   TEXT COMMENT '技术口径描述',
    calculation     TEXT COMMENT '计算公式',
    unit            VARCHAR(50) COMMENT '单位',
    data_mapping    JSON COMMENT '数据映射 {table, fields, filters}',
    dimensions      JSON COMMENT '关联维度列表',
    business_rules  JSON COMMENT '适用业务规则',
    business_domain VARCHAR(50) COMMENT '业务域: 销售/财务/采购/库存...',
    category        VARCHAR(50) COMMENT '指标分类',
    version         INT DEFAULT 1 COMMENT '版本号',
    status          VARCHAR(20) DEFAULT 'published' COMMENT '状态: draft/published/deprecated',
    vector          JSON COMMENT '向量嵌入 (用于RAG检索)',
    created_by      CHAR(36) COMMENT '创建者',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_datasource_metric (datasource_id, metric_id),
    INDEX idx_status (status),
    INDEX idx_domain (business_domain),
    INDEX idx_name (metric_name),
    FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义层-指标表';

-- 2. 术语切片表
CREATE TABLE IF NOT EXISTS semantic_terms (
    id              CHAR(36) PRIMARY KEY,
    datasource_id   CHAR(36) NOT NULL COMMENT '数据源ID',
    term_id         VARCHAR(100) NOT NULL COMMENT '术语ID',
    term_name       VARCHAR(200) NOT NULL COMMENT '术语名称',
    aliases         JSON COMMENT '别名列表',
    definition      TEXT COMMENT '业务释义',
    data_type       VARCHAR(50) COMMENT '数据类型',
    related_metrics JSON COMMENT '关联指标列表',
    related_dims    JSON COMMENT '关联维度列表',
    business_domain VARCHAR(50) COMMENT '业务域',
    version         INT DEFAULT 1,
    status          VARCHAR(20) DEFAULT 'published',
    vector          JSON COMMENT '向量嵌入',
    created_by      CHAR(36),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_datasource_term (datasource_id, term_id),
    INDEX idx_status (status),
    INDEX idx_name (term_name),
    FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义层-术语表';

-- 3. 维度切片表
CREATE TABLE IF NOT EXISTS semantic_dimensions (
    id              CHAR(36) PRIMARY KEY,
    datasource_id   CHAR(36) NOT NULL COMMENT '数据源ID',
    dim_id          VARCHAR(100) NOT NULL COMMENT '维度ID',
    dim_name        VARCHAR(200) NOT NULL COMMENT '维度名称',
    aliases         JSON COMMENT '别名列表',
    hierarchy       JSON COMMENT '层级关系 {level1, level2, level3}',
    definition      TEXT COMMENT '业务释义',
    data_mapping    JSON COMMENT '数据映射 {table, field}',
    related_metrics JSON COMMENT '关联指标',
    business_domain VARCHAR(50) COMMENT '业务域',
    version         INT DEFAULT 1,
    status          VARCHAR(20) DEFAULT 'published',
    vector          JSON COMMENT '向量嵌入',
    created_by      CHAR(36),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_datasource_dim (datasource_id, dim_id),
    INDEX idx_status (status),
    INDEX idx_name (dim_name),
    FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义层-维度表';

-- 4. 业务规则切片表
CREATE TABLE IF NOT EXISTS semantic_rules (
    id              CHAR(36) PRIMARY KEY,
    datasource_id   CHAR(36) NOT NULL COMMENT '数据源ID',
    rule_id         VARCHAR(100) NOT NULL COMMENT '规则ID',
    rule_name       VARCHAR(200) NOT NULL COMMENT '规则名称',
    rule_content    TEXT NOT NULL COMMENT '规则内容',
    applies_to      JSON COMMENT '适用范围 {metrics, dimensions}',
    priority        INT DEFAULT 0 COMMENT '优先级',
    business_domain VARCHAR(50) COMMENT '业务域',
    version         INT DEFAULT 1,
    status          VARCHAR(20) DEFAULT 'published',
    created_by      CHAR(36),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_datasource_rule (datasource_id, rule_id),
    INDEX idx_status (status),
    INDEX idx_domain (business_domain),
    FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义层-业务规则表';

-- 5. 字段白名单表 (用于 SQL 校验)
CREATE TABLE IF NOT EXISTS semantic_field_whitelist (
    id              CHAR(36) PRIMARY KEY,
    datasource_id   CHAR(36) NOT NULL COMMENT '数据源ID',
    table_name       VARCHAR(100) NOT NULL COMMENT '表名',
    field_name       VARCHAR(100) NOT NULL COMMENT '字段名',
    field_alias      VARCHAR(100) COMMENT '业务别名',
    field_type       VARCHAR(50) COMMENT '字段类型',
    is_sensitive     TINYINT(1) DEFAULT 0 COMMENT '是否敏感',
    description     TEXT COMMENT '字段描述',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_table_field (datasource_id, table_name, field_name),
    INDEX idx_table (table_name),
    FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义层-字段白名单';

-- 6. 实体值映射表 (用于解决"安徽省≠安徽"等实体值差异)
CREATE TABLE IF NOT EXISTS semantic_entity_mapping (
    id                  CHAR(36) PRIMARY KEY,
    datasource_id       CHAR(36) NOT NULL COMMENT '数据源ID',
    dimension_id        CHAR(36) COMMENT '关联维度ID',
    dimension_name      VARCHAR(100) NOT NULL COMMENT '维度名称',
    user_input          VARCHAR(200) NOT NULL COMMENT '用户输入值（支持多个，逗号分隔）',
    db_value            VARCHAR(200) NOT NULL COMMENT '数据库存储值',
    match_priority      INT DEFAULT 10 COMMENT '匹配优先级（1最高）',
    status              VARCHAR(20) DEFAULT 'active' COMMENT '状态: active, inactive',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dimension (dimension_name),
    INDEX idx_user_input (user_input(100)),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义层-实体值映射表';

-- 7. 实体值标准化规则表
CREATE TABLE IF NOT EXISTS semantic_normalization_rule (
    id                  CHAR(36) PRIMARY KEY,
    datasource_id       CHAR(36) NOT NULL COMMENT '数据源ID',
    dimension_id        CHAR(36) COMMENT '关联维度ID',
    dimension_name      VARCHAR(100) NOT NULL COMMENT '维度名称',
    rule_type           VARCHAR(50) NOT NULL COMMENT '规则类型: suffix_remove, case_normalize, alias_generate',
    rule_pattern        VARCHAR(200) COMMENT '匹配模式（正则）',
    rule_replacement    VARCHAR(200) COMMENT '替换内容',
    is_active           TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dimension (dimension_name),
    INDEX idx_rule_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义层-实体值标准化规则';
