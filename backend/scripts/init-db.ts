import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const sql = fs.readFileSync('./database/init.sql', 'utf-8');

async function initDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });

  try {
    await connection.query(sql);
    console.log('✅ 数据库初始化成功！');
  } catch (error: any) {
    console.error('❌ 数据库初始化失败:', error.message);
  } finally {
    await connection.end();
  }
}

initDatabase();
