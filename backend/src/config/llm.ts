import dotenv from 'dotenv';
import { semanticConfig } from './semantic-layer';

dotenv.config();

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export const llmConfig: LLMConfig = {
  baseUrl: process.env.LLM_BASE_URL || 'https://qianfan.baidubce.com/v2/coding',
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'qianfan-code-latest',
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2000'),
};

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 千帆 LLM 客户端
 * 支持 OpenAI 兼容格式的 API
 */
export class QianfanLLMClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config?: Partial<LLMConfig>) {
    this.baseUrl = config?.baseUrl || llmConfig.baseUrl;
    this.apiKey = config?.apiKey || llmConfig.apiKey;
    this.model = config?.model || llmConfig.model;
    this.temperature = config?.temperature || llmConfig.temperature;
    this.maxTokens = config?.maxTokens || llmConfig.maxTokens || 2000;
  }

  /**
   * 调用 Chat API
   */
  async chat(params: {
    messages: Message[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
    const url = `${this.baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model || this.model,
        messages: params.messages,
        temperature: params.temperature ?? this.temperature,
        max_tokens: params.maxTokens ?? this.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM调用失败: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
    };
  }
}

// 默认客户端实例
export const llmClient = new QianfanLLMClient();

/**
 * 调用 LLM（兼容旧接口）
 */
export async function callLLM(messages: Message[]): Promise<string> {
  const result = await llmClient.chat({ messages });
  return result.content;
}

/**
 * 构建 Schema 提示词
 */
export function buildSchemaPrompt(): string {
  const parts: string[] = [];
  
  // 添加指标定义
  parts.push('## 可用指标');
  for (const metric of semanticConfig.metrics) {
    parts.push(`- ${metric.name} (${metric.aliases.join(', ')}): ${metric.aggregation}(${metric.dbTable}.${metric.dbField})`);
  }
  
  // 添加维度定义
  parts.push('\n## 可用维度');
  for (const dim of semanticConfig.dimensions) {
    let desc = `- ${dim.name} (${dim.aliases.join(', ')}): ${dim.dbTable}.${dim.dbField}`;
    if (dim.values) {
      const valueList = Object.entries(dim.values).map(([k, v]) => `${k}=${v}`).join(', ');
      desc += ` [${valueList}]`;
    }
    parts.push(desc);
  }
  
  // 添加业务术语
  parts.push('\n## 业务术语');
  for (const term of semanticConfig.terms) {
    parts.push(`- ${term.term}: ${term.mappings.join(', ')}`);
  }
  
  return parts.join('\n');
}
