/**
 * 千帆 LLM 客户端
 * 
 * 支持百度千帆 Coding API（OpenAI 兼容格式）
 */

class QianfanLLMClient {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model || 'DeepSeek-V3.2';
    this.temperature = config.temperature || 0.5;
    this.maxTokens = config.maxTokens || 2000;
  }
  
  /**
   * 调用 Chat API
   */
  async chat(params) {
    const { messages, model, temperature, maxTokens } = params;
    
    // 千帆 Coding API 使用 OpenAI 兼容格式
    const url = this.baseUrl + '/chat/completions';
    
    const body = {
      model: model || this.model,
      messages,
      temperature: temperature || this.temperature,
      max_tokens: maxTokens || this.maxTokens,
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM 调用失败: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    
    return {
      content: data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
    };
  }
}

module.exports = { QianfanLLMClient };
