import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function updateTable() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    await connection.query(`
      ALTER TABLE query_history 
      ADD COLUMN sql_query TEXT COMMENT '生成的SQL语句' AFTER question
    `);
    console.log('✅ 表结构更新成功！');
  } catch (error: any) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('sql_query 字段已存在');
    } else {
      console.error('更新失败:', error.message);
    }
  } finally {
    await connection.end();
  }
}

updateTable();
