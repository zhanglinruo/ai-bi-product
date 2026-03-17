import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkTable() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [columns] = await connection.query('SHOW COLUMNS FROM t_ai_medical_product_records');
    console.log('表结构:');
    console.log(JSON.stringify(columns, null, 2));

    const [count] = await connection.query('SELECT COUNT(*) as total FROM t_ai_medical_product_records');
    console.log('\n数据量:', JSON.stringify(count, null, 2));

    const [sample] = await connection.query('SELECT * FROM t_ai_medical_product_records LIMIT 3');
    console.log('\n示例数据:');
    console.log(JSON.stringify(sample, null, 2));
  } finally {
    await connection.end();
  }
}

checkTable();
