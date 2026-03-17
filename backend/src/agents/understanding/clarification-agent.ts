/**
 * Clarification Agent - 澄清询问
 * 
 * 当理解不确定时，向用户提问澄清
 */

import { LLMAgent, LLMClient } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  ClarificationOutput,
  ClarificationQuestion,
} from '../types';

export interface ClarificationInput {
  nluResult: {
    intent: string;
    confidence: number;
    entities: any;
  };
  semanticResult: {
    unmappedTerms: string[];
  };
}

export class ClarificationAgent extends LLMAgent<ClarificationInput, ClarificationOutput> {
  definition: AgentDefinition = {
    name: 'clarification-agent',
    description: '当理解不确定时，向用户提问澄清',
    version: '1.0.0',
    layer: 'understanding',
    inputSchema: {
      type: 'object',
      properties: {
        nluResult: { type: 'object' },
        semanticResult: { type: 'object' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        needsClarification: { type: 'boolean' },
        questions: { type: 'array' },
      },
    },
  };
  
  constructor(llmClient: LLMClient) {
    super(llmClient, {
      model: 'qwen-turbo',
      temperature: 0.5,
      maxTokens: 500,
      maxRetries: 1,
    });
  }
  
  protected async run(input: ClarificationInput, context: AgentContext): Promise<ClarificationOutput> {
    const { nluResult, semanticResult } = input;
    const questions: ClarificationQuestion[] = [];
    
    // 1. 置信度太低
    if (nluResult.confidence < 0.7) {
      questions.push({
        field: 'intent',
        question: '抱歉，我不太理解您的问题。您是想查询数据，还是分析数据？',
        options: ['查询具体数据', '分析数据趋势', '对比不同数据', '其他'],
        type: 'select',
      });
    }
    
    // 2. 缺少关键实体
    if (!nluResult.entities.metrics || nluResult.entities.metrics.length === 0) {
      questions.push({
        field: 'metrics',
        question: '您想查看哪些指标？例如：销售额、利润、成本等',
        options: ['销售额', '利润', '成本', '数量', '其他'],
        type: 'select',
      });
    }
    
    // 3. 缺少时间范围
    if (!nluResult.entities.timeRange) {
      questions.push({
        field: 'timeRange',
        question: '您想查看哪个时间段的数据？',
        options: ['最近7天', '本月', '本季度', '本年', '自定义时间'],
        type: 'select',
      });
    }
    
    // 4. 有未映射的术语
    if (semanticResult.unmappedTerms.length > 0) {
      const terms = semanticResult.unmappedTerms.join('、');
      questions.push({
        field: 'unmappedTerms',
        question: `我不太理解"${terms}"具体指什么，能详细说明一下吗？`,
        type: 'input',
      });
    }
    
    // 5. 如果有歧义，让 LLM 帮助澄清
    if (questions.length > 0) {
      // 可以用 LLM 生成更自然的澄清问题
      // 这里简化处理
    }
    
    return {
      needsClarification: questions.length > 0,
      questions,
    };
  }
  
  /**
   * 降级：返回最基础的澄清问题
   */
  async fallback(input: ClarificationInput, context: AgentContext): Promise<AgentResult<ClarificationOutput>> {
    return this.success({
      needsClarification: true,
      questions: [{
        field: 'general',
        question: '请详细描述一下您想查询的数据',
        type: 'input',
      }],
    });
  }
}
