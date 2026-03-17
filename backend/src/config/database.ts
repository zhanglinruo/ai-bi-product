import { createPool, Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool: Pool = createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shuda',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

export async function query<T extends RowDataPacket[]>(sql: string, params?: any[]): Promise<T> {
  const [rows] = await pool.query<T>(sql, params);
  return rows;
}

export async function execute(sql: string, params?: any[]): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return result;
}

export async function getConnection() {
  return pool.getConnection();
}

export default pool;
