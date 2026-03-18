<template>
  <div class="home-view">
    <!-- 欢迎区域 -->
    <div class="welcome-section">
      <div class="welcome-icon">📊</div>
      <h1 class="welcome-title">你好，{{ userName }}！</h1>
      <p class="welcome-subtitle">今天想了解什么数据？</p>
    </div>
    
    <!-- 快捷查询输入 -->
    <div class="quick-query card">
      <el-input
        v-model="queryText"
        type="textarea"
        :rows="2"
        placeholder="输入你的问题，例如：本月销售额是多少？按地区统计订单量..."
        @keydown.enter.ctrl="handleQuery"
        class="query-input"
      />
      <div class="query-actions">
        <span class="query-tip">Ctrl + Enter 发送</span>
        <el-button type="primary" :loading="loading" @click="handleQuery">
          <span v-if="!loading">🚀 提问</span>
          <span v-else>处理中...</span>
        </el-button>
      </div>
    </div>
    
    <!-- 快捷指令 -->
    <div class="shortcuts-section">
      <h3 class="section-title">快捷查询</h3>
      <div class="shortcuts-grid">
        <div
          v-for="shortcut in shortcuts"
          :key="shortcut.id"
          class="shortcut-card card"
          @click="handleShortcut(shortcut)"
        >
          <span class="shortcut-icon">{{ shortcut.icon }}</span>
          <span class="shortcut-text">{{ shortcut.text }}</span>
        </div>
      </div>
    </div>
    
    <!-- 最近查询 -->
    <div class="history-section" v-if="recentQueries.length > 0">
      <h3 class="section-title">最近查询</h3>
      <div class="history-list">
        <div
          v-for="item in recentQueries"
          :key="item.id"
          class="history-item card"
          @click="handleHistoryClick(item)"
        >
          <div class="history-query">{{ item.query_text }}</div>
          <div class="history-time">{{ formatTime(item.created_at) }}</div>
        </div>
      </div>
    </div>
    
    <!-- 空状态 -->
    <div class="empty-state" v-if="!loading && recentQueries.length === 0">
      <div class="empty-icon">💬</div>
      <div class="empty-title">开始你的第一次查询</div>
      <div class="empty-desc">输入问题或点击上方快捷指令</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';
import { historyApi } from '../api';
import { ElMessage } from 'element-plus';

const router = useRouter();
const userStore = useUserStore();

const queryText = ref('');
const loading = ref(false);
const recentQueries = ref<any[]>([]);

const userName = computed(() => userStore.userInfo?.username || '用户');

const shortcuts = [
  { id: 1, icon: '💰', text: '本月销售额' },
  { id: 2, icon: '📦', text: '订单量统计' },
  { id: 3, icon: '👥', text: '客户分布' },
  { id: 4, icon: '📈', text: '销售趋势' },
  { id: 5, icon: '🏆', text: '销售排行' },
  { id: 6, icon: '📍', text: '地区分析' },
];

onMounted(async () => {
  await loadRecentQueries();
});

async function loadRecentQueries() {
  try {
    const res = await historyApi.getList(5);
    if (res.data.success) {
      recentQueries.value = res.data.data;
    }
  } catch (e) {
    console.error('加载历史失败', e);
  }
}

function handleQuery() {
  if (!queryText.value.trim()) {
    ElMessage.warning('请输入问题');
    return;
  }
  
  // 跳转到查询页面
  router.push({
    path: '/query',
    query: { q: queryText.value }
  });
}

function handleShortcut(shortcut: any) {
  router.push({
    path: '/query',
    query: { q: shortcut.text }
  });
}

function handleHistoryClick(item: any) {
  router.push({
    path: '/query',
    query: { q: item.query_text }
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return date.toLocaleDateString();
}
</script>

<style scoped>
.home-view {
  max-width: 800px;
  margin: 0 auto;
}

.welcome-section {
  text-align: center;
  padding: 40px 0;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px 0;
}

.welcome-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.quick-query {
  margin-bottom: 32px;
}

.query-input :deep(.el-textarea__inner) {
  font-size: 16px;
  border: none;
  background: transparent;
  resize: none;
}

.query-input :deep(.el-textarea__inner):focus {
  box-shadow: none;
}

.query-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.query-tip {
  font-size: 12px;
  color: var(--text-secondary);
}

.shortcuts-section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 16px 0;
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.shortcut-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.shortcut-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

.shortcut-icon {
  font-size: 32px;
}

.shortcut-text {
  font-size: 14px;
  color: var(--text-secondary);
}

.history-section {
  margin-bottom: 32px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.history-item:hover {
  background-color: rgba(64, 158, 255, 0.05);
}

.history-query {
  font-size: 14px;
  color: var(--text-color);
  margin-bottom: 4px;
}

.history-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-title {
  font-size: 18px;
  color: var(--text-color);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 14px;
  color: var(--text-secondary);
}

/* 响应式 */
@media (max-width: 768px) {
  .shortcuts-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .welcome-icon {
    font-size: 48px;
  }
  
  .welcome-title {
    font-size: 24px;
  }
}
</style>
