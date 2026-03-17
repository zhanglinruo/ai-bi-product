import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkAdmin() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [rows] = await connection.query('SELECT id, username, role, status FROM users');
    console.log('用户列表:', JSON.stringify(rows, null, 2));
  } catch (error: any) {
    console.error('查询失败:', error.message);
  } finally {
    await connection.end();
  }
}

checkAdmin();
