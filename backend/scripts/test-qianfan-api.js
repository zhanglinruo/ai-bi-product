/**
 * 测试千帆 API 连接
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const baseUrl = process.env.LLM_BASE_URL;
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;

async function testEndpoint(url, label) {
  console.log(`\n测试: ${label}`);
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 100,
      }),
    });
    
    const data = await response.text();
    console.log(`状态: ${response.status}`);
    console.log(`响应: ${data.substring(0, 200)}`);
    
    if (response.ok) {
      console.log('✅ 成功！');
      return true;
    }
  } catch (error) {
    console.log(`错误: ${error.message}`);
  }
  return false;
}

async function main() {
  console.log('========================================');
  console.log('千帆 API 端点测试');
  console.log('========================================');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Model: ${model}`);
  console.log(`API Key: ${apiKey?.substring(0, 20)}...`);
  
  // 尝试各种端点
  const endpoints = [
    { url: baseUrl, label: '直接 POST 到 baseUrl' },
    { url: baseUrl + '/completions', label: '/completions' },
    { url: baseUrl + '/chat/completions', label: '/chat/completions' },
    { url: baseUrl + '/v1/chat/completions', label: '/v1/chat/completions' },
    { url: baseUrl.replace('/v2/coding', '/v2/app/chat/completions'), label: '/v2/app/chat/completions' },
    { url: baseUrl.replace('/v2/coding', '/v2/app/completions'), label: '/v2/app/completions' },
  ];
  
  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint.url, endpoint.label);
    if (success) {
      console.log(`\n🎉 找到正确的端点: ${endpoint.label}`);
      break;
    }
  }
}

main();
