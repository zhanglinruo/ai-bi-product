/**
 * 数据库连接和语义层配置脚本
 */

const mysql = require('mysql2/promise');

async function main() {
  // 连接数据库
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'ai_bi_test'
  });
  
  console.log('✅ 数据库连接成功\n');
  
  // 获取所有表
  const [tables] = await connection.query('SHOW TABLES');
  console.log('📋 数据库表列表:');
  console.log(JSON.stringify(tables, null, 2));
  
  // 获取每个表的结构
  for (const table of tables) {
    const tableName = Object.values(table)[0];
    console.log(`\n📊 表: ${tableName}`);
    console.log('-'.repeat(50));
    
    // 获取表结构
    const [columns] = await connection.query(`DESCRIBE \`${tableName}\``);
    console.log('字段结构:');
    console.log(JSON.stringify(columns, null, 2));
    
    // 获取前 3 条数据样本
    const [rows] = await connection.query(`SELECT * FROM \`${tableName}\` LIMIT 3`);
    console.log('\n数据样本:');
    console.log(JSON.stringify(rows, null, 2));
    
    // 获取记录数
    const [count] = await connection.query(`SELECT COUNT(*) as total FROM \`${tableName}\``);
    console.log(`\n总记录数: ${count[0].total}`);
  }
  
  await connection.end();
}

main().catch(console.error);
