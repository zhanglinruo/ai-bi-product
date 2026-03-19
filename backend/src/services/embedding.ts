/**
 * Embedding 服务
 * 
 * 使用百度千帆 Embedding API 进行文本向量化
 */

import { QianfanLLMClient } from '../config/llm';

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
  
  /**
   * 添加向量
   */
  add(id: string, vector: number[], metadata: any): void {
    this.vectors.set(id, { vector, metadata });
  }
  
  /**
   * 批量添加
   */
  addBatch(items: Array<{ id: string; vector: number[]; metadata: any }>): void {
    for (const item of items) {
      this.add(item.id, item.vector, item.metadata);
    }
  }
  
  /**
   * 向量相似度搜索（余弦相似度）
   */
  search(queryVector: number[], topK: number = 5): VectorSearchResult[] {
    const results: VectorSearchResult[] = [];
    
    for (const [id, { vector, metadata }] of this.vectors) {
      const score = this.cosineSimilarity(queryVector, vector);
      results.push({ id, score, metadata });
    }
    
    // 按相似度降序排序
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, topK);
  }
  
  /**
   * 计算余弦相似度
   */
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
  
  /**
   * 获取所有向量数量
   */
  size(): number {
    return this.vectors.size;
  }
  
  /**
   * 清空
   */
  clear(): void {
    this.vectors.clear();
  }
}

/**
 * Embedding 服务类
 */
export class EmbeddingService {
  private llmClient: QianfanLLMClient;
  private vectorStore: MemoryVectorStore;
  private cache: Map<string, number[]> = new Map();
  
  constructor(llmClient: QianfanLLMClient) {
    this.llmClient = llmClient;
    this.vectorStore = new MemoryVectorStore();
  }
  
  /**
   * 获取文本的向量表示
   */
  async embed(text: string): Promise<number[]> {
    // 检查缓存
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }
    
    try {
      // 调用千帆 Embedding API
      const response = await this.llmClient.embed({ text });
      const embedding = response.embedding || response.data?.[0]?.embedding;
      
      if (!embedding) {
        throw new Error('Embedding response is empty');
      }
      
      // 缓存结果
      this.cache.set(text, embedding);
      
      return embedding;
    } catch (error: any) {
      console.error('Embedding error:', error.message);
      // 返回零向量作为降级
      return new Array(384).fill(0);
    }
  }
  
  /**
   * 批量获取向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    
    for (const text of texts) {
      const embedding = await this.embed(text);
      results.push(embedding);
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
  async search(query: string, topK: number = 5): Promise<VectorSearchResult[]> {
    const queryVector = await this.embed(query);
    return this.vectorStore.search(queryVector, topK);
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
}

// 单例
let embeddingService: EmbeddingService | null = null;

/**
 * 获取 Embedding 服务实例
 */
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    const llmClient = new QianfanLLMClient();
    embeddingService = new EmbeddingService(llmClient);
  }
  return embeddingService;
}
