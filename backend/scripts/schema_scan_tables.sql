-- 数据库结构扫描结果存储表

-- 表结构信息
CREATE TABLE IF NOT EXISTS schema_tables (
  id VARCHAR(50) PRIMARY KEY,
  datasource_id VARCHAR(50) NOT NULL COMMENT '数据源ID',
  table_name VARCHAR(100) NOT NULL COMMENT '表名',
  table_comment TEXT COMMENT '表注释',
  row_count INT DEFAULT 0 COMMENT '行数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_datasource (datasource_id),
  UNIQUE KEY uk_datasource_table (datasource_id, table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表结构信息';

-- 字段结构信息
CREATE TABLE IF NOT EXISTS schema_columns (
  id VARCHAR(50) PRIMARY KEY,
  datasource_id VARCHAR(50) NOT NULL COMMENT '数据源ID',
  table_name VARCHAR(100) NOT NULL COMMENT '表名',
  column_name VARCHAR(100) NOT NULL COMMENT '字段名',
  column_type VARCHAR(50) COMMENT '字段类型',
  is_nullable BOOLEAN DEFAULT TRUE COMMENT '是否可为空',
  column_key VARCHAR(10) COMMENT '键类型(PRI/UNI/MUL)',
  column_default TEXT COMMENT '默认值',
  column_comment TEXT COMMENT '字段注释',
  is_metric BOOLEAN DEFAULT FALSE COMMENT '是否为指标',
  is_dimension BOOLEAN DEFAULT FALSE COMMENT '是否为维度',
  semantic_name VARCHAR(100) COMMENT '语义名称',
  semantic_description TEXT COMMENT '语义描述',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_datasource (datasource_id),
  INDEX idx_table (table_name),
  UNIQUE KEY uk_datasource_table_column (datasource_id, table_name, column_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字段结构信息';

-- 扫描历史记录
CREATE TABLE IF NOT EXISTS schema_scan_history (
  id VARCHAR(50) PRIMARY KEY,
  datasource_id VARCHAR(50) NOT NULL COMMENT '数据源ID',
  status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
  tables_count INT DEFAULT 0 COMMENT '扫描表数',
  columns_count INT DEFAULT 0 COMMENT '扫描字段数',
  error_message TEXT COMMENT '错误信息',
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_datasource (datasource_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫描历史记录';
