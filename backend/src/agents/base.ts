/**
 * Agent 基类
 * 
 * 所有 Agent 的抽象基类，提供通用的执行、重试、降级逻辑
 */

import {
  AgentDefinition,
  AgentConfig,
  AgentContext,
  AgentResult,
  AgentError,
  AgentMetadata,
  BaseAgent,
} from './types';

/**
 * 抽象 Agent 基类
 */
export abstract class AbstractAgent<TInput = any, TOutput = any> implements BaseAgent<TInput, TOutput> {
  abstract definition: AgentDefinition;
  
  protected defaultConfig: AgentConfig = {
    maxRetries: 3,
    timeout: 30000,
    enableCache: true,
  };
  
  config: AgentConfig;
  
  constructor(config?: Partial<AgentConfig>) {
    this.config = { ...this.defaultConfig, ...config };
  }
  
  /**
   * 执行 Agent（主入口）
   */
  async execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    let lastError: AgentError | undefined;
    let retryCount = 0;
    
    // 尝试执行，支持重试
    while (retryCount <= (this.config.maxRetries || 0)) {
      try {
        // 检查缓存
        if (this.config.enableCache) {
          const cached = await this.checkCache(input, context);
          if (cached) {
            return this.success(cached, { 
              executionTime: Date.now() - startTime,
              fromCache: true
            });
          }
        }
        
        // 执行核心逻辑
        const result = await this.runWithTimeout(input, context);
        
        // 缓存结果
        if (this.config.enableCache) {
          await this.cacheResult(input, context, result);
        }
        
        const metadata: AgentMetadata = {
          executionTime: Date.now() - startTime,
          retryCount,
        };
        
        return this.success(result, metadata);
        
      } catch (error: any) {
        lastError = this.handleError(error);
        retryCount++;
        
        // 如果可恢复且还有重试次数，尝试重试
        if (lastError.recoverable && retryCount <= (this.config.maxRetries || 0)) {
          console.log(`[${this.definition.name}] 第 ${retryCount} 次重试...`);
          await this.delay(1000 * retryCount); // 指数退避
        }
      }
    }
    
    return this.failure(lastError!, {
      executionTime: Date.now() - startTime,
      retryCount,
    });
  }
  
  /**
   * 核心执行逻辑（子类实现）
   */
  protected abstract run(input: TInput, context: AgentContext): Promise<TOutput>;
  
  /**
   * 带超时的执行
   */
  private async runWithTimeout(input: TInput, context: AgentContext): Promise<TOutput> {
    if (!this.config.timeout) {
      return this.run(input, context);
    }
    
    return Promise.race([
      this.run(input, context),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('执行超时')), this.config.timeout)
      ),
    ]);
  }
  
  /**
   * 错误处理
   */
  protected handleError(error: any): AgentError {
    // 默认错误处理逻辑
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return {
        code: 'NETWORK_ERROR',
        message: '网络连接失败',
        recoverable: true,
        details: { originalError: error.message },
      };
    }
    
    if (error.status === 429) {
      return {
        code: 'RATE_LIMIT',
        message: '请求频率超限',
        recoverable: true,
        details: { retryAfter: error.headers?.['retry-after'] },
      };
    }
    
    if (error.status === 401 || error.status === 403) {
      return {
        code: 'AUTH_ERROR',
        message: '认证失败',
        recoverable: false,
        details: { originalError: error.message },
      };
    }
    
    // 未知错误
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || '未知错误',
      recoverable: false,
      details: { originalError: error },
    };
  }
  
  /**
   * 检查缓存
   */
  protected async checkCache(input: TInput, context: AgentContext): Promise<TOutput | null> {
    // 子类可以覆盖实现缓存逻辑
    return null;
  }
  
  /**
   * 缓存结果
   */
  protected async cacheResult(input: TInput, context: AgentContext, result: TOutput): Promise<void> {
    // 子类可以覆盖实现缓存逻辑
  }
  
  /**
   * 成功响应
   */
  protected success(data: TOutput, metadata?: Partial<AgentMetadata>): AgentResult<TOutput> {
    return {
      success: true,
      data,
      metadata: {
        executionTime: 0,
        ...metadata,
      },
    };
  }
  
  /**
   * 失败响应
   */
  protected failure(error: AgentError, metadata?: Partial<AgentMetadata>): AgentResult<TOutput> {
    return {
      success: false,
      error,
      metadata: {
        executionTime: 0,
        ...metadata,
      },
    };
  }
  
  /**
   * 延迟
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 获取 Agent 能力描述
   */
  getCapabilities() {
    return [{
      name: this.definition.name,
      description: this.definition.description,
    }];
  }
}

/**
 * 无 LLM 依赖的 Agent 基类
 * 
 * 用于纯规则/算法逻辑的 Agent（如 Semantic Agent, Validator Agent）
 */
export abstract class RuleBasedAgent<TInput = any, TOutput = any> extends AbstractAgent<TInput, TOutput> {
  constructor(config?: Partial<AgentConfig>) {
    super({ ...config, maxRetries: 0 }); // 规则型 Agent 通常不需要重试
  }
}

/**
 * LLM 依赖的 Agent 基类
 * 
 * 用于需要调用大模型的 Agent（如 NLU Agent, SQL Generator Agent）
 */
export abstract class LLMAgent<TInput = any, TOutput = any> extends AbstractAgent<TInput, TOutput> {
  constructor(
    protected llmClient: LLMClient,
    config?: Partial<AgentConfig>
  ) {
    super(config);
  }
  
  /**
   * 调用 LLM
   */
  protected async callLLM(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.llmClient.chat({
      messages: [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
    
    return response.content;
  }
}

/**
 * LLM 客户端接口
 */
export interface LLMClient {
  chat(params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string; usage?: { inputTokens: number; outputTokens: number } }>;
}

/**
 * Agent 工厂函数类型
 */
export type AgentFactory<T extends AbstractAgent> = (config?: Partial<AgentConfig>) => T;
