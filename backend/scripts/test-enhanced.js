/**
 * 功能增强测试脚本
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// 字段映射
const FIELD_TABLE = {
  'total_amount': 'orders',
  'order_id': 'orders',
  'customer_id': 'customers',
  'customer_type': 'customers',
  'category': 'products',
  'city': 'customers',
  'order_status': 'orders',
};

// NLU（简化版）
function extractEntities(query) {
  const result = {
    metrics: [],
    dimensions: [],
    filters: {},
    groupBy: [],
    orderBy: null,
    limit: 100,
    timeRange: null,
  };
  
  // 指标
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
  
  // 维度
  if (/客户类型/.test(query)) {
    result.dimensions.push({ field: 'customer_type', table: 'customers' });
    if (/按|每个|各/.test(query)) result.groupBy.push('customer_type');
  }
  if (/产品类别|类别/.test(query)) {
    result.dimensions.push({ field: 'category', table: 'products' });
    if (/按|每个|各/.test(query)) result.groupBy.push('category');
  }
  if (/城市/.test(query)) {
    result.dimensions.push({ field: 'city', table: 'customers' });
    if (/按|每个|各/.test(query)) result.groupBy.push('city');
  }
  
  // 筛选条件
  if (/零售/.test(query)) result.filters['customer_type'] = 'RETAIL';
  if (/批发/.test(query)) result.filters['customer_type'] = 'WHOLESALE';
  if (/已完成|完成/.test(query)) result.filters['order_status'] = 'DELIVERED';
  if (/待处理/.test(query)) result.filters['order_status'] = 'PENDING';
  if (/已发货/.test(query)) result.filters['order_status'] = 'SHIPPED';
  
  // 时间范围
  if (/最近7天/.test(query)) {
    result.timeRange = { unit: 'DAY', value: 7, operator: '>=' };
  }
  if (/最近30天/.test(query)) {
    result.timeRange = { unit: 'DAY', value: 30, operator: '>=' };
  }
  if (/本月/.test(query)) {
    result.timeRange = { unit: 'MONTH', value: 1, operator: '>=' };
  }
  if (/本季度/.test(query)) {
    result.timeRange = { unit: 'QUARTER', value: 1, operator: '>=' };
  }
  if (/今年/.test(query)) {
    result.timeRange = { unit: 'YEAR', value: 1, operator: '>=' };
  }
  
  // 排序
  if (/最高|最多|排名前/.test(query)) {
    result.orderBy = { direction: 'DESC' };
  }
  if (/最低|最少/.test(query)) {
    result.orderBy = { direction: 'ASC' };
  }
  
  // LIMIT
  const limitMatch = query.match(/前(\d+)/);
  if (limitMatch) {
    result.limit = parseInt(limitMatch[1]);
  }
  
  return result;
}

// SQL 生成
function generateSQL(entities) {
  const { metrics, groupBy, filters, orderBy, limit, timeRange } = entities;
  
  if (metrics.length === 0) {
    return 'SELECT 1 LIMIT 1';
  }
  
  const metric = metrics[0];
  const agg = metric.aggregation || 'SUM';
  const table = metric.table || 'orders';
  const field = metric.field;
  
  // 检查是否需要 JOIN（筛选条件涉及其他表）
  const filterTables = new Set();
  for (const f of Object.keys(filters)) {
    filterTables.add(FIELD_TABLE[f] || 'orders');
  }
  
  const needsJoin = filterTables.size > 1 || 
    (filterTables.size === 1 && !filterTables.has(table));
  
  // 没有 GROUP BY 且不需要 JOIN
  if (!groupBy || groupBy.length === 0) {
    if (!needsJoin) {
      let sql = `SELECT ${agg}(\`${field}\`) AS \`result\` FROM \`${table}\``;
      
      const whereClauses = [];
      for (const [f, v] of Object.entries(filters)) {
        whereClauses.push(`\`${f}\` = '${v}'`);
      }
      if (timeRange) {
        whereClauses.push(`order_date >= DATE_SUB(CURDATE(), INTERVAL ${timeRange.value} ${timeRange.unit})`);
      }
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      
      sql += ` LIMIT ${limit}`;
      return sql;
    }
    
    // 需要 JOIN（筛选客户类型、账户状态等）
    if (table === 'orders' && filterTables.has('customers')) {
      let sql = `SELECT ${agg}(o.\`${field}\`) AS \`result\` FROM \`orders\` o JOIN \`customers\` c ON o.customer_id = c.customer_id`;
      
      const whereClauses = [];
      for (const [f, v] of Object.entries(filters)) {
        if (FIELD_TABLE[f] === 'customers') {
          whereClauses.push(`c.\`${f}\` = '${v}'`);
        } else {
          whereClauses.push(`o.\`${f}\` = '${v}'`);
        }
      }
      if (timeRange) {
        whereClauses.push(`o.order_date >= DATE_SUB(CURDATE(), INTERVAL ${timeRange.value} ${timeRange.unit})`);
      }
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      
      sql += ` LIMIT ${limit}`;
      return sql;
    }
  }
  
  // 有 GROUP BY
  const groupField = groupBy[0];
  const groupTable = FIELD_TABLE[groupField] || 'orders';
  
  // 产品类别需要通过 order_items 和 products
  if (groupField === 'category') {
    let sql = `SELECT p.\`${groupField}\`, SUM(oi.total) AS \`total\` FROM \`order_items\` oi JOIN \`products\` p ON oi.product_id = p.product_id`;
    
    const whereClauses = [];
    for (const [f, v] of Object.entries(filters)) {
      if (FIELD_TABLE[f] === 'customers') {
        // 需要 JOIN customers
        sql = sql.replace('FROM `order_items`', 'FROM `order_items` oi JOIN `orders` o ON oi.order_id = o.order_id JOIN `customers` c ON o.customer_id = c.customer_id');
        whereClauses.push(`c.\`${f}\` = '${v}'`);
      } else if (FIELD_TABLE[f] === 'orders') {
        sql = sql.replace('FROM `order_items`', 'FROM `order_items` oi JOIN `orders` o ON oi.order_id = o.order_id');
        whereClauses.push(`o.\`${f}\` = '${v}'`);
      }
    }
    
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    sql += ` GROUP BY p.\`${groupField}\``;
    const dir = orderBy?.direction || 'DESC';
    sql += ` ORDER BY \`total\` ${dir}`;
    sql += ` LIMIT ${limit}`;
    return sql;
  }
  
  if (table === groupTable) {
    let sql = `SELECT \`${groupField}\`, ${agg}(\`${field}\`) AS \`total\` FROM \`${table}\``;
    
    const whereClauses = [];
    for (const [f, v] of Object.entries(filters)) {
      if (f !== groupField) {
        whereClauses.push(`\`${f}\` = '${v}'`);
      }
    }
    if (timeRange) {
      whereClauses.push(`order_date >= DATE_SUB(CURDATE(), INTERVAL ${timeRange.value} ${timeRange.unit})`);
    }
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    sql += ` GROUP BY \`${groupField}\``;
    const dir = orderBy?.direction || 'DESC';
    sql += ` ORDER BY \`total\` ${dir}`;
    sql += ` LIMIT ${limit}`;
    return sql;
  }
  
  // 需要 JOIN
  if (table === 'orders' && groupTable === 'customers') {
    let sql = `SELECT c.\`${groupField}\`, ${agg}(o.\`${field}\`) AS \`total\` FROM \`orders\` o JOIN \`customers\` c ON o.customer_id = c.customer_id`;
    
    const whereClauses = [];
    for (const [f, v] of Object.entries(filters)) {
      if (f === groupField || FIELD_TABLE[f] === 'customers') {
        whereClauses.push(`c.\`${f}\` = '${v}'`);
      } else {
        whereClauses.push(`o.\`${f}\` = '${v}'`);
      }
    }
    if (timeRange) {
      whereClauses.push(`o.order_date >= DATE_SUB(CURDATE(), INTERVAL ${timeRange.value} ${timeRange.unit})`);
    }
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    sql += ` GROUP BY c.\`${groupField}\``;
    const dir = orderBy?.direction || 'DESC';
    sql += ` ORDER BY \`total\` ${dir}`;
    sql += ` LIMIT ${limit}`;
    return sql;
  }
  
  if (groupTable === 'customers') {
    let sql = `SELECT \`${groupField}\`, COUNT(*) AS \`count\` FROM \`customers\``;
    
    const whereClauses = [];
    for (const [f, v] of Object.entries(filters)) {
      whereClauses.push(`\`${f}\` = '${v}'`);
    }
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    sql += ` GROUP BY \`${groupField}\``;
    const dir = orderBy?.direction || 'DESC';
    sql += ` ORDER BY \`count\` ${dir}`;
    sql += ` LIMIT ${limit}`;
    return sql;
  }
  
  return `SELECT \`${groupField}\`, ${agg}(\`${field}\`) AS \`total\` FROM \`${table}\` GROUP BY \`${groupField}\` LIMIT ${limit}`;
}

// 主测试
async function main() {
  console.log('========================================');
  console.log('   功能增强测试');
  console.log('========================================\n');
  
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'ai_bi_test',
  });
  
  console.log('✅ 数据库连接成功\n');
  
  const tests = [
    // 基础查询
    { query: '销售额是多少', desc: '简单聚合' },
    { query: '有多少订单', desc: 'COUNT' },
    { query: '平均订单金额', desc: 'AVG' },
    
    // GROUP BY
    { query: '按客户类型统计销售额', desc: 'GROUP BY + JOIN' },
    { query: '各产品类别的销售额对比', desc: 'GROUP BY 产品' },
    { query: '客户数量按城市分组', desc: 'GROUP BY 城市' },
    
    // 多条件筛选
    { query: '零售客户的销售额', desc: '筛选客户类型' },
    { query: '已完成订单的销售额', desc: '筛选订单状态' },
    { query: '零售客户已完成订单的销售额', desc: '多条件筛选' },
    
    // 时间范围
    { query: '最近7天的销售额', desc: '时间范围 7天' },
    { query: '最近30天的订单数', desc: '时间范围 30天' },
    { query: '本月的销售额', desc: '时间范围 本月' },
    
    // 排序
    { query: '销售额最高的前5个城市', desc: '排序 + LIMIT' },
    { query: '订单数最少的客户类型', desc: '升序排序' },
    
    // 组合
    { query: '零售客户最近30天的销售额', desc: '筛选 + 时间' },
    { query: '已完成订单按城市分组的销售额', desc: '筛选 + GROUP BY' },
  ];
  
  let success = 0;
  let total = tests.length;
  
  for (const test of tests) {
    console.log(`\n📝 ${test.desc}: "${test.query}"`);
    
    try {
      const entities = extractEntities(test.query);
      const sql = generateSQL(entities);
      console.log(`   SQL: ${sql}`);
      
      const [rows] = await db.query(sql);
      console.log(`   ✅ 成功: ${rows.length} 行`);
      
      if (rows.length > 0) {
        console.log(`   数据: ${JSON.stringify(rows[0])}`);
        success++;
      }
    } catch (error) {
      console.log(`   ❌ 失败: ${error.message}`);
    }
  }
  
  await db.end();
  
  console.log('\n========================================');
  console.log(`   结果: ${success}/${total} 成功`);
  console.log('========================================');
}

main().catch(console.error);
