/**
 * Agent 架构测试脚本 (纯 JavaScript)
 * 
 * 测试完整的查询流程
 */

const mysql = require('mysql2/promise');

// 语义层配置（简化版）
const semanticConfig = {
  metrics: [
    { id: 'metric_sales', name: '销售额', dbField: 'total_amount', dbTable: 'orders', aggregation: 'SUM' },
    { id: 'metric_order_count', name: '订单数量', dbField: 'order_id', dbTable: 'orders', aggregation: 'COUNT' },
    { id: 'metric_customer_count', name: '客户数量', dbField: 'customer_id', dbTable: 'customers', aggregation: 'COUNT' },
    { id: 'metric_avg_order', name: '平均订单金额', dbField: 'total_amount', dbTable: 'orders', aggregation: 'AVG' },
  ],
};

// 简化的 LLM 客户端（模拟）
class MockLLMClient {
  async chat(params) {
    const { messages } = params;
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage.content.includes('自然语言理解') || lastMessage.content.includes('意图')) {
      return { content: JSON.stringify({ intent: 'query', confidence: 0.9, entities: {} }) };
    }
    if (lastMessage.content.includes('SQL') || lastMessage.content.includes('sql')) {
      return { content: 'SELECT SUM(total_amount) as total_sales FROM orders LIMIT 100' };
    }
    return { content: '{}' };
  }
}

// NLU Agent
class SimpleNLUBAgent {
  constructor(llm) { this.llm = llm; }
  
  async execute(query, context) {
    console.log('\n[NLU Agent] 分析用户意图...');
    
    const entities = { metrics: [], dimensions: [], filters: {} };
    let intent = 'query';
    
    // 指标匹配
    const metricPatterns = [
      { pattern: /销售额?|销售金额|销售总额/, field: 'total_amount', table: 'orders' },
      { pattern: /订单|有多少/, field: 'order_id', table: 'orders', agg: 'COUNT' },
      { pattern: /客户数|客户总数/, field: 'customer_id', table: 'customers', agg: 'COUNT' },
      { pattern: /产品数|商品数/, field: 'product_id', table: 'products', agg: 'COUNT' },
      { pattern: /平均.*金额|客单价/, field: 'total_amount', table: 'orders', agg: 'AVG' },
    ];
    
    for (const p of metricPatterns) {
      if (p.pattern.test(query)) {
        entities.metrics.push({ field: p.field, table: p.table, aggregation: p.agg || 'SUM' });
      }
    }
    
    // 维度匹配
    const dimensionPatterns = [
      { pattern: /客户类型|客户类别/, field: 'customer_type', table: 'customers' },
      { pattern: /产品类别|产品分类|类别/, field: 'category', table: 'products' },
      { pattern: /城市/, field: 'city', table: 'customers' },
      { pattern: /订单状态/, field: 'order_status', table: 'orders' },
    ];
    
    for (const p of dimensionPatterns) {
      if (p.pattern.test(query)) {
        entities.dimensions.push({ field: p.field, table: p.table });
      }
    }
    
    console.log(`[NLU Agent] 意图: ${intent}`);
    console.log(`[NLU Agent] 指标: ${JSON.stringify(entities.metrics)}`);
    
    return { success: true, data: { intent, confidence: 0.85, entities } };
  }
}

// Semantic Agent
class SimpleSemanticAgent {
  constructor(config) { this.config = config; }
  
  async execute(input, context) {
    console.log('\n[Semantic Agent] 映射字段...');
    
    const entities = input.entities;
    const mappedFields = [];
    
    for (const metric of entities.metrics || []) {
      const semantic = this.config.metrics.find(m => 
        m.dbField === metric.field && m.dbTable === metric.table
      );
      
      mappedFields.push({
        userTerm: semantic ? semantic.name : metric.field,
        dbField: metric.field,
        dbTable: metric.table,
        fieldType: 'metric',
        aggregation: metric.aggregation || (semantic ? semantic.aggregation : 'SUM'),
      });
    }
    
    console.log(`[Semantic Agent] 映射结果: ${JSON.stringify(mappedFields)}`);
    
    return { success: true, data: { mappedFields, availableTables: [...new Set(mappedFields.map(f => f.dbTable))] } };
  }
}

// SQL Generator Agent
class SimpleSQLGeneratorAgent {
  constructor(llm) { this.llm = llm; }
  
  async execute(input, context) {
    console.log('\n[SQL Generator Agent] 生成 SQL...');
    
    const mappedFields = input.mappedFields;
    
    if (!mappedFields || mappedFields.length === 0) {
      return { success: false, error: { code: 'NO_METRICS', message: '没有找到指标' } };
    }
    
    const field = mappedFields[0];
    const agg = field.aggregation || 'SUM';
    const table = field.dbTable;
    const dbField = field.dbField;
    
    let sql = '';
    if (agg === 'COUNT') {
      sql = `SELECT COUNT(\`${dbField}\`) as \`${field.userTerm}\` FROM \`${table}\``;
    } else if (agg === 'AVG') {
      sql = `SELECT AVG(\`${dbField}\`) as \`${field.userTerm}\` FROM \`${table}\``;
    } else {
      sql = `SELECT SUM(\`${dbField}\`) as \`${field.userTerm}\` FROM \`${table}\``;
    }
    
    sql += ' LIMIT 100';
    console.log(`[SQL Generator Agent] SQL: ${sql}`);
    
    return { success: true, data: { sql, explanation: `查询 ${table} 表的 ${field.userTerm}` } };
  }
}

// Validator Agent
class SimpleValidatorAgent {
  async execute(input, context) {
    console.log('\n[Validator Agent] 校验 SQL...');
    
    const sql = input.sql;
    const errors = [];
    const warnings = [];
    
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      errors.push({ type: 'syntax_error', message: '只允许 SELECT 查询', severity: 'critical' });
    }
    
    const dangerousWords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE'];
    for (const word of dangerousWords) {
      if (sql.toUpperCase().includes(word)) {
        errors.push({ type: 'sql_injection', message: `包含危险关键词: ${word}`, severity: 'critical' });
      }
    }
    
    console.log(`[Validator Agent] 校验结果: ${errors.length === 0 ? '通过' : '失败'}`);
    
    return { success: true, data: { isValid: errors.length === 0, errors, warnings } };
  }
}

// Executor Agent
class SimpleExecutorAgent {
  constructor(db) { this.db = db; }
  
  async execute(input, context) {
    console.log('\n[Executor Agent] 执行查询...');
    
    const sql = input.sql;
    const startTime = Date.now();
    
    try {
      const [rows] = await this.db.query(sql);
      const executionTime = Date.now() - startTime;
      
      console.log(`[Executor Agent] 查询成功，返回 ${rows.length} 条数据`);
      console.log(`[Executor Agent] 执行时间: ${executionTime}ms`);
      
      return { success: true, data: { success: true, data: rows, rowCount: rows.length, executionTime } };
    } catch (error) {
      console.error(`[Executor Agent] 查询失败: ${error.message}`);
      return { success: true, data: { success: false, data: [], rowCount: 0, error: error.message } };
    }
  }
}

// Insight Agent
class SimpleInsightAgent {
  constructor(llm) { this.llm = llm; }
  
  async execute(input, context) {
    console.log('\n[Insight Agent] 生成洞察...');
    
    const data = input.data;
    
    if (!data || data.length === 0) {
      return { success: true, data: { summary: '查询结果为空', insights: [], recommendations: [] } };
    }
    
    const firstRow = data[0];
    const keys = Object.keys(firstRow);
    const value = firstRow[keys[0]];
    
    let summary = '';
    if (typeof value === 'number') {
      if (value > 1000000) {
        summary = `总计约 ${(value / 1000000).toFixed(2)} 百万`;
      } else if (value > 1000) {
        summary = `总计约 ${(value / 1000).toFixed(2)} 千`;
      } else {
        summary = `总计 ${value.toFixed(2)}`;
      }
    } else {
      summary = `查询到 ${data.length} 条数据`;
    }
    
    console.log(`[Insight Agent] 摘要: ${summary}`);
    
    return { success: true, data: { summary, insights: [{ type: 'summary', title: '数据摘要', description: summary }], recommendations: [] } };
  }
}

// Visualization Agent
class SimpleVisualizationAgent {
  async execute(input, context) {
    console.log('\n[Visualization Agent] 生成可视化...');
    
    const data = input.data;
    let chartType = 'card';
    let chartConfig = {};
    
    if (data && data.length === 1) {
      chartType = 'card';
      const firstRow = data[0];
      const keys = Object.keys(firstRow);
      chartConfig = { metrics: keys.map(k => ({ name: k, value: firstRow[k] })) };
    }
    
    console.log(`[Visualization Agent] 推荐图表: ${chartType}`);
    
    return { success: true, data: { chartType, chartConfig, explanation: `推荐使用${chartType}图表展示` } };
  }
}

// 主测试函数
async function main() {
  console.log('========================================');
  console.log('   Agent 架构测试');
  console.log('========================================\n');
  
  const db = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'ai_bi_test',
  });
  
  console.log('✅ 数据库连接成功');
  
  const llm = new MockLLMClient();
  const nluAgent = new SimpleNLUBAgent(llm);
  const semanticAgent = new SimpleSemanticAgent(semanticConfig);
  const sqlGenerator = new SimpleSQLGeneratorAgent(llm);
  const validator = new SimpleValidatorAgent();
  const executor = new SimpleExecutorAgent(db);
  const insightAgent = new SimpleInsightAgent(llm);
  const vizAgent = new SimpleVisualizationAgent();
  
  const testQueries = [
    '销售额是多少',
    '有多少订单',
    '客户数量是多少',
    '平均订单金额',
    '按客户类型统计销售额',
  ];
  
  for (const query of testQueries) {
    console.log('\n========================================');
    console.log(`📝 测试查询: "${query}"`);
    console.log('========================================');
    
    try {
      const context = { userId: 'test', sessionId: 'test-001' };
      
      // 1. NLU
      const nluResult = await nluAgent.execute(query, context);
      
      // 2. Semantic
      const semanticResult = await semanticAgent.execute(nluResult.data, context);
      
      // 3. SQL Generator
      const sqlResult = await sqlGenerator.execute(semanticResult.data, context);
      
      if (!sqlResult.success) {
        console.log(`❌ SQL 生成失败`);
        continue;
      }
      
      // 4. Validator
      const validationResult = await validator.execute({ sql: sqlResult.data.sql }, context);
      
      if (!validationResult.data.isValid) {
        console.log(`❌ SQL 校验失败`);
        continue;
      }
      
      // 5. Executor
      const executorResult = await executor.execute({ sql: sqlResult.data.sql }, context);
      
      if (!executorResult.data.success) {
        console.log(`❌ 查询执行失败`);
        continue;
      }
      
      // 6. Insight
      const insightResult = await insightAgent.execute({ data: executorResult.data.data, query }, context);
      
      // 7. Visualization
      const vizResult = await vizAgent.execute({ data: executorResult.data.data, insights: insightResult.data.insights }, context);
      
      // 输出最终结果
      console.log('\n========================================');
      console.log('📊 最终结果');
      console.log('========================================');
      console.log(`SQL: ${sqlResult.data.sql}`);
      console.log(`数据: ${JSON.stringify(executorResult.data.data)}`);
      console.log(`摘要: ${insightResult.data.summary}`);
      console.log(`推荐图表: ${vizResult.data.chartType}`);
      
    } catch (error) {
      console.error(`❌ 执行出错: ${error.message}`);
    }
  }
  
  await db.end();
  console.log('\n========================================');
  console.log('   测试完成');
  console.log('========================================\n');
}

main().catch(console.error);
