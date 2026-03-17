const { query } = require('./src/config/database');

async function test() {
  const results = await query(
    'SELECT DISTINCT corporate_group FROM t_ai_medical_product_records WHERE corporate_group LIKE "%莱%" OR corporate_group LIKE "%集团%"'
  ) as any[];
  console.log('Results with 莱 or 集团:', JSON.stringify(results, null, 2));
}

test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
