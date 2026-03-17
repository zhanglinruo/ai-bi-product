/**
 * 会话上下文管理器
 * 
 * 管理对话历史和上下文，支持多轮对话
 */

export interface ConversationContext {
  sessionId: string;
  userId: string;
  messages: ConversationMessage[];
  entities?: any;  // 上一次提取的实体
  sql?: string;    // 上一次执行的 SQL
  result?: any;    // 上一次的结果
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  entities?: any;
  sql?: string;
  result?: any;
}

/**
 * 会话上下文管理器
 */
export class ContextManager {
  private sessions: Map<string, ConversationContext> = new Map();
  private maxSessions: number = 1000;
  private sessionTimeout: number = 30 * 60 * 1000; // 30 分钟
  
  /**
   * 获取或创建会话
   */
  getOrCreate(sessionId: string, userId: string): ConversationContext {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = {
        sessionId,
        userId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.sessions.set(sessionId, session);
    }
    
    // 更新时间
    session.updatedAt = new Date();
    
    // 清理过期会话
    this.cleanupExpiredSessions();
    
    return session;
  }
  
  /**
   * 添加消息
   */
  addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: { entities?: any; sql?: string; result?: any }
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const message: ConversationMessage = {
      role,
      content,
      timestamp: new Date(),
      ...metadata,
    };
    
    session.messages.push(message);
    session.updatedAt = new Date();
    
    // 保存上一次的实体和结果
    if (role === 'assistant' && metadata) {
      if (metadata.entities) session.entities = metadata.entities;
      if (metadata.sql) session.sql = metadata.sql;
      if (metadata.result) session.result = metadata.result;
    }
    
    // 限制消息数量
    if (session.messages.length > 50) {
      session.messages = session.messages.slice(-50);
    }
  }
  
  /**
   * 获取最近的消息
   */
  getRecentMessages(sessionId: string, count: number = 5): ConversationMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    
    return session.messages.slice(-count);
  }
  
  /**
   * 获取上一次的实体
   */
  getPreviousEntities(sessionId: string): any | null {
    const session = this.sessions.get(sessionId);
    return session?.entities || null;
  }
  
  /**
   * 获取上一次的 SQL
   */
  getPreviousSQL(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    return session?.sql || null;
  }
  
  /**
   * 检查是否是追问
   */
  isFollowUp(query: string): boolean {
    const followUpPatterns = [
      /^(那|那么|还有|另外|再|继续|然后)/,
      /(呢|怎么样|如何)$/,
      /^(其中|里面)/,
      /^(按|按照)/,
      /^(筛选|过滤|只要)/,
      /(更详细|详细|具体)/,
    ];
    
    return followUpPatterns.some(p => p.test(query));
  }
  
  /**
   * 合并追问实体
   */
  mergeFollowUpEntities(
    previousEntities: any,
    currentEntities: any
  ): any {
    if (!previousEntities) return currentEntities;
    
    const merged = { ...previousEntities };
    
    // 合并指标
    if (currentEntities.metrics?.length > 0) {
      merged.metrics = currentEntities.metrics;
    }
    
    // 合并维度
    if (currentEntities.dimensions?.length > 0) {
      merged.dimensions = currentEntities.dimensions;
    }
    
    // 合并筛选条件
    merged.filters = {
      ...merged.filters,
      ...currentEntities.filters,
    };
    
    // 合并 GROUP BY
    if (currentEntities.groupBy?.length > 0) {
      merged.groupBy = currentEntities.groupBy;
    }
    
    // 合并时间范围
    if (currentEntities.timeRange) {
      merged.timeRange = currentEntities.timeRange;
    }
    
    // 合并排序
    if (currentEntities.orderBy) {
      merged.orderBy = currentEntities.orderBy;
    }
    
    // 合并 LIMIT
    if (currentEntities.limit && currentEntities.limit !== 100) {
      merged.limit = currentEntities.limit;
    }
    
    return merged;
  }
  
  /**
   * 清理过期会话
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.updatedAt.getTime() > this.sessionTimeout) {
        this.sessions.delete(sessionId);
      }
    }
    
    // 如果会话数超过上限，删除最旧的
    if (this.sessions.size > this.maxSessions) {
      const sortedSessions = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].updatedAt.getTime() - b[1].updatedAt.getTime());
      
      const toDelete = sortedSessions.slice(0, this.sessions.size - this.maxSessions);
      for (const [sessionId] of toDelete) {
        this.sessions.delete(sessionId);
      }
    }
  }
  
  /**
   * 清除会话
   */
  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
  
  /**
   * 获取会话统计
   */
  getStats(): { totalSessions: number; activeSessions: number } {
    const now = Date.now();
    let activeCount = 0;
    
    for (const session of this.sessions.values()) {
      if (now - session.updatedAt.getTime() < 5 * 60 * 1000) { // 5 分钟内活跃
        activeCount++;
      }
    }
    
    return {
      totalSessions: this.sessions.size,
      activeSessions: activeCount,
    };
  }
}

// 单例
export const contextManager = new ContextManager();
