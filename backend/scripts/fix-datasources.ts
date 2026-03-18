import { query } from '../src/config/database';

async function fixDatasources() {
  const columns = [
    'user_id VARCHAR(36)',
    'password_encrypted TEXT',
    'username VARCHAR(100)',
    'database_name VARCHAR(100)'
  ];

  for (const col of columns) {
    const colName = col.split(' ')[0];
    try {
      await query(`ALTER TABLE datasources ADD COLUMN ${col}`);
      console.log(`✅ 添加列: ${colName}`);
    } catch(e: any) {
      if (e.message.includes('Duplicate')) {
        console.log(`ℹ️  列已存在: ${colName}`);
      }
    }
  }

  console.log('\n✅ datasources 表修复完成');
}

fixDatasources().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
