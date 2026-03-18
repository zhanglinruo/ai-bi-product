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
    
    // 创建用户表
    console.log('📝 创建 users 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        role ENUM('user', 'admin') DEFAULT 'user',
        status ENUM('active', 'disabled') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'
    `);
    console.log('✅ users 表创建成功\n');
    
    // 检查是否有 admin 用户
    const [adminUsers] = await connection.execute('SELECT id FROM users WHERE username = ?', ['admin']);
    
    if ((adminUsers as any[]).length === 0) {
      console.log('📝 创建默认管理员账号...');
      // 密码: admin123 (bcrypt hash)
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
    
    // 创建数据源表
    console.log('📝 创建 datasources 表...');
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
    console.log('✅ datasources 表创建成功\n');
    
    // 创建查询历史表
    console.log('📝 创建 query_history 表...');
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
    console.log('✅ query_history 表创建成功\n');
    
    // 创建审计日志表
    console.log('📝 创建 audit_logs 表...');
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
    console.log('✅ audit_logs 表创建成功\n');
    
    console.log('🎉 数据库初始化完成！');
    
    // 显示所有表
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('\n📊 当前数据库表:');
    for (const table of tables as any[]) {
      const tableName = Object.values(table)[0];
      console.log(`   - ${tableName}`);
    }
    
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    throw error;
  } finally {
    connection.release();
    await dbPool.end();
  }
}

initDatabase().catch(console.error);
