/**
 * NLU Agent - 自然语言理解
 * 
 * 负责理解用户意图，提取关键实体
 * 支持：多条件筛选、时间范围、排序
 */

import { LLMAgent, LLMClient } from '../base';
import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  NLUOutput,
} from '../types';

export interface NLUInput {
  query: string;
  context?: {
    userId?: string;
    sessionId?: string;
    history?: Array<{ role: string; content: string }>;
  };
}

// 字段名映射（中文 -> 英文）
const FIELD_MAPPING: Record<string, string> = {
  '销售额': 'total_amount',
  '销售金额': 'total_amount',
  '订单数': 'order_id',
  '订单量': 'order_id',
  '客户数': 'customer_id',
  '客户数量': 'customer_id',
  '产品数': 'product_id',
  '客户类型': 'customer_type',
  '客户类别': 'customer_type',
  '产品类别': 'category',
  '类别': 'category',
  '城市': 'city',
  '国家': 'country',
  '订单状态': 'order_status',
  '支付方式': 'payment_method',
  '制造商': 'manufacturer',
  '厂家': 'manufacturer',
  '零售': 'RETAIL',
  '批发': 'WHOLESALE',
  '分销商': 'DISTRIBUTOR',
  '活跃': 'ACTIVE',
  '已完成': 'DELIVERED',
  '待处理': 'PENDING',
  '已发货': 'SHIPPED',
  '信用卡': 'CREDIT_CARD',
  '银行转账': 'BANK_TRANSFER',
};

// 字段所属表映射
const FIELD_TABLE_MAPPING: Record<string, string> = {
  'total_amount': 'orders',
  'order_id': 'orders',
  'customer_id': 'customers',
  'product_id': 'products',
  'customer_type': 'customers',
  'category': 'products',
  'city': 'customers',
  'country': 'customers',
  'order_status': 'orders',
  'payment_method': 'orders',
  'manufacturer': 'products',
};

// 时间表达式映射
const TIME_EXPRESSIONS: Record<string, { unit: string; value: number; operator: string }> = {
  '今天': { unit: 'DAY', value: 0, operator: '=' },
  '昨天': { unit: 'DAY', value: 1, operator: '=' },
  '最近7天': { unit: 'DAY', value: 7, operator: '>=' },
  '最近一周': { unit: 'DAY', value: 7, operator: '>=' },
  '最近30天': { unit: 'DAY', value: 30, operator: '>=' },
  '最近一个月': { unit: 'MONTH', value: 1, operator: '>=' },
  '最近一月': { unit: 'MONTH', value: 1, operator: '>=' },
  '最近三个月': { unit: 'MONTH', value: 3, operator: '>=' },
  '最近半年': { unit: 'MONTH', value: 6, operator: '>=' },
  '最近一年': { unit: 'YEAR', value: 1, operator: '>=' },
  '本周': { unit: 'WEEK', value: 1, operator: '>=' },
  '本月': { unit: 'MONTH', value: 1, operator: '>=' },
  '上月': { unit: 'MONTH', value: 2, operator: '=' },
  '本季度': { unit: 'QUARTER', value: 1, operator: '>=' },
  '上季度': { unit: 'QUARTER', value: 2, operator: '=' },
  '今年': { unit: 'YEAR', value: 1, operator: '>=' },
  '去年': { unit: 'YEAR', value: 2, operator: '=' },
};

export class NLUBAgent extends LLMAgent<NLUInput, NLUOutput> {
  definition: AgentDefinition = {
    name: 'nlu-agent',
    description: '理解用户意图，提取关键实体',
    version: '2.0.0',
    layer: 'understanding',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        context: { type: 'object' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string' },
        confidence: { type: 'number' },
        entities: { type: 'object' },
      },
    },
  };
  
  constructor(llmClient: LLMClient) {
    super(llmClient, {
      temperature: 0.3,
      maxTokens: 1500,
      maxRetries: 2,
    });
  }
  
  protected async run(input: NLUInput, context: AgentContext): Promise<NLUOutput> {
    const query = input.query;
    
    // 使用规则匹配（更快、更可靠）
    const result = this.extractEntities(query);
    
    return result;
  }
  
  /**
   * 提取实体（规则匹配）
   */
  private extractEntities(query: string): NLUOutput {
    const result: NLUOutput = {
      intent: 'query',
      confidence: 0.8,
      entities: {
        metrics: [],
        dimensions: [],
        filters: {},
        groupBy: [],
        orderBy: undefined,
        limit: 100,
        timeRange: undefined,
      },
    };
    
    // 1. 提取指标
    result.entities.metrics = this.extractMetrics(query);
    
    // 2. 提取维度和分组
    const dimensions = this.extractDimensions(query);
    result.entities.dimensions = dimensions;
    
    // 检查是否需要 GROUP BY
    if (/按|每个|各|分别|不同|各类/.test(query)) {
      result.entities.groupBy = dimensions.map(d => d.field);
    }
    
    // 3. 提取筛选条件
    result.entities.filters = this.extractFilters(query);
    
    // 4. 提取时间范围
    result.entities.timeRange = this.extractTimeRange(query);
    
    // 5. 提取排序
    result.entities.orderBy = this.extractOrderBy(query);
    
    // 6. 提取 LIMIT
    const limitMatch = query.match(/前(\d+)/);
    if (limitMatch) {
      result.entities.limit = parseInt(limitMatch[1]);
    }
    
    // 7. 判断意图
    if (/对比|比较|差异/.test(query)) {
      result.intent = 'comparison';
    } else if (/趋势|变化|增长|下降/.test(query)) {
      result.intent = 'trend';
    } else if (/为什么|原因|分析/.test(query)) {
      result.intent = 'analysis';
    }
    
    return result;
  }
  
  /**
   * 提取指标
   */
  private extractMetrics(query: string): any[] {
    const metrics: any[] = [];
    
    const patterns = [
      { regex: /销售额?|销售金额|销售总额/, field: 'total_amount', table: 'orders', agg: 'SUM' },
      { regex: /订单数|订单量|有多少订单/, field: 'order_id', table: 'orders', agg: 'COUNT' },
      { regex: /客户数|客户总数|客户数量/, field: 'customer_id', table: 'customers', agg: 'COUNT' },
      { regex: /产品数|商品数/, field: 'product_id', table: 'products', agg: 'COUNT' },
      { regex: /平均.*订单|客单价|平均.*金额/, field: 'total_amount', table: 'orders', agg: 'AVG' },
      { regex: /最高|最大|最多的/, field: 'total_amount', table: 'orders', agg: 'MAX' },
      { regex: /最低|最小|最少的/, field: 'total_amount', table: 'orders', agg: 'MIN' },
    ];
    
    for (const p of patterns) {
      if (p.regex.test(query)) {
        // 避免重复添加
        if (!metrics.find(m => m.field === p.field && m.aggregation === p.agg)) {
          metrics.push({
            field: p.field,
            table: p.table,
            aggregation: p.agg,
          });
        }
      }
    }
    
    return metrics;
  }
  
  /**
   * 提取维度
   */
  private extractDimensions(query: string): any[] {
    const dimensions: any[] = [];
    
    const patterns = [
      { regex: /客户类型|客户类别/, field: 'customer_type', table: 'customers' },
      { regex: /产品类别|产品分类/, field: 'category', table: 'products' },
      { regex: /城市/, field: 'city', table: 'customers' },
      { regex: /国家/, field: 'country', table: 'customers' },
      { regex: /订单状态/, field: 'order_status', table: 'orders' },
      { regex: /支付方式/, field: 'payment_method', table: 'orders' },
      { regex: /制造商|厂家/, field: 'manufacturer', table: 'products' },
    ];
    
    for (const p of patterns) {
      if (p.regex.test(query)) {
        if (!dimensions.find(d => d.field === p.field)) {
          dimensions.push({
            field: p.field,
            table: p.table,
          });
        }
      }
    }
    
    return dimensions;
  }
  
  /**
   * 提取筛选条件
   */
  private extractFilters(query: string): Record<string, any> {
    const filters: Record<string, any> = {};
    
    // 客户类型
    if (/零售/.test(query)) {
      filters['customer_type'] = 'RETAIL';
    } else if (/批发/.test(query)) {
      filters['customer_type'] = 'WHOLESALE';
    } else if (/分销商/.test(query)) {
      filters['customer_type'] = 'DISTRIBUTOR';
    }
    
    // 订单状态
    if (/已完成|完成/.test(query)) {
      filters['order_status'] = 'DELIVERED';
    } else if (/待处理/.test(query)) {
      filters['order_status'] = 'PENDING';
    } else if (/已发货/.test(query)) {
      filters['order_status'] = 'SHIPPED';
    } else if (/已取消/.test(query)) {
      filters['order_status'] = 'CANCELLED';
    }
    
    // 支付方式
    if (/信用卡/.test(query)) {
      filters['payment_method'] = 'CREDIT_CARD';
    } else if (/银行转账/.test(query)) {
      filters['payment_method'] = 'BANK_TRANSFER';
    } else if (/现金/.test(query)) {
      filters['payment_method'] = 'CASH';
    }
    
    // 账户状态
    if (/活跃/.test(query)) {
      filters['account_status'] = 'ACTIVE';
    }
    
    // 地区（城市名称匹配）
    const cityPatterns = [
      /北京|上海|广州|深圳|杭州|南京|武汉|成都|西安|重庆/,
    ];
    for (const pattern of cityPatterns) {
      const match = query.match(pattern);
      if (match) {
        filters['city'] = match[0];
        break;
      }
    }
    
    return filters;
  }
  
  /**
   * 提取时间范围
   */
  private extractTimeRange(query: string): any | null {
    for (const [expr, config] of Object.entries(TIME_EXPRESSIONS)) {
      if (query.includes(expr)) {
        return {
          expression: expr,
          unit: config.unit,
          value: config.value,
          operator: config.operator,
        };
      }
    }
    
    // 检查年份
    const yearMatch = query.match(/(\d{4})年/);
    if (yearMatch) {
      return {
        expression: 'year',
        year: parseInt(yearMatch[1]),
      };
    }
    
    // 检查月份
    const monthMatch = query.match(/(\d{1,2})月/);
    if (monthMatch) {
      return {
        expression: 'month',
        month: parseInt(monthMatch[1]),
      };
    }
    
    return null;
  }
  
  /**
   * 提取排序
   */
  private extractOrderBy(query: string): any | null {
    if (/最高|最多|最大的|排名前/.test(query)) {
      return { direction: 'DESC' };
    }
    if (/最低|最少|最小的/.test(query)) {
      return { direction: 'ASC' };
    }
    return null;
  }
  
  /**
   * 降级处理
   */
  async fallback(input: NLUInput, context: AgentContext): Promise<AgentResult<NLUOutput>> {
    const result = this.extractEntities(input.query);
    return this.success(result);
  }
}
