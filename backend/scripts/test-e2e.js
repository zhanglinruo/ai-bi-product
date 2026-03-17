/**
 * 完整的端到端测试脚本
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// 导入 Agent 组件
const { QianfanLLMClient } = require('./qianfan-client');

// 语义层配置（内联）
const semanticConfig = {
  metrics: [
    { id: 'metric_sales', name: '销售额', dbField: 'total_amount', dbTable: 'orders', aggregation: 'SUM' },
    { id: 'metric_order_count', name: '订单数量', dbField: 'order_id', dbTable: 'orders', aggregation: 'COUNT' },
    { id: 'metric_customer_count', name: '客户数量', dbField: 'customer_id', dbTable: 'customers', aggregation: 'COUNT' },
  ],
  dimensions: [
    { id: 'dim_customer_type', name: '客户类型', dbField: 'customer_type', dbTable: 'customers' },
    { id: 'dim_category', name: '产品类别', dbField: 'category', dbTable: 'products' },
    { id: 'dim_city', name: '城市', dbField: 'city', dbTable: 'customers' },
  ],
};

// Agent 实现（简化版）
class SimpleNLUBAgent {
  constructor(llm) { this.llm = llm; }
  
  async execute(input, context) {
    const query = input.query || input;
    console.log('\n[NLU Agent] 分析用户意图...');
    
    const systemPrompt = `分析用户的数据查询问题，提取以下信息：
1. 意图类型：query, analysis, comparison, trend
2. 指标：用户想查询的数值（如销售额、订单数）
3. 维度：分组或筛选的字段（如地区、时间）
4. groupBy：如果用户说"按...分组"、"各..."，列出分组字段

返回 JSON: {"intent": "...", "metrics": [...], "dimensions": [...], "groupBy": [...]}

数据库表：
- orders: 订单表（total_amount, order_date, order_status）
- customers: 客户表（customer_type, city, country）
- products: 产品表（category, unit_price）`;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        temperature: 0.3,
      });
      
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log(`[NLU Agent] 意图: ${result.intent}`);
        console.log(`[NLU Agent] 指标: ${JSON.stringify(result.metrics)}`);
        console.log(`[NLU Agent] 维度: ${JSON.stringify(result.dimensions)}`);
        console.log(`[NLU Agent] 分组: ${JSON.stringify(result.groupBy || [])}`);
        return { success: true, data: result };
      }
    } catch (error) {
      console.error(`[NLU Agent] 失败: ${error.message}`);
    }
    
    // 降级
    return this.fallback(query);
  }
  
  fallback(query) {
    const result = { intent: 'query', metrics: [], dimensions: [], groupBy: [] };
    
    if (/销售额|销售金额/.test(query)) {
      result.metrics.push({ field: 'total_amount', table: 'orders', aggregation: 'SUM' });
    }
    if (/订单数|有多少订单/.test(query)) {
      result.metrics.push({ field: 'order_id', table: 'orders', aggregation: 'COUNT' });
    }
    if (/客户数|客户数量/.test(query)) {
      result.metrics.push({ field: 'customer_id', table: 'customers', aggregation: 'COUNT' });
    }
    if (/平均/.test(query)) {
      result.metrics[result.metrics.length - 1] = {
        ...result.metrics[result.metrics.length - 1],
        aggregation: 'AVG'
      };
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
    
    console.log(`[NLU Agent] 降级结果: ${JSON.stringify(result)}`);
    return { success: true, data: result };
  }
}

class SimpleSQLGenerator {
  constructor(llm) { this.llm = llm; }
  
  async execute(input, context) {
    console.log('\n[SQL Generator] 生成 SQL...');
    
    const entities = input.entities || input;
    const metrics = entities.metrics || [];
    const groupBy = entities.groupBy || [];
    
    // 如果有 groupBy，使用 LLM 生成复杂 SQL
    if (groupBy.length > 0) {
      return this.generateComplexSQL(entities);
    }
    
    // 简单 SQL 模板
    if (metrics.length > 0) {
      const metric = metrics[0];
      const agg = metric.aggregation || 'SUM';
      const table = metric.table || 'orders';
      const field = metric.field || 'total_amount';
      
      let sql = '';
      const alias = agg.toLowerCase();
      
      if (agg === 'COUNT') {
        sql = `SELECT COUNT(\`${field}\`) AS \`${alias}\` FROM \`${table}\` LIMIT 100`;
      } else if (agg === 'AVG') {
        sql = `SELECT AVG(\`${field}\`) AS \`${alias}\` FROM \`${table}\` LIMIT 100`;
      } else if (agg === 'MAX') {
        sql = `SELECT MAX(\`${field}\`) AS \`${alias}\` FROM \`${table}\` LIMIT 100`;
      } else if (agg === 'MIN') {
        sql = `SELECT MIN(\`${field}\`) AS \`${alias}\` FROM \`${table}\` LIMIT 100`;
      } else {
        sql = `SELECT SUM(\`${field}\`) AS \`${alias}\` FROM \`${table}\` LIMIT 100`;
      }
      
      console.log(`[SQL Generator] SQL: ${sql}`);
      return { success: true, data: { sql } };
    }
    
    return { success: false, error: { message: '无法生成 SQL' } };
  }
  
  async generateComplexSQL(entities) {
    const { metrics, dimensions, groupBy } = entities;
    
    // 字段名映射（中文到英文）
    const fieldMapping = {
      '客户类型': 'customer_type',
      '产品类别': 'category',
      '城市': 'city',
      '国家': 'country',
      '订单状态': 'order_status',
      '销售额': 'total_amount',
      '订单数': 'order_id',
      '客户数量': 'customer_id',
    };
    
    // 表名映射
    const tableMapping = {
      'customer_type': 'customers',
      'category': 'products',
      'city': 'customers',
      'country': 'customers',
      'order_status': 'orders',
      'total_amount': 'orders',
      'order_id': 'orders',
      'customer_id': 'customers',
    };
    
    // 获取指标
    const metric = metrics?.[0] || { field: 'total_amount', aggregation: 'SUM' };
    const metricField = fieldMapping[metric.field] || metric.field || 'total_amount';
    const metricAgg = metric.aggregation || 'SUM';
    const metricTable = metric.table || tableMapping[metricField] || 'orders';
    
    // 获取分组字段
    const groupField = fieldMapping[groupBy?.[0]] || groupBy?.[0] || 'customer_type';
    const groupTable = tableMapping[groupField] || 'customers';
    
    // 构建 SQL
    let sql = '';
    
    // 如果指标表和分组表不同，需要 JOIN
    if (metricTable !== groupTable) {
      // 简化：假设通过 customer_id 关联
      if (metricTable === 'orders' && groupTable === 'customers') {
        sql = `SELECT c.\`${groupField}\`, ${metricAgg}(o.\`${metricField}\`) AS \`total\` FROM \`orders\` o JOIN \`customers\` c ON o.customer_id = c.customer_id GROUP BY c.\`${groupField}\` LIMIT 100`;
      } else if (metricTable === 'orders' && groupTable === 'products') {
        sql = `SELECT p.\`${groupField}\`, ${metricAgg}(o.\`${metricField}\`) AS \`total\` FROM \`order_items\` oi JOIN \`orders\` o ON oi.order_id = o.order_id JOIN \`products\` p ON oi.product_id = p.product_id GROUP BY p.\`${groupField}\` LIMIT 100`;
      } else {
        // 降级：简单 GROUP BY
        sql = `SELECT \`${groupField}\`, ${metricAgg}(\`${metricField}\`) AS \`total\` FROM \`${metricTable}\` GROUP BY \`${groupField}\` LIMIT 100`;
      }
    } else {
      // 同一张表，直接 GROUP BY
      sql = `SELECT \`${groupField}\`, ${metricAgg}(\`${metricField}\`) AS \`total\` FROM \`${metricTable}\` GROUP BY \`${groupField}\` LIMIT 100`;
    }
    
    console.log(`[SQL Generator] SQL: ${sql}`);
    return { success: true, data: { sql } };
  }
}

class SimpleExecutor {
  constructor(db) { this.db = db; }
  
  async execute(input, context) {
    console.log('\n[Executor] 执行查询...');
    const sql = input.sql;
    
    try {
      const [rows] = await this.db.query(sql);
      console.log(`[Executor] 成功，返回 ${rows.length} 条数据`);
      return { success: true, data: { success: true, data: rows, rowCount: rows.length } };
    } catch (error) {
      console.error(`[Executor] 失败: ${error.message}`);
      return { success: true, data: { success: false, data: [], error: error.message } };
    }
  }
}

class SimpleInsight {
  constructor(llm) { this.llm = llm; }
  
  async execute(input, context) {
    console.log('\n[Insight] 生成洞察...');
    const { data, query } = input;
    
    if (!data || data.length === 0) {
      return { success: true, data: { summary: '查询结果为空' } };
    }
    
    const systemPrompt = `分析数据并生成简洁的业务洞察。
数据: ${JSON.stringify(data.slice(0, 5))}
问题: ${query}
返回 JSON: {"summary": "一句话总结", "insights": [{"title": "...", "description": "..."}]}`;

    try {
      const response = await this.llm.chat({
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.5,
      });
      
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log(`[Insight] 摘要: ${result.summary}`);
        return { success: true, data: result };
      }
    } catch (error) {
      console.error(`[Insight] 失败: ${error.message}`);
    }
    
    // 降级
    const firstRow = data[0];
    const keys = Object.keys(firstRow);
    const value = firstRow[keys[1] || keys[0]];
    const summary = typeof value === 'number' ? `总计: ${value.toLocaleString()}` : `查询到 ${data.length} 条数据`;
    console.log(`[Insight] 降级摘要: ${summary}`);
    return { success: true, data: { summary } };
  }
}

// 主测试
async function main() {
  console.log('========================================');
  console.log('   完整端到端测试');
  console.log('========================================\n');
  
  // 配置
  const llmConfig = {
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
    temperature: 0.3,
  };
  
  if (!llmConfig.apiKey) {
    console.log('❌ 请配置 LLM_API_KEY');
    return;
  }
  
  console.log(`✅ LLM: ${llmConfig.baseUrl} / ${llmConfig.model}`);
  
  // 连接数据库
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'ai_bi_test',
  });
  
  console.log('✅ 数据库连接成功\n');
  
  // 创建 Agent
  const llm = new QianfanLLMClient(llmConfig);
  const nlu = new SimpleNLUBAgent(llm);
  const sqlGen = new SimpleSQLGenerator(llm);
  const executor = new SimpleExecutor(db);
  const insight = new SimpleInsight(llm);
  
  // 测试用例
  const tests = [
    { query: '销售额是多少', desc: '简单聚合查询' },
    { query: '有多少订单', desc: 'COUNT 查询' },
    { query: '平均订单金额', desc: 'AVG 查询' },
    { query: '按客户类型统计销售额', desc: 'GROUP BY 查询' },
    { query: '各产品类别的销售额对比', desc: '多维度 GROUP BY' },
    { query: '客户数量按城市分组', desc: '客户维度查询' },
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log('\n========================================');
    console.log(`📝 ${test.desc}: "${test.query}"`);
    console.log('========================================');
    
    const startTime = Date.now();
    
    try {
      // 1. NLU
      const nluResult = await nlu.execute({ query: test.query }, {});
      
      // 2. SQL Generator
      const sqlResult = await sqlGen.execute({ entities: nluResult.data }, {});
      
      if (!sqlResult.success) {
        console.log(`❌ SQL 生成失败`);
        results.push({ query: test.query, success: false, error: 'SQL生成失败' });
        continue;
      }
      
      // 3. Executor
      const execResult = await executor.execute({ sql: sqlResult.data.sql }, {});
      
      if (!execResult.data.success) {
        console.log(`❌ 执行失败: ${execResult.data.error}`);
        results.push({ query: test.query, success: false, error: execResult.data.error });
        continue;
      }
      
      // 4. Insight
      const insightResult = await insight.execute({
        data: execResult.data.data,
        query: test.query,
      }, {});
      
      const totalTime = Date.now() - startTime;
      
      console.log('\n📊 结果:');
      console.log(`   SQL: ${sqlResult.data.sql}`);
      console.log(`   数据: ${JSON.stringify(execResult.data.data.slice(0, 3))}`);
      console.log(`   摘要: ${insightResult.data.summary}`);
      console.log(`   耗时: ${totalTime}ms`);
      
      results.push({
        query: test.query,
        success: true,
        sql: sqlResult.data.sql,
        rowCount: execResult.data.rowCount,
        summary: insightResult.data.summary,
        time: totalTime,
      });
      
    } catch (error) {
      console.error(`❌ 错误: ${error.message}`);
      results.push({ query: test.query, success: false, error: error.message });
    }
  }
  
  await db.end();
  
  // 汇总报告
  console.log('\n========================================');
  console.log('   测试报告');
  console.log('========================================\n');
  
  const successCount = results.filter(r => r.success).length;
  console.log(`总计: ${results.length} 个测试`);
  console.log(`成功: ${successCount} 个`);
  console.log(`失败: ${results.length - successCount} 个\n`);
  
  console.log('详细结果:');
  results.forEach((r, i) => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${i + 1}. ${r.query}`);
    if (r.success) {
      console.log(`   SQL: ${r.sql}`);
      console.log(`   行数: ${r.rowCount}, 耗时: ${r.time}ms`);
    } else {
      console.log(`   错误: ${r.error}`);
    }
  });
}

main().catch(console.error);
