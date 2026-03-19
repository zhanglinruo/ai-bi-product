/**
 * API 测试脚本
 */

import dotenv from 'dotenv';
dotenv.config();

async function testLLM() {
  console.log('=== 测试 LLM API ===');
  console.log(`URL: ${process.env.LLM_BASE_URL}`);
  console.log(`Model: ${process.env.LLM_MODEL}`);

  try {
    const response = await fetch(`${process.env.LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL,
        messages: [{ role: 'user', content: '你好，返回 JSON: {"status":"ok","message":"ping"}' }],
        temperature: 0.5,
      }),
    });

    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error: any) {
    console.error('LLM 调用失败:', error.message);
  }
}

async function testEmbedding() {
  console.log('\n=== 测试 Embedding API ===');
  console.log(`URL: ${process.env.LLM_BASE_URL}`);
  console.log(`Model: ${process.env.EMBEDDING_MODEL}`);

  try {
    const response = await fetch(`${process.env.LLM_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.EMBEDDING_MODEL,
        input: '你好',
      }),
    });

    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error: any) {
    console.error('Embedding 调用失败:', error.message);
  }
}

async function main() {
  await testLLM();
  await testEmbedding();
}

main();
