import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function resetAdminPassword() {
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);
  console.log('密码哈希:', hash);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    await connection.query(
      'UPDATE users SET password_hash = ? WHERE username = ?',
      [hash, 'admin']
    );
    console.log('✅ 密码重置成功！');
    
    const [rows]: any = await connection.query('SELECT username, password_hash FROM users WHERE username = ?', ['admin']);
    console.log('更新后的密码哈希:', rows[0].password_hash);
    
    const isValid = await bcrypt.compare('admin123', rows[0].password_hash);
    console.log('密码验证:', isValid ? '✅ 正确' : '❌ 错误');
  } catch (error: any) {
    console.error('重置失败:', error.message);
  } finally {
    await connection.end();
  }
}

resetAdminPassword();
