/**
 * 性能优化测试
 */

// 缓存测试
class SimpleCache {
  constructor(maxSize = 100, ttl = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  
  hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return `cache_${Math.abs(hash)}`;
  }
  
  generateKey(sql, params) {
    const normalizedSQL = sql.toLowerCase().trim().replace(/\s+/g, ' ');
    const key = params ? `${normalizedSQL}:${JSON.stringify(params)}` : normalizedSQL;
    return this.hash(key);
  }
  
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    entry.hits++;
    return entry.data;
  }
  
  set(key, data, ttl) {
    if (this.cache.size >= this.maxSize) {
      let minHits = Infinity;
      let minKey = null;
      for (const [k, e] of this.cache) {
        if (e.hits < minHits) {
          minHits = e.hits;
          minKey = k;
        }
      }
      if (minKey) this.cache.delete(minKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.ttl,
      hits: 0,
    });
  }
  
  async getOrSet(key, fetcher, ttl) {
    const cached = this.get(key);
    if (cached !== null) return cached;
    
    const data = await fetcher();
    this.set(key, data, ttl);
    return data;
  }
  
  getStats() {
    let totalHits = 0;
    for (const e of this.cache.values()) {
      totalHits += e.hits;
    }
    return { size: this.cache.size, totalHits };
  }
}

console.log('========================================');
console.log('   性能优化测试');
console.log('========================================\n');

// 主测试函数
async function main() {
  // 测试缓存
  const cache = new SimpleCache(100, 60000);
  
  console.log('📝 缓存功能测试:');
  
  const sql1 = 'SELECT SUM(total_amount) FROM orders';
  const key1 = cache.generateKey(sql1);
  
  // 第一次查询（缓存未命中）
  console.log('\n第一次查询（缓存未命中）:');
  const start1 = Date.now();
  const data1 = await cache.getOrSet(key1, async () => {
    // 模拟数据库查询
    await new Promise(r => setTimeout(r, 100));
    return { total: 715537509 };
  });
  console.log(`   耗时: ${Date.now() - start1}ms`);
  console.log(`   结果: ${JSON.stringify(data1)}`);
  
  // 第二次查询（缓存命中）
  console.log('\n第二次查询（缓存命中）:');
  const start2 = Date.now();
  const data2 = await cache.getOrSet(key1, async () => {
    // 不会执行
    return { total: 0 };
  });
  console.log(`   耗时: ${Date.now() - start2}ms`);
  console.log(`   结果: ${JSON.stringify(data2)}`);
  
  // 缓存统计
  const stats = cache.getStats();
  console.log(`\n缓存统计:`);
  console.log(`   缓存数量: ${stats.size}`);
  console.log(`   总命中: ${stats.totalHits}`);
  
  // 性能对比
  console.log('\n📝 性能对比测试:');
  
  const queries = [
    'SELECT SUM(total_amount) FROM orders',
    'SELECT COUNT(*) FROM orders',
    'SELECT AVG(total_amount) FROM orders',
    'SELECT SUM(total_amount) FROM orders WHERE order_status = "DELIVERED"',
  ];
  
  // 无缓存执行
  console.log('\n无缓存执行:');
  const noCacheStart = Date.now();
  for (const sql of queries) {
    await new Promise(r => setTimeout(r, 50)); // 模拟查询
  }
  const noCacheTime = Date.now() - noCacheStart;
  console.log(`   总耗时: ${noCacheTime}ms`);
  
  // 有缓存执行（重复查询）
  console.log('\n有缓存执行（重复查询相同SQL）:');
  const withCacheStart = Date.now();
  for (let i = 0; i < 4; i++) {
    const sql = queries[i % 2]; // 只查询前两条
    const key = cache.generateKey(sql);
    await cache.getOrSet(key, async () => {
      await new Promise(r => setTimeout(r, 50));
      return { result: Math.random() };
    });
  }
  const withCacheTime = Date.now() - withCacheStart;
  console.log(`   总耗时: ${withCacheTime}ms`);
  console.log(`   性能提升: ${((noCacheTime - withCacheTime) / noCacheTime * 100).toFixed(1)}%`);
  
  // 大批量查询优化
  console.log('\n📝 批量查询优化测试:');
  
  const batchQueries = Array(100).fill(null).map((_, i) => 
    `SELECT * FROM orders WHERE id = ${i}`
  );
  
  // 串行执行
  console.log('\n串行执行:');
  const serialStart = Date.now();
  for (const sql of batchQueries.slice(0, 10)) {
    await new Promise(r => setTimeout(r, 10));
  }
  const serialTime = Date.now() - serialStart;
  console.log(`   10条查询耗时: ${serialTime}ms`);
  
  // 并行执行模拟
  console.log('\n并行执行（模拟）:');
  const parallelStart = Date.now();
  await Promise.all(batchQueries.slice(0, 10).map(() => 
    new Promise(r => setTimeout(r, 10))
  ));
  const parallelTime = Date.now() - parallelStart;
  console.log(`   10条查询耗时: ${parallelTime}ms`);
  console.log(`   性能提升: ${((serialTime - parallelTime) / serialTime * 100).toFixed(1)}%`);
  
  console.log('\n========================================');
  console.log('   测试完成 ✅');
  console.log('========================================');
}

main().catch(console.error);
