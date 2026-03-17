import { AbstractTool, ToolDefinition, ToolExecutionContext, ToolResult } from './types';
import dotenv from 'dotenv';

dotenv.config();

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMClient {
  chat(messages: Message[]): Promise<LLMResponse>;
}

class OpenAIClient implements LLMClient {
  constructor(private config: LLMConfig) {}
  
  async chat(messages: Message[]): Promise<LLMResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM调用失败: ${response.status} - ${error}`);
    }
    
    const data = await response.json() as any;
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage
    };
  }
}

export class LLMTool extends AbstractTool {
  private client: LLMClient;
  
  constructor(config: LLMConfig) {
    super();
    this.client = new OpenAIClient(config);
  }
  
  definition: ToolDefinition = {
    name: 'llm',
    description: 'LLM大模型调用工具 - 用于生成SQL、分析数据、回答问题',
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: '对话消息列表'
        },
        systemPrompt: {
          type: 'string',
          description: '系统提示词'
        },
        userPrompt: {
          type: 'string',
          description: '用户提示词'
        },
        temperature: {
          type: 'number',
          description: '温度参数'
        }
      },
      required: ['userPrompt']
    },
    outputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        usage: { type: 'object' }
      }
    }
  };
  
  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const messages: Message[] = [];
      
      if (input.systemPrompt) {
        messages.push({ role: 'system', content: input.systemPrompt });
      }
      
      if (input.messages) {
        messages.push(...input.messages);
      }
      
      if (input.userPrompt) {
        messages.push({ role: 'user', content: input.userPrompt });
      }
      
      const response = await this.client.chat(messages);
      
      return this.success({
        content: response.content,
        usage: response.usage
      }, { model: this.definition.name });
    } catch (error: any) {
      return this.failure(error.message);
    }
  }
  
  static createDefault(): LLMTool {
    return new LLMTool({
      provider: 'custom',
      baseUrl: process.env.LLM_BASE_URL || '',
      apiKey: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL || '',
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.5')
    });
  }
}
