/**
 * 初始化数据库表
 * 
 * 运行: npx ts-node scripts/init-db.ts
 */

import dbPool from '../src/config/database';

async function initDatabase() {
  const connection = await dbPool.getConnection();
  
  try {
    console.log('🔧 开始初始化数据库...\n');
    
    // 1. 创建/更新用户表
    console.log('📝 创建 users 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        role ENUM('user', 'analyst', 'admin') DEFAULT 'user',
        status ENUM('active', 'disabled', 'locked') DEFAULT 'active',
        login_failures INT DEFAULT 0,
        locked_until TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'
    `);
    console.log('✅ users 表创建成功\n');
    
    // 修改角色列以支持新角色
    await connection.execute(`
      ALTER TABLE users MODIFY COLUMN role ENUM('user', 'analyst', 'admin') DEFAULT 'user'
    `).catch(() => {});
    
    // 2. 创建角色权限表
    console.log('📝 创建 role_permissions 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id VARCHAR(36) PRIMARY KEY,
        role ENUM('user', 'analyst', 'admin') NOT NULL,
        permission VARCHAR(100) NOT NULL,
        description VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_role_permission (role, permission)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色权限表'
    `);
    console.log('✅ role_permissions 表创建成功\n');
    
    // 3. 创建数据源权限表
    console.log('📝 创建 datasource_permissions 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS datasource_permissions (
        id VARCHAR(36) PRIMARY KEY,
        datasource_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        permission ENUM('read', 'write', 'admin') DEFAULT 'read',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY uk_datasource_user (datasource_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据源权限表'
    `);
    console.log('✅ datasource_permissions 表创建成功\n');
    
    // 4. 创建字段权限表
    console.log('📝 创建 field_permissions 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS field_permissions (
        id VARCHAR(36) PRIMARY KEY,
        datasource_id VARCHAR(36) NOT NULL,
        table_name VARCHAR(100) NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        role ENUM('user', 'analyst', 'admin') NOT NULL,
        can_query BOOLEAN DEFAULT TRUE,
        can_filter BOOLEAN DEFAULT TRUE,
        can_group BOOLEAN DEFAULT TRUE,
        is_masked BOOLEAN DEFAULT FALSE,
        mask_type ENUM('none', 'partial', 'full', 'hash') DEFAULT 'none',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字段权限表'
    `);
    console.log('✅ field_permissions 表创建成功\n');
    
    // 5. 初始化默认角色权限
    console.log('📝 初始化默认角色权限...');
    const defaultPermissions = [
      // user 权限
      ['user', 'query:execute', '执行查询'],
      ['user', 'history:view', '查看自己的历史'],
      ['user', 'history:save', '保存查询历史'],
      ['user', 'export:csv', '导出 CSV'],
      // analyst 权限
      ['analyst', 'query:execute', '执行查询'],
      ['analyst', 'query:advanced', '高级查询'],
      ['analyst', 'history:view', '查看历史'],
      ['analyst', 'history:save', '保存查询历史'],
      ['analyst', 'export:csv', '导出 CSV'],
      ['analyst', 'export:excel', '导出 Excel'],
      ['analyst', 'datasource:view', '查看数据源'],
      // admin 权限
      ['admin', 'query:execute', '执行查询'],
      ['admin', 'query:advanced', '高级查询'],
      ['admin', 'history:view', '查看所有历史'],
      ['admin', 'history:delete', '删除历史'],
      ['admin', 'export:csv', '导出 CSV'],
      ['admin', 'export:excel', '导出 Excel'],
      ['admin', 'datasource:create', '创建数据源'],
      ['admin', 'datasource:edit', '编辑数据源'],
      ['admin', 'datasource:delete', '删除数据源'],
      ['admin', 'user:manage', '用户管理'],
      ['admin', 'permission:manage', '权限管理'],
      ['admin', 'audit:view', '查看审计日志'],
    ];
    
    for (const [role, permission, description] of defaultPermissions) {
      await connection.execute(
        'INSERT IGNORE INTO role_permissions (id, role, permission, description) VALUES (UUID(), ?, ?, ?)',
        [role, permission, description]
      );
    }
    console.log('✅ 默认角色权限初始化成功\n');
    
    // 检查是否有 admin 用户
    const [adminUsers] = await connection.execute('SELECT id FROM users WHERE username = ?', ['admin']);
    
    if ((adminUsers as any[]).length === 0) {
      console.log('📝 创建默认管理员账号...');
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash('admin123', 10);
      const { v4: uuidv4 } = await import('uuid');
      
      await connection.execute(
        'INSERT INTO users (id, username, password_hash, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), 'admin', passwordHash, 'admin@example.com', 'admin', 'active']
      );
      console.log('✅ 默认管理员账号创建成功 (admin / admin123)\n');
    } else {
      console.log('✅ 管理员账号已存在\n');
    }
    
    // 创建数据源表（如果不存在）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS datasources (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        name VARCHAR(100) NOT NULL,
        type ENUM('mysql', 'postgresql', 'clickhouse') DEFAULT 'mysql',
        host VARCHAR(255) NOT NULL,
        port INT DEFAULT 3306,
        database_name VARCHAR(100),
        username VARCHAR(100),
        password_encrypted TEXT,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据源配置表'
    `);
    
    // 创建查询历史表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS query_history (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        datasource_id VARCHAR(36),
        query_text TEXT NOT NULL,
        \`sql\` TEXT,
        result_summary TEXT,
        row_count INT DEFAULT 0,
        execution_time INT DEFAULT 0,
        is_favorite BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='查询历史表'
    `);
    
    // 创建审计日志表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        action VARCHAR(50) NOT NULL,
        resource_type VARCHAR(50),
        resource_id VARCHAR(36),
        details JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计日志表'
    `);
    
    console.log('🎉 数据库初始化完成！');
    
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    throw error;
  } finally {
    connection.release();
    await dbPool.end();
  }
}

initDatabase().catch(console.error);
