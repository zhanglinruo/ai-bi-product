/**
 * 修复用户表结构
 */

import dbPool from '../src/config/database';

async function fixUsersTable() {
  const connection = await dbPool.getConnection();
  
  try {
    console.log('🔧 修复用户表结构...\n');
    
    // 添加缺失的列
    await connection.execute('ALTER TABLE users ADD COLUMN login_failures INT DEFAULT 0').catch(() => {});
    await connection.execute('ALTER TABLE users ADD COLUMN locked_until TIMESTAMP NULL').catch(() => {});
    
    console.log('✅ 用户表修复成功');
    
    // 显示表结构
    const [columns] = await connection.execute('DESCRIBE users');
    console.log('\n📋 当前表结构:');
    for (const col of columns as any[]) {
      console.log(`   - ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    }
    
  } catch (error) {
    console.error('❌ 修复失败:', error);
  } finally {
    connection.release();
    await dbPool.end();
  }
}

fixUsersTable();
