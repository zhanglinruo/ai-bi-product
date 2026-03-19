/**
 * Embedding 服务
 *
 * 支持本地模型和 API 两种方式
 * 优先使用本地模型，失败时自动切换到 API
 */

import { pipeline, env } from '@xenova/transformers';

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

export class LocalEmbeddingService {
  private extractor: any = null;
  private vectorStore: MemoryVectorStore;
  private cache: Map<string, number[]> = new Map();
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private useApi: boolean = false;
  private apiEndpoint: string;
  private apiKey: string;
  private apiModel: string;

  constructor() {
    this.vectorStore = new MemoryVectorStore();
    this.apiEndpoint = process.env.LLM_BASE_URL || '';
    this.apiKey = process.env.LLM_API_KEY || '';
    this.apiModel = process.env.EMBEDDING_MODEL || 'text-embedding-v3';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      console.log('[Embedding] 尝试加载本地模型...');
      process.env.HF_ENDPOINT = 'https://hf-mirror.com';

      this.extractor = await pipeline(
        'feature-extraction',
        'Xenova/bge-small-zh-v1.5',
        { quantized: true }
      );

      this.initialized = true;
      this.useApi = false;
      console.log('[Embedding] 本地模型加载成功');
    } catch (localError: any) {
      console.warn(`[Embedding] 本地模型加载失败: ${localError.message}`);

      if (this.apiEndpoint && this.apiKey) {
        console.log('[Embedding] 切换到 API 方式...');
        this.useApi = true;
        this.initialized = true;
      } else {
        console.error('[Embedding] 未配置 API，将返回零向量');
        throw localError;
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    await this.initialize();

    const cached = this.cache.get(text);
    if (cached) return cached;

    try {
      let embedding: number[];

      if (this.useApi) {
        embedding = await this.embedViaApi(text);
      } else {
        embedding = await this.embedViaLocal(text);
      }

      this.cache.set(text, embedding);
      return embedding;
    } catch (error: any) {
      console.error(`[Embedding] 向量生成失败: ${error.message}`);
      return new Array(384).fill(0);
    }
  }

  private async embedViaLocal(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('Local model not initialized');
    }

    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data) as number[];
  }

  private async embedViaApi(text: string): Promise<number[]> {
    const response = await fetch(`${this.apiEndpoint}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.apiModel,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: text }
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json() as any;
    if (data.output?.embedding) {
      return data.output.embedding;
    }
    if (data.data?.[0]?.embedding) {
      return data.data[0].embedding;
    }
    throw new Error('Invalid embedding response format');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  async addDocument(id: string, text: string, metadata: any): Promise<void> {
    const vector = await this.embed(text);
    this.vectorStore.add(id, vector, { ...metadata, text });
  }

  async addDocuments(documents: Array<{ id: string; text: string; metadata?: any }>): Promise<void> {
    for (const doc of documents) {
      await this.addDocument(doc.id, doc.text, doc.metadata || {});
    }
  }

  async search(query: string, topK: number = 5, threshold: number = 0.6): Promise<VectorSearchResult[]> {
    const queryVector = await this.embed(query);
    return this.vectorStore.search(queryVector, topK, threshold);
  }

  getVectorStoreSize(): number {
    return this.vectorStore.size();
  }

  clearVectorStore(): void {
    this.vectorStore.clear();
    this.cache.clear();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isUsingApi(): boolean {
    return this.useApi;
  }

  async prewarm(): Promise<void> {
    await this.initialize();

    if (this.useApi) {
      console.log('[Embedding] API 模式，无需预热');
      return;
    }

    if (!this.extractor) return;

    try {
      console.log('[Embedding] 预热本地模型...');
      await this.extractor('warmup', { pooling: 'mean', normalize: true });
      console.log('[Embedding] 预热完成');
    } catch (error: any) {
      console.warn('[Embedding] 预热警告:', error.message);
    }
  }
}

let localEmbeddingService: LocalEmbeddingService | null = null;

export function getLocalEmbeddingService(): LocalEmbeddingService {
  if (!localEmbeddingService) {
    localEmbeddingService = new LocalEmbeddingService();
  }
  return localEmbeddingService;
}
