/**
 * 语义层配置
 * 
 * 基于 ai_bi_test 数据库的表结构
 */

export interface SemanticMetric {
  id: string;
  name: string;
  aliases: string[];
  dbField: string;
  dbTable: string;
  aggregation: string;
  formula?: string;
}

export interface SemanticDimension {
  id: string;
  name: string;
  aliases: string[];
  dbField: string;
  dbTable: string;
  values?: Record<string, string>;
}

export interface SemanticTerm {
  id: string;
  term: string;
  category: string;
  mappings: string[];
}

export interface SemanticRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  priority: number;
}

export interface SemanticLayerConfig {
  metrics: SemanticMetric[];
  dimensions: SemanticDimension[];
  terms: SemanticTerm[];
  rules: SemanticRule[];
  fieldWhitelist: string[];
}

export const semanticConfig: SemanticLayerConfig = {
  // 指标定义
  metrics: [
    // 订单相关指标
    {
      id: 'metric_order_count',
      name: '订单数量',
      aliases: ['订单数', '订单量', '订单总数'],
      dbField: 'order_id',
      dbTable: 'orders',
      aggregation: 'COUNT',
    },
    {
      id: 'metric_sales_amount',
      name: '销售额',
      aliases: ['销售金额', '销售总额', '销售'],
      dbField: 'total_amount',
      dbTable: 'orders',
      aggregation: 'SUM',
    },
    {
      id: 'metric_avg_order_value',
      name: '平均订单金额',
      aliases: ['客单价', '平均订单额'],
      dbField: 'total_amount',
      dbTable: 'orders',
      aggregation: 'AVG',
    },
    {
      id: 'metric_tax_amount',
      name: '税额',
      aliases: ['税费', '税收'],
      dbField: 'tax_amount',
      dbTable: 'orders',
      aggregation: 'SUM',
    },
    {
      id: 'metric_shipping_cost',
      name: '运费',
      aliases: ['运费总额', '运输费用'],
      dbField: 'shipping_cost',
      dbTable: 'orders',
      aggregation: 'SUM',
    },
    
    // 客户相关指标
    {
      id: 'metric_customer_count',
      name: '客户数量',
      aliases: ['客户数', '客户总数'],
      dbField: 'customer_id',
      dbTable: 'customers',
      aggregation: 'COUNT',
    },
    {
      id: 'metric_credit_limit',
      name: '信用额度',
      aliases: ['信贷额度', '授信额度'],
      dbField: 'credit_limit',
      dbTable: 'customers',
      aggregation: 'SUM',
    },
    
    // 产品相关指标
    {
      id: 'metric_product_count',
      name: '产品数量',
      aliases: ['产品数', '商品数量', '商品数'],
      dbField: 'product_id',
      dbTable: 'products',
      aggregation: 'COUNT',
    },
    {
      id: 'metric_unit_price',
      name: '单价',
      aliases: ['价格', '售价'],
      dbField: 'unit_price',
      dbTable: 'products',
      aggregation: 'AVG',
    },
    {
      id: 'metric_unit_cost',
      name: '成本',
      aliases: ['单位成本', '成本价'],
      dbField: 'unit_cost',
      dbTable: 'products',
      aggregation: 'AVG',
    },
    
    // 库存相关指标
    {
      id: 'metric_inventory_quantity',
      name: '库存数量',
      aliases: ['库存量', '库存'],
      dbField: 'quantity',
      dbTable: 'inventory',
      aggregation: 'SUM',
    },
  ],
  
  // 维度定义
  dimensions: [
    // 客户维度
    {
      id: 'dim_customer_type',
      name: '客户类型',
      aliases: ['客户类别', '客户分类'],
      dbField: 'customer_type',
      dbTable: 'customers',
      values: {
        '零售': 'RETAIL',
        '批发': 'WHOLESALE',
        '分销商': 'DISTRIBUTOR',
      },
    },
    {
      id: 'dim_account_status',
      name: '账户状态',
      aliases: ['客户状态'],
      dbField: 'account_status',
      dbTable: 'customers',
      values: {
        '活跃': 'ACTIVE',
        '不活跃': 'INACTIVE',
        '暂停': 'SUSPENDED',
      },
    },
    {
      id: 'dim_city',
      name: '城市',
      aliases: ['城市'],
      dbField: 'city',
      dbTable: 'customers',
    },
    {
      id: 'dim_country',
      name: '国家',
      aliases: ['国家'],
      dbField: 'country',
      dbTable: 'customers',
    },
    
    // 产品维度
    {
      id: 'dim_category',
      name: '产品类别',
      aliases: ['类别', '分类', '产品分类'],
      dbField: 'category',
      dbTable: 'products',
    },
    {
      id: 'dim_manufacturer',
      name: '制造商',
      aliases: ['厂家', '生产商'],
      dbField: 'manufacturer',
      dbTable: 'products',
    },
    
    // 订单维度
    {
      id: 'dim_order_status',
      name: '订单状态',
      aliases: ['订单状态'],
      dbField: 'order_status',
      dbTable: 'orders',
      values: {
        '待处理': 'PENDING',
        '处理中': 'PROCESSING',
        '已发货': 'SHIPPED',
        '已交付': 'DELIVERED',
        '已取消': 'CANCELLED',
        '已退货': 'RETURNED',
      },
    },
    {
      id: 'dim_payment_status',
      name: '支付状态',
      aliases: ['付款状态'],
      dbField: 'payment_status',
      dbTable: 'orders',
      values: {
        '未支付': 'UNPAID',
        '已支付': 'PAID',
        '部分支付': 'PARTIALLY_PAID',
        '已退款': 'REFUNDED',
      },
    },
    {
      id: 'dim_payment_method',
      name: '支付方式',
      aliases: ['付款方式'],
      dbField: 'payment_method',
      dbTable: 'orders',
      values: {
        '信用卡': 'CREDIT_CARD',
        '借记卡': 'DEBIT_CARD',
        '银行转账': 'BANK_TRANSFER',
        '现金': 'CASH',
        '支票': 'CHECK',
      },
    },
  ],
  
  // 业务术语
  terms: [
    { id: 'term_1', term: '销售额', category: 'metric', mappings: ['total_amount'] },
    { id: 'term_2', term: '销量', category: 'metric', mappings: ['quantity'] },
    { id: 'term_3', term: '客单价', category: 'metric', mappings: ['AVG(total_amount)'] },
    { id: 'term_4', term: '零售客户', category: 'dimension', mappings: ['RETAIL'] },
    { id: 'term_5', term: '批发客户', category: 'dimension', mappings: ['WHOLESALE'] },
    { id: 'term_6', term: '活跃客户', category: 'dimension', mappings: ['ACTIVE'] },
  ],
  
  // 业务规则
  rules: [
    {
      id: 'rule_1',
      name: '订单金额必须大于0',
      condition: 'total_amount > 0',
      action: '过滤无效订单',
      priority: 1,
    },
  ],
  
  // 字段白名单
  fieldWhitelist: [
    // orders 表
    'order_id', 'customer_id', 'order_date', 'required_date', 'shipped_date',
    'order_status', 'payment_status', 'payment_method', 'shipping_method',
    'shipping_cost', 'tax_amount', 'total_amount', 'currency',
    
    // customers 表
    'customer_id', 'customer_name', 'contact_name', 'email', 'phone',
    'address', 'city', 'state', 'zip_code', 'country',
    'customer_type', 'account_status', 'credit_limit',
    
    // products 表
    'product_id', 'product_name', 'category', 'subcategory',
    'manufacturer', 'supplier', 'unit_cost', 'unit_price', 'stock_status',
    
    // inventory 表
    'inventory_id', 'product_id', 'warehouse_id', 'quantity', 'stock_status',
    
    // order_items 表
    'order_item_id', 'order_id', 'quantity', 'unit_price', 'discount', 'total',
    
    // 时间字段
    'created_at', 'updated_at',
  ],
};

export default semanticConfig;
