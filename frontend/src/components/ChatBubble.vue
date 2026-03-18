<template>
  <div class="chat-bubble" :class="[role, { 'with-result': hasResult }]">
    <div class="bubble-avatar">
      <span v-if="role === 'user'">👤</span>
      <span v-else>🤖</span>
    </div>
    <div class="bubble-content">
      <div class="bubble-header">
        <span class="bubble-role">{{ role === 'user' ? '我' : '数答' }}</span>
        <span class="bubble-time">{{ formatTime(timestamp) }}</span>
      </div>
      
      <!-- 用户消息 -->
      <div v-if="role === 'user'" class="bubble-text">
        {{ content }}
      </div>
      
      <!-- 助手消息 -->
      <div v-else class="bubble-response">
        <!-- 总结 -->
        <div class="response-summary" v-if="summary">
          {{ summary }}
        </div>
        
        <!-- SQL（可折叠） -->
        <div class="response-sql" v-if="sql">
          <div class="sql-toggle" @click="showSQL = !showSQL">
            <span>{{ showSQL ? '▼' : '▶' }}</span>
            <span>SQL</span>
          </div>
          <pre v-if="showSQL" class="sql-code">{{ sql }}</pre>
        </div>
        
        <!-- 洞察 -->
        <div class="response-insights" v-if="insights && insights.length > 0">
          <div v-for="(insight, idx) in insights" :key="idx" class="insight-item">
            <span class="insight-icon">{{ insight.importance === 'high' ? '⚠️' : '💡' }}</span>
            <span>{{ insight.description }}</span>
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <div class="response-actions" v-if="hasResult">
          <el-button size="small" text @click="$emit('showDetail', id)">
            查看详情
          </el-button>
          <el-button size="small" text @click="$emit('rerun', id)">
            重新执行
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface Props {
  id?: string;
  role: 'user' | 'assistant';
  content?: string;
  timestamp: Date | string;
  summary?: string;
  sql?: string;
  insights?: any[];
  hasResult?: boolean;
}

const props = defineProps<Props>();
defineEmits(['showDetail', 'rerun']);

const showSQL = ref(false);

function formatTime(time: Date | string): string {
  const date = typeof time === 'string' ? new Date(time) : time;
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.chat-bubble {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-bubble.user {
  flex-direction: row-reverse;
}

.bubble-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.chat-bubble.user .bubble-avatar {
  background: var(--primary-color);
}

.bubble-content {
  flex: 1;
  max-width: 80%;
}

.chat-bubble.user .bubble-content {
  align-items: flex-end;
}

.bubble-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.chat-bubble.user .bubble-header {
  flex-direction: row-reverse;
}

.bubble-role {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.bubble-time {
  font-size: 11px;
  color: var(--info-color);
}

.bubble-text {
  background: var(--primary-color);
  color: white;
  padding: 12px 16px;
  border-radius: 16px;
  border-bottom-right-radius: 4px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.chat-bubble.user .bubble-text {
  border-bottom-right-radius: 16px;
  border-bottom-left-radius: 4px;
}

.bubble-response {
  background: var(--bg-card);
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.response-summary {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
  margin-bottom: 12px;
}

.response-sql {
  margin-bottom: 12px;
}

.sql-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 0;
}

.sql-toggle:hover {
  color: var(--primary-color);
}

.sql-code {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 10px;
  border-radius: 8px;
  font-family: 'Consolas', monospace;
  font-size: 11px;
  overflow-x: auto;
  margin-top: 8px;
}

.response-insights {
  margin-bottom: 12px;
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  background: var(--bg-color);
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.insight-icon {
  flex-shrink: 0;
}

.response-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .bubble-content {
    max-width: 90%;
  }
  
  .bubble-text {
    padding: 10px 14px;
    font-size: 13px;
  }
  
  .bubble-response {
    padding: 12px;
  }
  
  .response-summary {
    font-size: 13px;
  }
  
  .sql-code {
    font-size: 10px;
    padding: 8px;
  }
}
</style>
