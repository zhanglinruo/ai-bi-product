<template>
  <div class="chat-history">
    <div class="history-header">
      <span class="history-title">💬 对话历史</span>
      <el-button size="small" text @click="handleClear" v-if="messages.length > 0">
        清空
      </el-button>
    </div>
    
    <div class="history-messages" ref="messagesRef">
      <div v-if="messages.length === 0" class="empty-state">
        <span class="empty-icon">💭</span>
        <span class="empty-text">开始对话吧</span>
      </div>
      
      <ChatBubble
        v-for="(msg, idx) in messages"
        :key="idx"
        :id="String(idx)"
        :role="msg.role"
        :content="msg.content"
        :timestamp="msg.timestamp"
        :summary="msg.summary"
        :sql="msg.sql"
        :insights="msg.insights"
        :has-result="!!msg.result"
        @showDetail="handleShowDetail"
        @rerun="handleRerun"
      />
    </div>
    
    <!-- 追问提示 -->
    <div class="follow-up-hints" v-if="lastQuery && messages.length > 0">
      <span class="hint-label">追问：</span>
      <el-tag
        v-for="hint in followUpHints"
        :key="hint"
        class="hint-tag"
        @click="$emit('followUp', hint)"
      >
        {{ hint }}
      </el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import ChatBubble from './ChatBubble.vue';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  summary?: string;
  sql?: string;
  insights?: any[];
  result?: any;
}

interface Props {
  messages: ChatMessage[];
  lastQuery?: string;
}

const props = defineProps<Props>();
const emit = defineEmits(['clear', 'followUp', 'showDetail', 'rerun']);

const messagesRef = ref<HTMLElement>();

// 追问提示
const followUpHints = computed(() => {
  if (!props.lastQuery) return [];
  
  // 根据最后查询生成追问建议
  const hints: string[] = [];
  
  if (props.lastQuery.includes('销售额') || props.lastQuery.includes('订单')) {
    hints.push('按地区分组呢', '最近一个月趋势', '排名前10');
  } else if (props.lastQuery.includes('客户')) {
    hints.push('客户类型分布', '新增客户数', '客户价值排名');
  } else if (props.lastQuery.includes('产品')) {
    hints.push('产品分类统计', '库存情况', '销量排行');
  } else {
    hints.push('按时间趋势', '按地区分布', '详细数据');
  }
  
  return hints.slice(0, 3);
});

// 自动滚动到底部
watch(() => props.messages.length, async () => {
  await nextTick();
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  }
});

function handleClear() {
  emit('clear');
}

function handleShowDetail(id: string) {
  emit('showDetail', id);
}

function handleRerun(id: string) {
  const idx = parseInt(id);
  const msg = props.messages[idx];
  if (msg && msg.role === 'user') {
    emit('rerun', msg.content);
  }
}
</script>

<style scoped>
.chat-history {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}

.history-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.history-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
}

.follow-up-hints {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
  flex-wrap: wrap;
}

.hint-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.hint-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.hint-tag:hover {
  background-color: var(--primary-color);
  color: white;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .history-header {
    padding: 10px 12px;
  }
  
  .history-messages {
    padding: 12px;
  }
  
  .follow-up-hints {
    padding: 10px 12px;
  }
}
</style>
