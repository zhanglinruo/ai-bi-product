/**
 * Agent 架构测试脚本 - 使用真实千帆 API
 * 
 * 测试完整的查询流程
 */

const mysql = require('mysql2/promise');
const { QianfanLLMClient } = require('./qianfan-client');

// 加载环境变量
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// ============================================
// 配置区域 - 从 .env 文件读取
// ============================================
const LLM_CONFIG = {
  // 千帆 Coding API - 直接使用配置的 URL
  baseUrl: process.env.LLM_BASE_URL || 'https://qianfan.baidubce.com/v2/coding',
  apiKey: process.env.LLM_API_KEY || '',
  secretKey: '', // OpenAI 兼容格式不需要 secretKey
  model: process.env.LLM_MODEL || 'DeepSeek-V3.2',
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2000'),
};

// 语义层配置
const semanticConfig = {
  metrics: [
    { id: 'metric_sales', name: '销售额', dbField: 'total_amount', dbTable: 'orders', aggregation: 'SUM' },
    { id: 'metric_order_count', name: '订单数量', dbField: 'order_id', dbTable: 'orders', aggregation: 'COUNT' },
    { id: 'metric_customer_count', name: '客户数量', dbField: 'customer_id', dbTable: 'customers', aggregation: 'COUNT' },
    { id: 'metric_avg_order', name: '平均订单金额', dbField: 'total_amount', dbTable: 'orders', aggregation: 'AVG' },
    { id: 'metric_product_count', name: '产品数量', dbField: 'product_id', dbTable: 'products', aggregation: 'COUNT' },
  ],
};

// ============================================
// NLU Agent - 使用真实 LLM
// ============================================
class NLUBAgent {
  constructor(llm) { this.llm = llm; }
  
  async execute(query, context) {
    console.log('\n[NLU Agent] 分析用户意图...');
    
    const systemPrompt = `你是一个自然语言理解专家。分析用户的数据查询问题，提取以下信息：

1. 意图类型：query（查询）, analysis（分析）, comparison（对比）, trend（趋势）
2. 指标：用户想查询的指标（如销售额、订单数等）
3. 维度：分组或筛选的维度（如地区、时间等）
4. 筛选条件：具体的筛选条件

数据库表说明：
- orders：订单表，包含 total_amount（金额）、order_date（日期）、order_status（状态）等
- customers：客户表，包含 customer_name、customer_type、city、country 等
- products：产品表，包含 product_name、category、unit_price 等

返回 JSON 格式：
{
  "intent": "query|analysis|comparison|trend",
  "confidence": 0.0-1.0,
  "entities": {
    "metrics": [{"field": "字段名", "table": "表名", "aggregation": "SUM|COUNT|AVG"}],
    "dimensions": [{"field": "字段名", "table": "表名"}],
    "filters": {"字段": "值"},
    "timeRange": {"type": "relative", "value": "last_7_days"}
  }
}

只返回 JSON，不要其他解释。`;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        temperature: 0.3,
      });
      
      // 解析 JSON
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log(`[NLU Agent] 意图: ${result.intent}`);
        console.log(`[NLU Agent] 置信度: ${result.confidence}`);
        console.log(`[NLU Agent] 指标: ${JSON.stringify(result.entities?.metrics || [])}`);
        return { success: true, data: result };
      }
    } catch (error) {
      console.error(`[NLU Agent] LLM 调用失败: ${error.message}`);
    }
    
    // 降级：使用关键词匹配
    console.log('[NLU Agent] 降级使用关键词匹配...');
    return this.fallbackMatch(query);
  }
  
  fallbackMatch(query) {
    const entities = { metrics: [], dimensions: [], filters: {} };
    
    const metricPatterns = [
      { pattern: /销售额?|销售金额|销售总额/, field: 'total_amount', table: 'orders', aggregation: 'SUM' },
      { pattern: /订单|有多少/, field: 'order_id', table: 'orders', aggregation: 'COUNT' },
      { pattern: /客户数|客户总数/, field: 'customer_id', table: 'customers', aggregation: 'COUNT' },
      { pattern: /产品数|商品数/, field: 'product_id', table: 'products', aggregation: 'COUNT' },
      { pattern: /平均.*金额|客单价/, field: 'total_amount', table: 'orders', aggregation: 'AVG' },
    ];
    
    for (const p of metricPatterns) {
      if (p.pattern.test(query)) {
        entities.metrics.push({ field: p.field, table: p.table, aggregation: p.aggregation });
      }
    }
    
    return { success: true, data: { intent: 'query', confidence: 0.6, entities } };
  }
}

// ============================================
// SQL Generator Agent - 使用真实 LLM
// ============================================
class SQLGeneratorAgent {
  constructor(llm) { this.llm = llm; }
  
  async execute(input, context) {
    console.log('\n[SQL Generator Agent] 生成 SQL...');
    
    const { entities, mappedFields } = input;
    
    const systemPrompt = `你是一个 SQL 生成专家。根据用户意图和数据库结构生成准确的 SQL 查询。

数据库表结构：
- orders（订单表）：order_id, customer_id, order_date, order_status, payment_status, total_amount, tax_amount
- customers（客户表）：customer_id, customer_name, customer_type, city, country, credit_limit
- products（产品表）：product_id, product_name, category, unit_price, unit_cost
- order_items（订单明细）：order_item_id, order_id, product_id, quantity, unit_price, total

规则：
1. 只生成 SELECT 查询
2. 使用正确的 MySQL 语法
3. 字段名用反引号包裹
4. 添加 LIMIT 100
5. 返回 JSON: {"sql": "SQL语句", "explanation": "解释"}

用户意图: ${JSON.stringify(entities)}
指标: ${JSON.stringify(mappedFields)}

只返回 JSON，不要其他内容。`;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请生成 SQL 查询' },
        ],
        temperature: 0.1,
      });
      
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log(`[SQL Generator Agent] SQL: ${result.sql}`);
        return { success: true, data: result };
      }
    } catch (error) {
      console.error(`[SQL Generator Agent] LLM 调用失败: ${error.message}`);
    }
    
    // 降级：使用简单模板
    return this.fallbackGenerate(mappedFields);
  }
  
  fallbackGenerate(mappedFields) {
    if (!mappedFields || mappedFields.length === 0) {
      return { success: false, error: { code: 'NO_METRICS', message: '没有找到指标' } };
    }
    
    const field = mappedFields[0];
    const agg = field.aggregation || 'SUM';
    const table = field.dbTable;
    const dbField = field.dbField;
    
    let sql = '';
    if (agg === 'COUNT') {
      sql = `SELECT COUNT(\`${dbField}\`) as \`${field.userTerm}\` FROM \`${table}\` LIMIT 100`;
    } else if (agg === 'AVG') {
      sql = `SELECT AVG(\`${dbField}\`) as \`${field.userTerm}\` FROM \`${table}\` LIMIT 100`;
    } else {
      sql = `SELECT SUM(\`${dbField}\`) as \`${field.userTerm}\` FROM \`${table}\` LIMIT 100`;
    }
    
    return { success: true, data: { sql, explanation: `查询 ${table} 表的 ${field.userTerm}` } };
  }
}

// ============================================
// Semantic Agent
// ============================================
class SemanticAgent {
  constructor(config) { this.config = config; }
  
  async execute(input, context) {
    console.log('\n[Semantic Agent] 映射字段...');
    
    const entities = input.entities || input;
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

// ============================================
// Validator Agent
// ============================================
class ValidatorAgent {
  async execute(input, context) {
    console.log('\n[Validator Agent] 校验 SQL...');
    
    const sql = input.sql;
    const errors = [];
    
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
    return { success: true, data: { isValid: errors.length === 0, errors, warnings: [] } };
  }
}

// ============================================
// Executor Agent
// ============================================
class ExecutorAgent {
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
      return { success: true, data: { success: false, data: [], error: error.message } };
    }
  }
}

// ============================================
// Insight Agent - 使用真实 LLM
// ============================================
class InsightAgent {
  constructor(llm) { this.llm = llm; }
  
  async execute(input, context) {
    console.log('\n[Insight Agent] 生成洞察...');
    
    const { data, query } = input;
    
    if (!data || data.length === 0) {
      return { success: true, data: { summary: '查询结果为空', insights: [] } };
    }
    
    const systemPrompt = `你是一个数据分析专家。分析查询结果，生成简洁的业务洞察。

用户问题：${query}
查询结果：${JSON.stringify(data.slice(0, 5))}

返回 JSON:
{
  "summary": "一句话总结（不超过50字）",
  "insights": [{"type": "trend", "title": "标题", "description": "描述", "importance": "high"}],
  "recommendations": ["建议"]
}

只返回 JSON。`;

    try {
      const response = await this.llm.chat({
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.5,
      });
      
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log(`[Insight Agent] 摘要: ${result.summary}`);
        return { success: true, data: result };
      }
    } catch (error) {
      console.error(`[Insight Agent] LLM 调用失败: ${error.message}`);
    }
    
    // 降级
    const firstRow = data[0];
    const keys = Object.keys(firstRow);
    const value = firstRow[keys[0]];
    const summary = typeof value === 'number' ? `总计: ${value.toLocaleString()}` : `查询到 ${data.length} 条数据`;
    
    return { success: true, data: { summary, insights: [], recommendations: [] } };
  }
}

// ============================================
// Visualization Agent
// ============================================
class VisualizationAgent {
  async execute(input, context) {
    console.log('\n[Visualization Agent] 生成可视化...');
    
    const data = input.data;
    let chartType = 'card';
    let chartConfig = {};
    
    if (data && data.length === 1) {
      chartType = 'card';
      const firstRow = data[0];
      chartConfig = { metrics: Object.keys(firstRow).map(k => ({ name: k, value: firstRow[k] })) };
    } else if (data && data.length > 1 && data.length <= 10) {
      chartType = 'bar';
    } else {
      chartType = 'table';
    }
    
    console.log(`[Visualization Agent] 推荐图表: ${chartType}`);
    return { success: true, data: { chartType, chartConfig } };
  }
}

// ============================================
// 主测试函数
// ============================================
async function main() {
  console.log('========================================');
  console.log('   Agent 架构测试 - 千帆 API');
  console.log('========================================\n');
  
  // 检查 API 配置
  if (!LLM_CONFIG.apiKey) {
    console.log('❌ 请配置千帆 API Key！');
    console.log('\n配置方式：');
    console.log('1. 设置环境变量：');
    console.log('   LLM_BASE_URL=https://your-api-url/v1/chat/completions');
    console.log('   LLM_API_KEY=your-api-key');
    console.log('   LLM_MODEL=qwen3-235b-a22b');
    console.log('\n2. 或直接修改脚本中的 LLM_CONFIG');
    return;
  }
  
  console.log('✅ LLM 配置已加载');
  console.log(`   API URL: ${LLM_CONFIG.baseUrl}`);
  console.log(`   模型: ${LLM_CONFIG.model}`);
  
  // 连接数据库
  const db = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'ai_bi_test',
  });
  
  console.log('✅ 数据库连接成功');
  
  // 创建 LLM 客户端
  const llm = new QianfanLLMClient(LLM_CONFIG);
  
  // 创建 Agent 实例
  const nluAgent = new NLUBAgent(llm);
  const semanticAgent = new SemanticAgent(semanticConfig);
  const sqlGenerator = new SQLGeneratorAgent(llm);
  const validator = new ValidatorAgent();
  const executor = new ExecutorAgent(db);
  const insightAgent = new InsightAgent(llm);
  const vizAgent = new VisualizationAgent();
  
  // 测试用例
  const testQueries = [
    '销售额是多少',
    '有多少订单',
    '平均订单金额是多少',
    '各产品类别的销售额对比',
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
      const sqlResult = await sqlGenerator.execute({
        entities: nluResult.data.entities,
        mappedFields: semanticResult.data.mappedFields,
      }, context);
      
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
        console.log(`❌ 查询执行失败: ${executorResult.data.error}`);
        continue;
      }
      
      // 6. Insight
      const insightResult = await insightAgent.execute({ data: executorResult.data.data, query }, context);
      
      // 7. Visualization
      const vizResult = await vizAgent.execute({ data: executorResult.data.data }, context);
      
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
