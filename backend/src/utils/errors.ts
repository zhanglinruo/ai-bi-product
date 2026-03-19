/**
 * 用户友好错误消息映射
 */

const ERROR_MESSAGES: Record<string, { user: string; hint?: string }> = {
  'TABLE_NOT_FOUND': {
    user: '数据表不存在，请检查数据源配置',
    hint: '可能原因：数据源未同步、表名变更或数据源已断开连接'
  },
  'COLUMN_NOT_FOUND': {
    user: '字段不存在，请检查查询条件',
    hint: '可能原因：字段名称拼写错误或该字段已被删除'
  },
  'SYNTAX_ERROR': {
    user: '查询语法有误，请稍后重试',
    hint: '如果问题持续存在，请联系管理员'
  },
  'CONNECTION_FAILED': {
    user: '数据库连接失败，请检查网络',
    hint: '可能原因：数据库服务暂不可用或网络问题'
  },
  'TIMEOUT': {
    user: '查询超时，请尝试缩小时间范围',
    hint: '建议：减少查询时间范围或选择更具体的数据源'
  },
  'PERMISSION_DENIED': {
    user: '暂无权限访问该数据',
    hint: '请申请数据访问权限或联系管理员'
  },
  'RATE_LIMIT': {
    user: '查询过于频繁，请稍后再试',
    hint: '建议：减少查询频率或升级服务套餐'
  },
  'INVALID_SQL': {
    user: '生成的查询语句有问题',
    hint: '请尝试用更简单的语言描述您的需求'
  },
  'EMPTY_RESULT': {
    user: '未找到相关数据',
    hint: '建议：调整时间范围或修改查询条件'
  },
  'MODEL_LOADING': {
    user: 'AI 模型正在加载中，请稍后重试',
    hint: '首次使用可能需要等待模型下载（133MB）'
  },
  'LLM_ERROR': {
    user: 'AI 服务暂时不可用，请稍后重试',
    hint: '如果问题持续存在，请联系管理员'
  },
  'SEMANTIC_ERROR': {
    user: '语义理解遇到问题',
    hint: '请尝试用更直接的方式描述您的需求'
  }
};

const ERROR_CODE_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /table.*doesn't exist/i, code: 'TABLE_NOT_FOUND' },
  { pattern: /table.*not found/i, code: 'TABLE_NOT_FOUND' },
  { pattern: /unknown column/i, code: 'COLUMN_NOT_FOUND' },
  { pattern: /column.*doesn't exist/i, code: 'COLUMN_NOT_FOUND' },
  { pattern: /syntax error/i, code: 'SYNTAX_ERROR' },
  { pattern: /connect.*timeout/i, code: 'TIMEOUT' },
  { pattern: /connection.*refused/i, code: 'CONNECTION_FAILED' },
  { pattern: /access denied/i, code: 'PERMISSION_DENIED' },
  { pattern: /rate limit/i, code: 'RATE_LIMIT' },
  { pattern: /403/i, code: 'PERMISSION_DENIED' },
  { pattern: /502|503|504/i, code: 'LLM_ERROR' },
  { pattern: /bge-small-zh|transformers|model/i, code: 'MODEL_LOADING' },
  { pattern: /embedding.*fail/i, code: 'MODEL_LOADING' },
];

export interface FriendlyError {
  userMessage: string;
  hint?: string;
  originalError?: string;
}

export function getFriendlyError(error: any): FriendlyError {
  const originalMessage = error?.message || String(error);

  for (const { pattern, code } of ERROR_CODE_PATTERNS) {
    if (pattern.test(originalMessage)) {
      const config = ERROR_MESSAGES[code];
      return {
        userMessage: config?.user || '查询遇到问题，请稍后重试',
        hint: config?.hint,
        originalError: originalMessage
      };
    }
  }

  if (originalMessage.includes('Agent "') && originalMessage.includes('未注册')) {
    return {
      userMessage: 'AI 服务尚未初始化，请稍后重试',
      hint: '如果长时间不可用，请重启服务',
      originalError: originalMessage
    };
  }

  if (originalMessage.includes('数据库连接池')) {
    return {
      userMessage: '数据库连接暂不可用',
      hint: '请稍后重试或联系管理员',
      originalError: originalMessage
    };
  }

  return {
    userMessage: '查询遇到问题，请稍后重试',
    hint: '如果问题持续存在，请联系管理员',
    originalError: originalMessage
  };
}

export function isUserFriendlyError(error: any): boolean {
  const friendly = getFriendlyError(error);
  return friendly.hint !== undefined;
}