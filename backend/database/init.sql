-- 数答 MVP 数据库初始化脚本
-- 数据库: MySQL 8.0
-- 创建数据库（使用配置的数据库名：swyl_test）
CREATE DATABASE IF NOT EXISTS swyl_test DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE swyl_test;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id              CHAR(36) PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password_hash   VARCHAR(255) NOT NULL COMMENT '密码哈希',
    email           VARCHAR(100) COMMENT '邮箱',
    role            VARCHAR(20) NOT NULL DEFAULT 'user' COMMENT '角色: admin/user',
    status          VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at   DATETIME COMMENT '最后登录时间',
    INDEX idx_username (username),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 数据源表
CREATE TABLE IF NOT EXISTS datasources (
    id              CHAR(36) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL COMMENT '数据源名称',
    type            VARCHAR(30) NOT NULL COMMENT '类型: mysql/postgresql/sqlserver/clickhouse/excel/crm_api',
    host            VARCHAR(255) COMMENT '连接地址',
    port            INT COMMENT '端口',
    database_name   VARCHAR(100) COMMENT '数据库名',
    username        VARCHAR(100) COMMENT '用户名',
    password_enc    VARCHAR(255) COMMENT '加密后的密码',
    file_path       VARCHAR(500) COMMENT '文件路径(Excel/CSV用)',
    connection_config JSON COMMENT '连接配置（JSON格式）',
    api_config      JSON COMMENT 'API配置',
    status          VARCHAR(20) DEFAULT 'active' COMMENT '状态: active/disabled',
    created_by      CHAR(36) COMMENT '创建者ID',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_sync_at    DATETIME COMMENT '最后同步时间',
    INDEX idx_type (type),
    INDEX idx_created_by (created_by),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据源表';

-- 元数据表
CREATE TABLE IF NOT EXISTS metadata (
    id              CHAR(36) PRIMARY KEY,
    datasource_id   CHAR(36) NOT NULL COMMENT '数据源ID',
    table_name      VARCHAR(100) NOT NULL COMMENT '表名',
    table_comment   VARCHAR(255) COMMENT 'AI识别的表含义',
    columns         JSON NOT NULL COMMENT '字段列表',
    relationships   JSON COMMENT '表关系',
    is_sensitive    TINYINT(1) DEFAULT 0 COMMENT '是否敏感',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_datasource_table (datasource_id, table_name),
    INDEX idx_datasource (datasource_id),
    FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='元数据表';

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
    id              CHAR(36) PRIMARY KEY,
    user_id         CHAR(36) NOT NULL COMMENT '用户ID',
    datasource_id   CHAR(36) COMMENT '数据源ID',
    title           VARCHAR(200) COMMENT '会话标题',
    status          VARCHAR(20) DEFAULT 'active' COMMENT '状态: active/closed',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ended_at        DATETIME COMMENT '结束时间',
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话表';

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
    id              CHAR(36) PRIMARY KEY,
    session_id      CHAR(36) NOT NULL COMMENT '会话ID',
    role            VARCHAR(20) NOT NULL COMMENT '角色: user/assistant',
    content         TEXT NOT NULL COMMENT '消息内容',
    sql_query       VARCHAR(1000) COMMENT '生成的SQL',
    sql_executed    TINYINT(1) DEFAULT 0 COMMENT '是否已执行',
    execution_time  INT COMMENT '执行耗时(ms)',
    error_message   TEXT COMMENT '错误信息',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息表';

-- 查询历史表
CREATE TABLE IF NOT EXISTS query_history (
    id              CHAR(36) PRIMARY KEY,
    user_id         CHAR(36) NOT NULL COMMENT '用户ID',
    session_id      CHAR(36) COMMENT '会话ID',
    datasource_id   CHAR(36) COMMENT '数据源ID',
    question        TEXT NOT NULL COMMENT '用户问题',
    sql_generated   VARCHAR(2000) COMMENT '生成的SQL',
    result_data     JSON COMMENT '查询结果',
    conclusion      TEXT COMMENT 'AI生成的结论',
    chart_type      VARCHAR(30) COMMENT '图表类型',
    execution_time  INT COMMENT '执行耗时(ms)',
    status          VARCHAR(20) DEFAULT 'success' COMMENT '状态: success/failed',
    error_message   TEXT COMMENT '错误信息',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='查询历史表';

-- 保存结果表
CREATE TABLE IF NOT EXISTS saved_results (
    id              CHAR(36) PRIMARY KEY,
    user_id         CHAR(36) NOT NULL COMMENT '用户ID',
    title           VARCHAR(200) NOT NULL COMMENT '标题',
    question        TEXT NOT NULL COMMENT '问题',
    sql_query       VARCHAR(2000) COMMENT 'SQL',
    result_data     JSON COMMENT '结果数据',
    conclusion      TEXT COMMENT '结论',
    chart_type      VARCHAR(30) COMMENT '图表类型',
    category        VARCHAR(50) COMMENT '自动分类',
    is_shared       TINYINT(1) DEFAULT 0 COMMENT '是否分享',
    share_token     VARCHAR(64) COMMENT '分享链接token',
    share_password  VARCHAR(100) COMMENT '分享密码(加密)',
    share_expires   DATETIME COMMENT '分享过期时间',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_category (category),
    INDEX idx_share_token (share_token),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='保存结果表';

-- 权限表
CREATE TABLE IF NOT EXISTS permissions (
    id              CHAR(36) PRIMARY KEY,
    datasource_id   CHAR(36) NOT NULL COMMENT '数据源ID',
    user_id         CHAR(36) NOT NULL COMMENT '用户ID',
    access_level    VARCHAR(20) DEFAULT 'read' COMMENT '权限: read/write/admin',
    row_filters     JSON COMMENT '行级权限过滤条件',
    column_filters  JSON COMMENT '列级权限(脱敏字段)',
    created_by      CHAR(36) COMMENT '创建者ID',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_datasource_user (datasource_id, user_id),
    FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表';

-- 日志表
CREATE TABLE IF NOT EXISTS logs (
    id              CHAR(36) PRIMARY KEY,
    user_id         CHAR(36) COMMENT '用户ID',
    action          VARCHAR(50) NOT NULL COMMENT '操作: login/query/export/share/datasource_edit',
    resource_type   VARCHAR(30) COMMENT '资源类型: user/datasource/query/saved_result',
    resource_id     CHAR(36) COMMENT '资源ID',
    details         JSON COMMENT '详细记录',
    ip_address      VARCHAR(45) COMMENT 'IP地址',
    user_agent      VARCHAR(255) COMMENT '用户代理',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日志表';

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
    id              CHAR(36) PRIMARY KEY,
    config_key      VARCHAR(50) NOT NULL UNIQUE COMMENT '配置键',
    config_value    TEXT COMMENT '配置值',
    description     VARCHAR(255) COMMENT '说明',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置表';

-- 插入初始系统配置
INSERT INTO system_config (id, config_key, config_value, description) VALUES
(UUID(), 'system_name', '数答', '系统名称'),
(UUID(), 'system_logo', '/logo.png', '系统Logo路径'),
(UUID(), 'llm_provider', 'local', '大模型提供商'),
(UUID(), 'llm_model', '', '大模型名称'),
(UUID(), 'llm_base_url', '', '大模型Base URL'),
(UUID(), 'llm_api_key', '', '大模型API Key(加密存储)'),
(UUID(), 'llm_temperature', '0.7', '大模型温度参数'),
(UUID(), 'password_min_length', '8', '密码最小长度'),
(UUID(), 'password_expire_days', '90', '密码过期天数'),
(UUID(), 'session_timeout', '3600', '会话超时时间(秒)')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);

-- 插入默认管理员账号 (密码: admin123)
INSERT INTO users (id, username, password_hash, email, role, status) VALUES
(UUID(), 'admin', '$2b$10$gjXjV/cWzik9tmy78B2Sw.6C0jfO5YnBNHFBjVGito7nsjY/asK5O', 'admin@example.com', 'admin', 'active')
ON DUPLICATE KEY UPDATE username = username;
