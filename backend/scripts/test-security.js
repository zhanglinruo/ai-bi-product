/**
 * 安全性测试
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// 安全校验函数
const DANGEROUS_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE',
  'GRANT', 'REVOKE', 'EXEC', 'UNION',
];

const INJECTION_PATTERNS = [
  /;\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)/i,
  /--/,
  /\/\*/,
  /\bOR\s+1\s*=\s*1\b/i,
  /\bOR\s+'[^']*'\s*=\s*'[^']*'/i,
  /\bOR\s+"[^"]*"\s*=\s*"[^"]*"/i,
  /\bUNION\s+(ALL\s+)?SELECT\b/i,
];

const SENSITIVE_FIELDS = [
  'password', 'secret', 'token', 'credit_card',
];

function checkSQLSecurity(sql) {
  const issues = [];
  let riskLevel = 'safe';
  
  // 检查危险关键词
  const upperSQL = sql.toUpperCase();
  for (const keyword of DANGEROUS_KEYWORDS) {
    if (upperSQL.includes(keyword)) {
      issues.push({
        type: 'dangerous_keyword',
        message: `检测到危险关键词: ${keyword}`,
        severity: 'critical',
      });
      riskLevel = 'critical';
    }
  }
  
  // 检查注入模式
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sql)) {
      issues.push({
        type: 'injection_pattern',
        message: '检测到潜在的 SQL 注入风险',
        severity: 'critical',
      });
      riskLevel = 'critical';
    }
  }
  
  // 检查敏感字段
  for (const field of SENSITIVE_FIELDS) {
    const regex = new RegExp(`\`${field}\`|\\b${field}\\b`, 'i');
    if (regex.test(sql)) {
      issues.push({
        type: 'sensitive_field',
        message: `访问敏感字段: ${field}`,
        severity: 'high',
      });
      if (riskLevel !== 'critical') riskLevel = 'high';
    }
  }
  
  return { isSafe: riskLevel !== 'critical', riskLevel, issues };
}

// 测试
console.log('========================================');
console.log('   安全性测试');
console.log('========================================\n');

const testCases = [
  // 正常查询
  { sql: 'SELECT * FROM orders LIMIT 100', desc: '正常查询', expected: 'safe' },
  { sql: 'SELECT SUM(total_amount) FROM orders', desc: '聚合查询', expected: 'safe' },
  
  // SQL 注入测试
  { sql: "SELECT * FROM users WHERE id = '1' OR '1'='1'", desc: 'SQL 注入 - OR 1=1', expected: 'critical' },
  { sql: "SELECT * FROM users WHERE id = 1; DROP TABLE users;", desc: 'SQL 注入 - 堆叠查询', expected: 'critical' },
  { sql: 'SELECT * FROM users UNION SELECT * FROM passwords', desc: 'SQL 注入 - UNION', expected: 'critical' },
  { sql: 'SELECT * FROM users -- comment', desc: 'SQL 注入 - 注释', expected: 'critical' },
  
  // 危险关键词
  { sql: 'INSERT INTO users VALUES (1, "hacker")', desc: 'INSERT 操作', expected: 'critical' },
  { sql: 'DROP TABLE users', desc: 'DROP 操作', expected: 'critical' },
  { sql: 'DELETE FROM users', desc: 'DELETE 操作', expected: 'critical' },
  { sql: 'UPDATE users SET password = "hacked"', desc: 'UPDATE 操作', expected: 'critical' },
  
  // 敏感字段
  { sql: 'SELECT password FROM users', desc: '访问密码字段', expected: 'high' },
  { sql: 'SELECT token, secret FROM config', desc: '访问敏感字段', expected: 'high' },
  { sql: 'SELECT credit_card FROM payments', desc: '访问信用卡字段', expected: 'high' },
];

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = checkSQLSecurity(test.sql);
  const status = result.riskLevel === test.expected;
  
  if (status) {
    passed++;
    console.log(`✅ ${test.desc}`);
  } else {
    failed++;
    console.log(`❌ ${test.desc}`);
    console.log(`   期望: ${test.expected}, 实际: ${result.riskLevel}`);
  }
  
  if (result.issues.length > 0) {
    console.log(`   问题: ${result.issues.map(i => i.message).join(', ')}`);
  }
}

console.log('\n========================================');
console.log(`   结果: ${passed}/${testCases.length} 通过`);
console.log('========================================');

// 审计日志测试
console.log('\n📝 审计日志功能测试:');

const auditLogs = [];

function logAudit(log) {
  auditLogs.push({ ...log, timestamp: new Date() });
}

// 模拟审计日志
logAudit({ userId: 'user1', sql: 'SELECT * FROM orders', riskLevel: 'safe', executed: true });
logAudit({ userId: 'user2', sql: 'SELECT password FROM users', riskLevel: 'high', executed: false });
logAudit({ userId: 'user1', sql: 'SELECT SUM(total) FROM orders', riskLevel: 'safe', executed: true });

console.log(`   总日志数: ${auditLogs.length}`);
console.log(`   用户 user1 查询数: ${auditLogs.filter(l => l.userId === 'user1').length}`);
console.log(`   安全查询数: ${auditLogs.filter(l => l.riskLevel === 'safe').length}`);
console.log(`   被拦截数: ${auditLogs.filter(l => !l.executed).length}`);
