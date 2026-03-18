import { query } from '../src/config/database';

async function checkTables() {
  const [rows] = await query('SHOW TABLES');
  console.log('数据库表:');
  (rows as any[]).forEach(r => console.log(' - ' + Object.values(r)[0]));
}

checkTables().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
