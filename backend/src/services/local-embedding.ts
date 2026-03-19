/**
 * 本地 Embedding 服务
 * 
 * 使用 Transformers.js + bge-small-zh-v1.5 模型
 * 模型大小: 133MB，首次运行自动下载
 */

import { pipeline, env } from '@xenova/transformers';

// 配置模型缓存目录和镜像
env.cacheDir = './models';

export interface EmbeddingResult {
  embedding: number[];
  text: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: any;
}

/**
 * 向量存储（内存实现）
 */
class MemoryVectorStore {
  private vectors: Map<string, { vector: number[]; metadata: any }> = new Map();
  
  add(id: string, vector: number[], metadata: any): void {
    this.vectors.set(id, { vector, metadata });
  }
  
  addBatch(items: Array<{ id: string; vector: number[]; metadata: any }>): void {
    for (const item of items) {
      this.add(item.id, item.vector, item.metadata);
    }
  }
  
  search(queryVector: number[], topK: number = 5, threshold: number = 0.6): VectorSearchResult[] {
    const results: VectorSearchResult[] = [];
    
    for (const [id, { vector, metadata }] of this.vectors) {
      const score = this.cosineSimilarity(queryVector, vector);
      if (score >= threshold) {
        results.push({ id, score, metadata });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
  
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  size(): number {
    return this.vectors.size;
  }
  
  clear(): void {
    this.vectors.clear();
  }
}

/**
 * 本地 Embedding 服务类
 */
export class LocalEmbeddingService {
  private extractor: any = null;
  private vectorStore: MemoryVectorStore;
  private cache: Map<string, number[]> = new Map();
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  
  constructor() {
    this.vectorStore = new MemoryVectorStore();
  }
  
  /**
   * 初始化模型（首次会下载模型）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // 防止重复初始化
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = this.doInitialize();
    await this.initPromise;
  }
  
  private async doInitialize(): Promise<void> {
    console.log('[LocalEmbedding] 正在加载模型 bge-small-zh-v1.5...');
    console.log('[LocalEmbedding] 首次运行会自动下载模型（133MB）');
    
    try {
      // 使用 feature-extraction pipeline
      this.extractor = await pipeline(
        'feature-extraction',
        'Xenova/bge-small-zh-v1.5',
        { quantized: true }  // 使用量化模型，更小更快
      );
      
      this.initialized = true;
      console.log('[LocalEmbedding] 模型加载完成');
    } catch (error: any) {
      console.error('[LocalEmbedding] 模型加载失败:', error.message);
      throw error;
    }
  }
  
  /**
   * 获取文本的向量表示
   */
  async embed(text: string): Promise<number[]> {
    await this.initialize();
    
    // 检查缓存
    const cached = this.cache.get(text);
    if (cached) return cached;
    
    try {
      // 生成向量
      const output = await this.extractor(text, { pooling: 'mean', normalize: true });
      
      // 转换为数组
      const embedding = Array.from(output.data) as number[];
      
      // 缓存
      this.cache.set(text, embedding);
      
      return embedding;
    } catch (error: any) {
      console.error('[LocalEmbedding] 向量生成失败:', error.message);
      // 降级：返回零向量
      return new Array(384).fill(0);
    }
  }
  
  /**
   * 批量获取向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
  
  /**
   * 添加文档到向量存储
   */
  async addDocument(id: string, text: string, metadata: any): Promise<void> {
    const vector = await this.embed(text);
    this.vectorStore.add(id, vector, { ...metadata, text });
  }
  
  /**
   * 批量添加文档
   */
  async addDocuments(documents: Array<{ id: string; text: string; metadata?: any }>): Promise<void> {
    for (const doc of documents) {
      await this.addDocument(doc.id, doc.text, doc.metadata || {});
    }
  }
  
  /**
   * 语义搜索
   */
  async search(query: string, topK: number = 5, threshold: number = 0.6): Promise<VectorSearchResult[]> {
    const queryVector = await this.embed(query);
    return this.vectorStore.search(queryVector, topK, threshold);
  }
  
  /**
   * 获取向量存储大小
   */
  getVectorStoreSize(): number {
    return this.vectorStore.size();
  }
  
  /**
   * 清空向量存储
   */
  clearVectorStore(): void {
    this.vectorStore.clear();
    this.cache.clear();
  }
  
  /**
   * 是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 预热模型（首次查询会更快）
   */
  async prewarm(): Promise<void> {
    await this.initialize();
    if (!this.extractor) return;
    
    try {
      console.log('[LocalEmbedding] 预热模型...');
      await this.extractor('warmup', { pooling: 'mean', normalize: true });
      console.log('[LocalEmbedding] 预热完成');
    } catch (error: any) {
      console.warn('[LocalEmbedding] 预热警告:', error.message);
    }
  }
}

// 单例
let localEmbeddingService: LocalEmbeddingService | null = null;

/**
 * 获取本地 Embedding 服务实例
 */
export function getLocalEmbeddingService(): LocalEmbeddingService {
  if (!localEmbeddingService) {
    localEmbeddingService = new LocalEmbeddingService();
  }
  return localEmbeddingService;
}
