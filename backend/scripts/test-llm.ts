import dotenv from 'dotenv';
dotenv.config();

async function testLLM() {
  console.log('=== 测试 LLM API ===');
  const url = `${process.env.LLM_BASE_URL}/chat/completions`;
  console.log(`URL: ${url}`);
  console.log(`Model: ${process.env.LLM_MODEL}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL,
        stream: false,
        max_tokens: 1024,
        top_p: 0.95,
        temperature: 1,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: '1+1等于几？简单回答' }
        ],
      }),
    });

    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error: any) {
    console.error('LLM 调用失败:', error.message);
  }
}

testLLM();
