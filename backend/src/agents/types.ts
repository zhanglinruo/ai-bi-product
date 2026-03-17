/**
 * Agent 类型定义
 * 
 * 基于 AI+BI 产品的核心流程，定义 3 层 8 个 Agent 的接口规范
 */

// ============================================
// 基础类型
// ============================================

/**
 * Agent 执行结果
 */
export interface AgentResult<T = any> {
  success: boolean;
  data?: T;
  error?: AgentError;
  metadata?: AgentMetadata;
}

/**
 * Agent 错误
 */
export interface AgentError {
  code: string;
  message: string;
  details?: Record<string, any>;
  recoverable: boolean; // 是否可恢复
}

/**
 * Agent 元数据
 */
export interface AgentMetadata {
  executionTime: number;  // 执行时间（毫秒）
  modelUsed?: string;     // 使用的模型
  tokensUsed?: number;    // 消耗的 token
  retryCount?: number;    // 重试次数
  fromCache?: boolean;    // 是否来自缓存
}

/**
 * Agent 执行上下文
 */
export interface AgentContext {
  userId: string;
  sessionId?: string;
  datasourceId?: string;
  permissions?: string[];
  history?: ConversationHistory[];
  metadata?: Record<string, any>;
}

/**
 * 对话历史
 */
export interface ConversationHistory {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// ============================================
// 第 1 层：理解层 (Understanding Layer)
// ============================================

/**
 * NLU Agent 输出
 */
export interface NLUOutput {
  intent: IntentType;
  confidence: number;
  entities: ExtractedEntities;
  rewrittenQuery?: string; // 改写后的查询
}

export type IntentType = 
  | 'query'      // 简单查询
  | 'analysis'   // 分析型
  | 'comparison' // 对比型
  | 'trend'      // 趋势型
  | 'unknown';

export interface ExtractedEntities {
  metrics: string[];       // 指标（销售额、利润等）
  dimensions: string[];    // 维度（地区、产品等）
  filters: Record<string, any>;  // 筛选条件
  timeRange?: TimeRange;   // 时间范围
  aggregations?: string[]; // 聚合方式（sum, avg, count 等）
  limit?: number;          // 限制条数
  orderBy?: OrderBy;       // 排序
  groupBy?: string[];      // 分组字段
}

export interface TimeRange {
  type: 'relative' | 'absolute';
  value?: string;          // relative: last_7_days, this_month, last_quarter
  start?: Date;            // absolute: 开始日期
  end?: Date;              // absolute: 结束日期
}

export interface OrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Semantic Agent 输出
 */
export interface SemanticOutput {
  mappedFields: MappedField[];
  availableTables: string[];
  joinHints: JoinHint[];
  unmappedTerms: string[]; // 未能映射的术语
}

export interface MappedField {
  userTerm: string;        // 用户输入的术语
  dbField: string;         // 数据库字段名
  dbTable: string;         // 数据库表名
  fieldType: 'metric' | 'dimension' | 'filter';
  confidence: number;
}

export interface JoinHint {
  fromTable: string;
  toTable: string;
  joinCondition: string;
  joinType: 'INNER' | 'LEFT' | 'RIGHT';
}

/**
 * Clarification Agent 输出
 */
export interface ClarificationOutput {
  needsClarification: boolean;
  questions: ClarificationQuestion[];
}

export interface ClarificationQuestion {
  field: string;           // 缺失的字段
  question: string;        // 澄清问题
  options?: string[];      // 可选项
  type: 'select' | 'input' | 'date';
}

// ============================================
// 第 2 层：执行层 (Execution Layer)
// ============================================

/**
 * SQL Generator Agent 输出
 */
export interface SQLGeneratorOutput {
  sql: string;
  explanation: string;
  estimatedRows?: number;
  warnings?: string[];
}

/**
 * Validator Agent 输出
 */
export interface ValidatorOutput {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  fixedSQL?: string;       // 自动修正后的 SQL
}

export interface ValidationError {
  type: 'field_not_allowed' | 'sql_injection' | 'permission_denied' | 'syntax_error';
  field?: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  details?: Record<string, any>;
}

export interface ValidationWarning {
  type: 'performance' | 'deprecated' | 'ambiguous';
  message: string;
  suggestion?: string;
}

/**
 * Executor Agent 输出
 */
export interface ExecutorOutput {
  success: boolean;
  data: Record<string, any>[];
  rowCount: number;
  executionTime: number;
  truncated?: boolean;     // 是否被截断
  error?: string;
}

// ============================================
// 第 3 层：输出层 (Output Layer)
// ============================================

/**
 * Insight Agent 输出
 */
export interface InsightOutput {
  summary: string;
  insights: Insight[];
  anomalies?: Anomaly[];
  recommendations?: string[];
}

export interface Insight {
  type: 'trend' | 'comparison' | 'distribution' | 'correlation' | 'anomaly';
  title: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  supportingData?: Record<string, any>;
}

export interface Anomaly {
  field: string;
  value: any;
  expectedValue: any;
  deviation: number;       // 偏离程度（百分比）
  possibleReasons?: string[];
}

/**
 * Visualization Agent 输出
 */
export interface VisualizationOutput {
  chartType: ChartType;
  chartConfig: Record<string, any>;  // ECharts 配置
  alternatives?: AlternativeChart[];
  explanation: string;
}

export type ChartType = 
  | 'line'      // 折线图
  | 'bar'       // 柱状图
  | 'pie'       // 饼图
  | 'scatter'   // 散点图
  | 'radar'     // 雷达图
  | 'table'     // 表格
  | 'card';     // 指标卡

export interface AlternativeChart {
  chartType: ChartType;
  reason: string;          // 为什么推荐这个备选
}

// ============================================
// Agent 定义接口
// ============================================

/**
 * Agent 定义
 */
export interface AgentDefinition {
  name: string;
  description: string;
  version: string;
  layer: 'understanding' | 'execution' | 'output';
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  model?: string;          // 使用的 LLM 模型
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;     // 最大重试次数
  timeout?: number;        // 超时时间（毫秒）
  enableCache?: boolean;   // 是否启用缓存
}

/**
 * Agent 能力
 */
export interface AgentCapability {
  name: string;
  description: string;
  inputExample?: any;
  outputExample?: any;
}

/**
 * Agent 基础接口
 */
export interface BaseAgent<TInput = any, TOutput = any> {
  definition: AgentDefinition;
  config: AgentConfig;
  
  /**
   * 执行 Agent
   */
  execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
  
  /**
   * 失败重试
   */
  retry?(input: TInput, context: AgentContext, error: AgentError): Promise<AgentResult<TOutput>>;
  
  /**
   * 降级处理
   */
  fallback?(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
  
  /**
   * 获取能力描述
   */
  getCapabilities?(): AgentCapability[];
}

// ============================================
// 工作流类型
// ============================================

/**
 * 工作流节点
 */
export interface WorkflowNode {
  agentName: string;
  input: any;
  output?: any;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  error?: AgentError;
  metadata?: AgentMetadata;
}

/**
 * 工作流状态
 */
export interface WorkflowState {
  workflowId: string;
  query: string;
  nodes: WorkflowNode[];
  currentNode: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  startTime: Date;
  endTime?: Date;
  context: AgentContext;
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  name: string;
  description: string;
  nodes: WorkflowNodeDefinition[];
  onError: 'stop' | 'skip' | 'retry';
}

export interface WorkflowNodeDefinition {
  agentName: string;
  inputMapping: Record<string, string>;  // 输入映射
  condition?: string;  // 执行条件
  required: boolean;
}
