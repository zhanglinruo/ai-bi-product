/**
 * 查询缓存工具
 * 
 * 缓存查询结果，避免重复计算
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export class QueryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number;
  private defaultTTL: number; // 默认过期时间（毫秒）
  
  constructor(options: { maxSize?: number; defaultTTL?: number } = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 分钟
  }
  
  /**
   * 生成缓存键
   */
  generateKey(sql: string, params?: any): string {
    const normalizedSQL = sql.toLowerCase().trim().replace(/\s+/g, ' ');
    const key = params ? `${normalizedSQL}:${JSON.stringify(params)}` : normalizedSQL;
    return this.hash(key);
  }
  
  /**
   * 简单哈希函数
   */
  private hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `cache_${Math.abs(hash)}`;
  }
  
  /**
   * 获取缓存
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // 更新命中次数
    entry.hits++;
    
    return entry.data as T;
  }
  
  /**
   * 设置缓存
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // 如果超过最大数量，删除最少使用的
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      hits: 0,
    });
  }
  
  /**
   * 删除最少使用的缓存
   */
  private evictLRU(): void {
    let minHits = Infinity;
    let minKey: string | null = null;
    
    for (const [key, entry] of this.cache) {
      if (entry.hits < minHits) {
        minHits = entry.hits;
        minKey = key;
      }
    }
    
    if (minKey) {
      this.cache.delete(minKey);
    }
  }
  
  /**
   * 清除过期缓存
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    return removed;
  }
  
  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * 获取缓存统计
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalHits: number;
  } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
      totalHits,
    };
  }
  
  /**
   * 获取或设置缓存（常用模式）
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    const data = await fetcher();
    this.set(key, data, ttl);
    return data;
  }
}

// 单例
export const queryCache = new QueryCache();

// 定期清理过期缓存
setInterval(() => {
  const removed = queryCache.cleanup();
  if (removed > 0) {
    console.log(`[Cache] 清理了 ${removed} 个过期缓存`);
  }
}, 60000); // 每分钟清理一次
