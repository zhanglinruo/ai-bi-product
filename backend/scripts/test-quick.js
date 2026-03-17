/**
 * 快速验证测试
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { QianfanLLMClient } = require('./qianfan-client');

// 简化的 Agent
class QuickNLU {
  constructor(llm) { this.llm = llm; }
  
  async execute(query) {
    console.log('\n[NLU] 分析...');
    
    const result = { intent: 'query', metrics: [], dimensions: [], groupBy: [] };
    
    // 关键词匹配
    if (/销售额|销售金额/.test(query)) {
      result.metrics.push({ field: 'total_amount', table: 'orders', aggregation: 'SUM' });
    }
    if (/订单数|有多少订单/.test(query)) {
      result.metrics.push({ field: 'order_id', table: 'orders', aggregation: 'COUNT' });
    }
    if (/客户数|客户数量/.test(query)) {
      result.metrics.push({ field: 'customer_id', table: 'customers', aggregation: 'COUNT' });
    }
    if (/平均.*订单|客单价|平均.*金额/.test(query)) {
      result.metrics.push({ field: 'total_amount', table: 'orders', aggregation: 'AVG' });
    }
    if (/平均/.test(query) && result.metrics.length > 0) {
      result.metrics[result.metrics.length - 1].aggregation = 'AVG';
    }
    if (/客户类型/.test(query)) {
      result.dimensions.push({ field: 'customer_type', table: 'customers' });
      result.groupBy.push('customer_type');
    }
    if (/产品类别|类别/.test(query)) {
      result.dimensions.push({ field: 'category', table: 'products' });
      result.groupBy.push('category');
    }
    if (/城市/.test(query)) {
      result.dimensions.push({ field: 'city', table: 'customers' });
      result.groupBy.push('city');
    }
    
    return result;
  }
}

class QuickSQLGen {
  generate(entities) {
    const { metrics, groupBy } = entities;
    
    if (metrics.length === 0) return 'SELECT 1 LIMIT 1';
    
    const metric = metrics[0];
    const agg = metric.aggregation || 'SUM';
    const table = metric.table || 'orders';
    const field = metric.field || 'total_amount';
    
    // 没有 GROUP BY
    if (!groupBy || groupBy.length === 0) {
      return `SELECT ${agg}(\`${field}\`) AS \`result\` FROM \`${table}\` LIMIT 100`;
    }
    
    // 有 GROUP BY
    const groupField = groupBy[0];
    const groupTable = this.getGroupTable(groupField);
    
    if (table === groupTable) {
      return `SELECT \`${groupField}\`, ${agg}(\`${field}\`) AS \`total\` FROM \`${table}\` GROUP BY \`${groupField}\` ORDER BY \`total\` DESC LIMIT 100`;
    }
    
    // 需要 JOIN
    if (table === 'orders' && groupTable === 'customers') {
      return `SELECT c.\`${groupField}\`, ${agg}(o.\`${field}\`) AS \`total\` FROM \`orders\` o JOIN \`customers\` c ON o.customer_id = c.customer_id GROUP BY c.\`${groupField}\` ORDER BY \`total\` DESC LIMIT 100`;
    }
    
    if (table === 'orders' && groupTable === 'products') {
      return `SELECT p.\`${groupField}\`, SUM(oi.total) AS \`total\` FROM \`order_items\` oi JOIN \`products\` p ON oi.product_id = p.product_id GROUP BY p.\`${groupField}\` ORDER BY \`total\` DESC LIMIT 100`;
    }
    
    if (groupTable === 'customers') {
      return `SELECT \`${groupField}\`, COUNT(*) AS \`count\` FROM \`customers\` GROUP BY \`${groupField}\` ORDER BY \`count\` DESC LIMIT 100`;
    }
    
    return `SELECT \`${groupField}\`, ${agg}(\`${field}\`) AS \`total\` FROM \`${table}\` GROUP BY \`${groupField}\` LIMIT 100`;
  }
  
  getGroupTable(field) {
    const mapping = {
      'customer_type': 'customers',
      'category': 'products',
      'city': 'customers',
      'country': 'customers',
    };
    return mapping[field] || 'orders';
  }
}

async function main() {
  console.log('========================================');
  console.log('   快速验证测试');
  console.log('========================================\n');
  
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'ai_bi_test',
  });
  
  console.log('✅ 数据库连接成功');
  
  const llm = new QianfanLLMClient({
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  });
  
  const nlu = new QuickNLU(llm);
  const sqlGen = new QuickSQLGen();
  
  const tests = [
    '销售额是多少',
    '有多少订单',
    '平均订单金额',
    '按客户类型统计销售额',
    '各产品类别的销售额对比',
    '客户数量按城市分组',
  ];
  
  let successCount = 0;
  
  for (const query of tests) {
    console.log(`\n📝 ${query}`);
    
    try {
      // NLU
      const entities = await nlu.execute(query);
      
      // SQL
      const sql = sqlGen.generate(entities);
      console.log(`   SQL: ${sql}`);
      
      // 执行
      const [rows] = await db.query(sql);
      console.log(`   结果: ${rows.length} 行`);
      
      if (rows.length > 0) {
        console.log(`   数据: ${JSON.stringify(rows.slice(0, 2))}`);
        successCount++;
      }
    } catch (error) {
      console.log(`   ❌ 错误: ${error.message}`);
    }
  }
  
  await db.end();
  
  console.log('\n========================================');
  console.log(`✅ 成功: ${successCount}/${tests.length}`);
  console.log('========================================');
}

main().catch(console.error);
