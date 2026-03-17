/**
 * 多轮对话测试（纯 JS）
 */

// 简化的上下文管理器
class SimpleContextManager {
  constructor() {
    this.sessions = new Map();
  }
  
  getOrCreate(sessionId, userId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        userId,
        messages: [],
        entities: null,
        sql: null,
        result: null,
      });
    }
    return this.sessions.get(sessionId);
  }
  
  addMessage(sessionId, role, content, metadata = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.messages.push({ role, content, timestamp: new Date(), ...metadata });
    
    if (metadata.entities) session.entities = metadata.entities;
    if (metadata.sql) session.sql = metadata.sql;
    if (metadata.result) session.result = metadata.result;
  }
  
  isFollowUp(query) {
    const patterns = [
      /^(那|那么|还有|另外|再|继续|然后)/,
      /(呢|怎么样|如何)$/,
      /^(其中|里面)/,
      /^(按|按照)/,
      /^(筛选|过滤|只要)/,
      /(更详细|详细|具体)/,
    ];
    return patterns.some(p => p.test(query));
  }
  
  mergeFollowUpEntities(previous, current) {
    if (!previous) return current;
    
    const merged = { ...previous };
    
    if (current.metrics?.length > 0) merged.metrics = current.metrics;
    if (current.dimensions?.length > 0) merged.dimensions = current.dimensions;
    merged.filters = { ...merged.filters, ...current.filters };
    if (current.groupBy?.length > 0) merged.groupBy = current.groupBy;
    if (current.timeRange) merged.timeRange = current.timeRange;
    if (current.orderBy) merged.orderBy = current.orderBy;
    if (current.limit && current.limit !== 100) merged.limit = current.limit;
    
    return merged;
  }
  
  getPreviousEntities(sessionId) {
    return this.sessions.get(sessionId)?.entities;
  }
  
  getPreviousSQL(sessionId) {
    return this.sessions.get(sessionId)?.sql;
  }
  
  getRecentMessages(sessionId, count = 5) {
    const session = this.sessions.get(sessionId);
    return session?.messages.slice(-count) || [];
  }
  
  getStats() {
    return { totalSessions: this.sessions.size };
  }
}

// 测试
const contextManager = new SimpleContextManager();

console.log('========================================');
console.log('   多轮对话测试');
console.log('========================================\n');

const sessionId = 'test-session-001';

// 创建会话
contextManager.getOrCreate(sessionId, 'user-001');
console.log('✅ 创建会话:', sessionId);

// 添加第一条对话
contextManager.addMessage(sessionId, 'user', '销售额是多少');
contextManager.addMessage(sessionId, 'assistant', '销售总额为 7.15 亿元', {
  entities: {
    metrics: [{ field: 'total_amount', aggregation: 'SUM' }],
    filters: {},
    groupBy: [],
  },
  sql: 'SELECT SUM(total_amount) FROM orders',
});
console.log('✅ 添加第一条对话');

// 追问检测
console.log('\n📝 追问检测测试:');
const followUpQueries = [
  '那零售客户呢',
  '按城市分组呢',
  '其中北京的呢',
  '更详细一点',
  '销售额是多少',  // 不是追问
];

for (const q of followUpQueries) {
  const isFollowUp = contextManager.isFollowUp(q);
  console.log(`   "${q}" → ${isFollowUp ? '✅ 追问' : '❌ 新查询'}`);
}

// 实体合并
console.log('\n📝 实体合并测试:');

const previous = {
  metrics: [{ field: 'total_amount', aggregation: 'SUM' }],
  filters: {},
  groupBy: [],
};

const followUp1 = { filters: { customer_type: 'RETAIL' } };
const merged1 = contextManager.mergeFollowUpEntities(previous, followUp1);
console.log('   追问: "那零售客户呢"');
console.log('   合并结果:', JSON.stringify(merged1.filters));

const followUp2 = { groupBy: ['city'] };
const merged2 = contextManager.mergeFollowUpEntities(merged1, followUp2);
console.log('\n   追问: "按城市分组呢"');
console.log('   合并结果:', JSON.stringify({ filters: merged2.filters, groupBy: merged2.groupBy }));

// 上下文获取
console.log('\n📝 上下文获取测试:');
const prevEntities = contextManager.getPreviousEntities(sessionId);
const prevSQL = contextManager.getPreviousSQL(sessionId);
console.log('   上一次实体:', JSON.stringify(prevEntities?.metrics));
console.log('   上一次 SQL:', prevSQL);

// 统计
console.log('\n📝 会话统计:');
const stats = contextManager.getStats();
console.log('   总会话数:', stats.totalSessions);

console.log('\n========================================');
console.log('   测试完成 ✅');
console.log('========================================');
