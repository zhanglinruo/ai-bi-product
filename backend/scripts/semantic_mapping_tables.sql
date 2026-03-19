-- 语义映射数据库表结构
-- 执行方式: 在 MySQL 客户端中运行此脚本

-- 语义指标映射表
CREATE TABLE IF NOT EXISTS semantic_metrics (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '指标名称',
  aliases JSON COMMENT '别名列表',
  db_field VARCHAR(100) NOT NULL COMMENT '数据库字段',
  db_table VARCHAR(100) NOT NULL COMMENT '数据库表',
  aggregation ENUM('SUM', 'COUNT', 'AVG', 'MAX', 'MIN') DEFAULT 'SUM',
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_table (db_table)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义指标映射';

-- 语义维度映射表
CREATE TABLE IF NOT EXISTS semantic_dimensions (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '维度名称',
  aliases JSON COMMENT '别名列表',
  db_field VARCHAR(100) NOT NULL COMMENT '数据库字段',
  db_table VARCHAR(100) NOT NULL COMMENT '数据库表',
  values JSON COMMENT '可选值',
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_table (db_table)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语义维度映射';

-- 业务术语映射表
CREATE TABLE IF NOT EXISTS semantic_terms (
  id VARCHAR(50) PRIMARY KEY,
  term VARCHAR(100) NOT NULL COMMENT '术语',
  category VARCHAR(50) COMMENT '分类',
  mappings JSON COMMENT '映射关系',
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_term (term),
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务术语映射';

-- 插入初始数据：指标
INSERT INTO semantic_metrics (id, name, aliases, db_field, db_table, aggregation, description) VALUES
('metric_sales', '销售额', '["销售金额", "销售总额", "金额", "总计", "总额"]', 'total_amount', 'orders', 'SUM', '销售总金额'),
('metric_order_count', '订单数', '["订单量", "订单数量", "订单"]', 'order_id', 'orders', 'COUNT', '订单数量统计'),
('metric_customer_count', '客户数', '["客户总数", "客户数量"]', 'customer_id', 'customers', 'COUNT', '客户数量统计'),
('metric_product_count', '产品数', '["商品数", "商品数量"]', 'product_id', 'products', 'COUNT', '产品数量统计'),
('metric_avg_order', '平均订单金额', '["客单价", "平均金额"]', 'total_amount', 'orders', 'AVG', '平均每单金额'),
('metric_max_sales', '最高销售额', '["最大金额", "最高的"]', 'total_amount', 'orders', 'MAX', '最大订单金额'),
('metric_min_sales', '最低销售额', '["最小金额", "最低的"]', 'total_amount', 'orders', 'MIN', '最小订单金额')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 插入初始数据：维度
INSERT INTO semantic_dimensions (id, name, aliases, db_field, db_table, values, description) VALUES
('dim_customer_type', '客户类型', '["客户类别"]', 'customer_type', 'customers', '["RETAIL", "WHOLESALE", "DISTRIBUTOR"]', '客户分类'),
('dim_category', '产品类别', '["产品分类", "类别"]', 'category', 'products', NULL, '产品分类'),
('dim_city', '城市', '[]', 'city', 'customers', NULL, '客户所在城市'),
('dim_country', '国家', '[]', 'country', 'customers', NULL, '客户所在国家'),
('dim_order_status', '订单状态', '[]', 'order_status', 'orders', '["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]', '订单状态'),
('dim_payment_method', '支付方式', '[]', 'payment_method', 'orders', '["CREDIT_CARD", "BANK_TRANSFER", "CASH", "PAYPAL"]', '支付方式'),
('dim_manufacturer', '制造商', '["厂家"]', 'manufacturer', 'products', NULL, '产品制造商')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 插入初始数据：术语
INSERT INTO semantic_terms (id, term, category, mappings, description) VALUES
('term_retail', '零售', 'customer_type', '{"field": "customer_type", "value": "RETAIL"}', '零售客户'),
('term_wholesale', '批发', 'customer_type', '{"field": "customer_type", "value": "WHOLESALE"}', '批发客户'),
('term_distributor', '分销商', 'customer_type', '{"field": "customer_type", "value": "DISTRIBUTOR"}', '分销商客户'),
('term_active', '活跃', 'status', '{"field": "account_status", "value": "ACTIVE"}', '活跃状态'),
('term_completed', '已完成', 'order_status', '{"field": "order_status", "value": "DELIVERED"}', '已完成订单'),
('term_pending', '待处理', 'order_status', '{"field": "order_status", "value": "PENDING"}', '待处理订单'),
('term_shipped', '已发货', 'order_status', '{"field": "order_status", "value": "SHIPPED"}', '已发货订单')
ON DUPLICATE KEY UPDATE term=VALUES(term);
