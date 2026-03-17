import { Router, Request, Response } from 'express';
import { llmConfig } from '../../config/index';

const router = Router();

router.post('/chat', async (_req: Request, res: Response) => {
  try {
    const { messages, sessionId } = _req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, message: '消息格式错误' });
    }

    const response = await fetch(`${llmConfig.base_url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.api_key}`
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages,
        temperature: llmConfig.temperature,
        max_tokens: llmConfig.max_tokens
      })
    });

    if (!response.ok) {
      throw new Error(`大模型调用失败: ${response.status}`);
    }

    const data = await response.json() as any;
    const reply = data.choices?.[0]?.message?.content || '';

    res.json({ success: true, data: { reply, usage: data.usage } });
  } catch (error: any) {
    console.error('AI对话错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/generate-sql', async (_req: Request, res: Response) => {
  try {
    const { question, schema, context } = _req.body;

    if (!question) {
      return res.status(400).json({ success: false, message: '问题不能为空' });
    }

    const systemPrompt = `你是一个SQL生成专家。根据用户的问题和数据库结构，生成准确的SQL查询。

数据库结构：
${JSON.stringify(schema, null, 2)}

要求：
1. 只生成SELECT查询
2. 使用正确的SQL语法
3. 如果需要过滤条件，使用用户提供的上下文信息
4. 返回纯SQL语句，不要其他解释

${context ? `上下文信息：${JSON.stringify(context)}` : ''}

用户问题：${question}`;

    const response = await fetch(`${llmConfig.base_url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.api_key}`
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`SQL生成失败: ${response.status}`);
    }

    const data = await response.json() as any;
    const sql = data.choices?.[0]?.message?.content?.trim() || '';

    res.json({ success: true, data: { sql } });
  } catch (error: any) {
    console.error('SQL生成错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/generate-conclusion', async (_req: Request, res: Response) => {
  try {
    const { question, result, sql } = _req.body;

    if (!question || !result) {
      return res.status(400).json({ success: false, message: '问题和结果不能为空' });
    }

    const systemPrompt = `你是一个数据分析专家。根据查询结果，生成简洁的业务结论。

用户问题：${question}
执行的SQL：${sql}
查询结果：${JSON.stringify(result)}

要求：
1. 用自然语言描述核心发现
2. 突出关键指标和异常
3. 如果有同比环比，计算并说明
4. 结论要简洁明了，不超过100字`;

    const response = await fetch(`${llmConfig.base_url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.api_key}`
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: 'system', content: systemPrompt }
        ],
        temperature: 0.5,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`结论生成失败: ${response.status}`);
    }

    const data = await response.json() as any;
    const conclusion = data.choices?.[0]?.message?.content?.trim() || '';

    res.json({ success: true, data: { conclusion } });
  } catch (error: any) {
    console.error('结论生成错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
