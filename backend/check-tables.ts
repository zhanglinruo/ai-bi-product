const { query } = require('./src/config/database');

async function check() {
  const tables = await query('SHOW TABLES LIKE "semantic_%"');
  console.log('Tables:', JSON.stringify(tables, null, 2));
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
