import dotenv from 'dotenv';

dotenv.config();

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export const llmConfig: LLMConfig = {
  baseUrl: process.env.LLM_BASE_URL || '',
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || '',
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.5')
};

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callLLM(messages: Message[]): Promise<string> {
  const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages,
      temperature: llmConfig.temperature
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM调用失败: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

export function buildSchemaPrompt(): string {
  return `
表名: t_ai_medical_product_records
说明: 医疗产品采购记录表

字段说明:
- id: 主键
- hospital_code: 医院编码
- product_spec_code: 产品规格编码
- province: 省份
- city: 城市
- county: 县/区
- hospital_name: 医院名称
- hospital_level: 医院等级 (三级/二级/一级)
- record_date: 记录日期
- price: 单价
- quantity: 数量
- amount: 金额
- generic_name: 通用名
- product_name: 产品名称
- brand_name: 品牌名称
- manufacturer: 生产厂家
- dosage_form: 剂型
- specifications: 规格
- packaging: 包装
- packaging_material: 包装材料
- conversion_ratio: 转换比
- min_package_unit: 最小包装单位
- approval_number: 批准文号
- corporate_group: 企业集团
- is_delete: 是否删除
- created_by: 创建人
- created_time: 创建时间
- updated_by: 更新人
- updated_time: 更新时间
`;
}
