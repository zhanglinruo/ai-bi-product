import { AnalysisTemplate } from './types';

export const drugMarketShareTemplate: AnalysisTemplate = {
  id: 'drug_market_share',
  name: '药品市场占有率分析',
  description: '分析莱士集团在各区域的市场占有率，识别机会和改进点',
  keywords: ['药品占有率', '药品销量', '集团占有率', '产品占有率', '莱士集团', '市场占有率'],
  steps: [
    {
      stepId: 'step1',
      stepName: '省份维度集团占有率分析',
      description: '按省份分类查询各集团药品的销量和占有率，识别莱士集团的优势省份和劣势省份',
      sql: `
        SELECT 
          province AS region,
          corporate_group AS group_name,
          SUM(amount) AS total_amount,
          SUM(quantity) AS total_quantity,
          COUNT(*) AS order_count
        FROM t_ai_medical_product_records
        WHERE province IS NOT NULL AND province != ''
        GROUP BY province, corporate_group
        ORDER BY province, total_amount DESC
      `,
      analyzePrompt: `
        分析各省份的集团占有率数据：
        1. 计算各省份总销量
        2. 计算各集团在各省的占有率 = 集团销量 / 省份总销量
        3. 识别莱士集团占有率最高的前3个省份（优势省份）
        4. 识别莱士集团占有率最低的3个省份（劣势省份）
        5. 标记任何异常数据
      `,
      drillDown: {
        dimension: 'province',
        condition: 'low_share',
        targetField: 'province',
        anomalyThreshold: 0.3,
        topN: 3
      }
    },
    {
      stepId: 'step2',
      stepName: '区域维度集团占有率分析',
      description: '针对优势和劣势省份，按区县分类查询各集团药品的销量和占有率',
      sql: `
        SELECT 
          province AS region,
          city AS sub_region,
          corporate_group AS group_name,
          SUM(amount) AS total_amount,
          SUM(quantity) AS total_quantity
        FROM t_ai_medical_product_records
        WHERE province IS NOT NULL AND city IS NOT NULL
        GROUP BY province, city, corporate_group
        ORDER BY province, city, total_amount DESC
      `,
      analyzePrompt: `
        分析各区县的集团占有率数据：
        1. 按区县计算各集团占有率
        2. 针对Step1发现的劣势省份，重点分析其下属区县
        3. 识别莱士集团占有率最低的区县
        4. 识别市场机会最大的区县
      `,
      drillDown: {
        dimension: 'city',
        condition: 'low_share',
        targetField: 'city',
        anomalyThreshold: 0.25,
        topN: 5
      }
    },
    {
      stepId: 'step3',
      stepName: '医院维度集团占有率分析',
      description: '针对重点区县，按医院分类查询各集团药品的销量和占有率',
      sql: `
        SELECT 
          province AS region,
          city AS sub_region,
          hospital_name,
          corporate_group AS group_name,
          SUM(amount) AS total_amount,
          SUM(quantity) AS total_quantity
        FROM t_ai_medical_product_records
        WHERE hospital_name IS NOT NULL AND hospital_name != ''
        GROUP BY province, city, hospital_name, corporate_group
        ORDER BY province, city, hospital_name, total_amount DESC
      `,
      analyzePrompt: `
        分析各医院的集团占有率数据：
        1. 计算各医院各集团的销量和占有率
        2. 针对Step2发现的重点区县，分析其下属医院
        3. 识别莱士集团未进入或占有率极低的医院
        4. 识别潜在目标医院
      `,
      drillDown: {
        dimension: 'hospital',
        condition: 'no_share',
        targetField: 'hospital_name',
        topN: 10
      }
    },
    {
      stepId: 'step4',
      stepName: '低占有率机会识别',
      description: '分析各省份、区域、医院中莱士集团占有率较低的地方，识别市场拓展机会',
      sql: `
        SELECT 
          province AS region,
          city AS sub_region,
          hospital_name,
          SUM(amount) AS total_amount,
          SUM(CASE WHEN corporate_group = '莱士集团' THEN amount ELSE 0 END) AS laishi_amount,
          SUM(CASE WHEN corporate_group = '莱士集团' THEN quantity ELSE 0 END) AS laishi_quantity
        FROM t_ai_medical_product_records
        WHERE province IS NOT NULL
        GROUP BY province, city, hospital_name
        HAVING total_amount > 0
        ORDER BY total_amount DESC
      `,
      analyzePrompt: `
        识别市场机会：
        1. 计算各区域莱士集团的占有率
        2. 筛选出莱士集团占有率低于20%但市场总量较大的区域
        3. 识别高价值但莱士集团未覆盖的医院
        4. 列出Top10市场机会点
      `
    },
    {
      stepId: 'step5',
      stepName: '重点推广区域分析',
      description: '识别莱士集团整体占有率较高但仍有提升空间的区域，作为优先推广目标',
      sql: `
        SELECT 
          province AS region,
          SUM(amount) AS total_amount,
          SUM(CASE WHEN corporate_group = '莱士集团' THEN amount ELSE 0 END) AS laishi_amount
        FROM t_ai_medical_product_records
        WHERE province IS NOT NULL
        GROUP BY province
        HAVING total_amount > 0
        ORDER BY laishi_amount DESC
      `,
      analyzePrompt: `
        分析重点推广区域：
        1. 识别莱士集团占有率在30%-60%之间的省份（还有提升空间）
        2. 分析这些省份的市场总量和增长潜力
        3. 确定优先推广的省份列表
      `
    },
    {
      stepId: 'step6',
      stepName: '莱士集团产品分布分析',
      description: '查询莱士集团内部各产品的销量分布和占有率',
      sql: `
        SELECT 
          product_name,
          SUM(amount) AS total_amount,
          SUM(quantity) AS total_quantity,
          COUNT(*) AS order_count
        FROM t_ai_medical_product_records
        WHERE corporate_group = '莱士集团' AND product_name IS NOT NULL
        GROUP BY product_name
        ORDER BY total_amount DESC
      `,
      analyzePrompt: `
        分析莱士集团产品结构：
        1. 计算各产品占总销量的比例
        2. 识别主力产品和潜力产品
        3. 分析产品集中度
      `
    },
    {
      stepId: 'step7',
      stepName: '区域-产品交叉分析',
      description: '分析在特定地区或医院，莱士集团整体占有率较高但某些产品占有率低的情况',
      sql: `
        SELECT 
          province AS region,
          product_name,
          SUM(amount) AS total_amount,
          SUM(CASE WHEN corporate_group = '莱士集团' THEN amount ELSE 0 END) AS laishi_amount
        FROM t_ai_medical_product_records
        WHERE province IS NOT NULL AND product_name IS NOT NULL
        GROUP BY province, product_name
        HAVING total_amount > 0
        ORDER BY province, total_amount DESC
      `,
      analyzePrompt: `
        区域-产品交叉分析：
        1. 计算各省份各产品的莱士集团占有率
        2. 识别莱士集团整体占有率高但某产品占有率低的区域
        3. 识别产品推广机会
      `
    },
    {
      stepId: 'step8',
      stepName: '产品推广优先级分析',
      description: '基于区域-产品交叉分析结果，确定优先推广的产品和区域组合',
      sql: `
        SELECT 
          province AS region,
          city AS sub_region,
          hospital_name,
          product_name,
          SUM(amount) AS total_amount,
          SUM(CASE WHEN corporate_group = '莱士集团' THEN amount ELSE 0 END) AS laishi_amount
        FROM t_ai_medical_product_records
        WHERE province IS NOT NULL AND product_name IS NOT NULL AND hospital_name IS NOT NULL
        GROUP BY province, city, hospital_name, product_name
        HAVING total_amount > 10000
        ORDER BY total_amount DESC
      `,
      analyzePrompt: `
        产品推广优先级分析：
        1. 识别高价值医院中莱士集团未覆盖的产品
        2. 计算各产品在各区域的市场空间
        3. 确定Top10产品推广优先级建议
        4. 输出具体的医院+产品组合建议
      `
    }
  ],
  finalAnalyzePrompt: `
    综合以上所有分析步骤的结果，生成完整的药品市场占有率分析报告，包括：
    
    一、概述
    - 分析范围和数据概况
    
    二、莱士集团市场地位
    - 整体市场占有率
    - 各省份占有率分布
    
    三、优势与劣势分析
    - 优势省份及原因分析
    - 劣势省份及原因分析
    
    四、市场机会识别
    - 低占有率高价值区域
    - 莱士集团未覆盖的医院
    
    五、产品分析
    - 主力产品分析
    - 产品推广机会
    
    六、建议
    - 短期行动计划（1-3个月）
    - 中期发展目标（3-6个月）
    - 长期战略方向
    
    七、附录
    - 详细数据表格
  `,
  outputFormat: {
    includeSummary: true,
    includeOpportunities: true,
    includeRecommendations: true
  }
};

export const generalDrillDownTemplate: AnalysisTemplate = {
  id: 'general_drill_down',
  name: '通用下钻分析',
  description: '通用的多维度下钻分析，从汇总到明细逐层深入',
  keywords: ['分析', '下钻', '明细', '详细', '分布'],
  steps: [
    {
      stepId: 'step1',
      stepName: '维度汇总分析',
      description: '按指定维度进行汇总分析，识别异常点',
      sql: `
        SELECT 
          {dimension} AS dimension_value,
          SUM(amount) AS total_amount,
          SUM(quantity) AS total_quantity,
          COUNT(*) AS order_count,
          AVG(amount) AS avg_amount
        FROM t_ai_medical_product_records
        WHERE {dimension} IS NOT NULL AND {dimension} != ''
        GROUP BY {dimension}
        ORDER BY total_amount DESC
      `,
      analyzePrompt: `
        分析汇总数据：
        1. 识别数值异常高或低的维度值
        2. 计算各维度值的占比
        3. 标记需要下钻的异常点
      `,
      drillDown: {
        dimension: '{dimension}',
        condition: 'anomaly',
        targetField: 'dimension_value',
        topN: 3
      }
    },
    {
      stepId: 'step2',
      stepName: '下钻维度分析',
      description: '针对异常维度值进行下一层级分析',
      sql: `
        SELECT 
          {sub_dimension} AS dimension_value,
          SUM(amount) AS total_amount,
          SUM(quantity) AS total_quantity,
          COUNT(*) AS order_count
        FROM t_ai_medical_product_records
        WHERE {parent_dimension} = '{parent_value}'
        GROUP BY {sub_dimension}
        ORDER BY total_amount DESC
      `,
      analyzePrompt: `
        分析下钻数据：
        1. 识别该维度下的细分结构
        2. 识别关键明细数据
      `
    },
    {
      stepId: 'step3',
      stepName: '明细数据分析',
      description: '查看最细粒度的明细数据',
      sql: `
        SELECT *
        FROM t_ai_medical_product_records
        WHERE {dimension} = '{value}'
        ORDER BY amount DESC
        LIMIT 100
      `,
      analyzePrompt: `
        分析明细数据：
        1. 识别关键记录
        2. 提取分析结论
      `
    }
  ]
};
