<template>
  <div class="app-container" :class="{ 'dark-mode': isDarkMode }">
    <!-- 导航栏 -->
    <nav class="nav-bar" v-if="isLoggedIn">
      <div class="nav-brand">
        <span class="brand-icon">📊</span>
        <span class="brand-text">数答</span>
      </div>
      <div class="nav-links">
        <router-link to="/" class="nav-link">首页</router-link>
        <router-link to="/query" class="nav-link">查询</router-link>
        <router-link to="/datasources" class="nav-link">数据源</router-link>
      </div>
      <div class="nav-actions">
        <el-switch v-model="isDarkMode" active-text="🌙" inactive-text="☀️" />
        <el-dropdown trigger="click">
          <span class="user-info">
            <el-avatar :size="32">{{ userInitial }}</el-avatar>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item>{{ userName }}</el-dropdown-item>
              <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </nav>
    
    <!-- 主内容 -->
    <main class="main-content">
      <router-view />
    </main>
    
    <!-- 移动端底部导航 -->
    <nav class="mobile-nav" v-if="isLoggedIn && isMobile">
      <router-link to="/" class="mobile-nav-item">
        <span class="nav-icon">🏠</span>
        <span class="nav-label">首页</span>
      </router-link>
      <router-link to="/query" class="mobile-nav-item">
        <span class="nav-icon">🔍</span>
        <span class="nav-label">查询</span>
      </router-link>
      <router-link to="/datasources" class="mobile-nav-item">
        <span class="nav-icon">💾</span>
        <span class="nav-label">数据源</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from './stores/user';

const router = useRouter();
const userStore = useUserStore();

const isDarkMode = ref(false);
const windowWidth = ref(window.innerWidth);

const isLoggedIn = computed(() => userStore.isLoggedIn);
const userName = computed(() => userStore.userInfo?.username || '用户');
const userInitial = computed(() => userName.value.charAt(0).toUpperCase());
const isMobile = computed(() => windowWidth.value < 768);

// 检查本地存储的深色模式设置
onMounted(() => {
  const savedDarkMode = localStorage.getItem('darkMode');
  if (savedDarkMode) {
    isDarkMode.value = savedDarkMode === 'true';
  }
  
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

function handleResize() {
  windowWidth.value = window.innerWidth;
}

function handleLogout() {
  userStore.logout();
  router.push('/login');
}

// 监听深色模式变化
function watchDarkMode() {
  localStorage.setItem('darkMode', String(isDarkMode.value));
}
</script>

<style>
:root {
  --primary-color: #409eff;
  --primary-dark: #337ecc;
  --success-color: #67c23a;
  --warning-color: #e6a23c;
  --danger-color: #f56c6c;
  --info-color: #909399;
  
  --bg-color: #f5f7fa;
  --bg-card: #ffffff;
  --text-color: #303133;
  --text-secondary: #606266;
  --border-color: #dcdfe6;
  
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
  
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  
  --transition: all 0.3s ease;
}

/* 深色模式变量 */
.dark-mode {
  --bg-color: #1a1a2e;
  --bg-card: #16213e;
  --text-color: #e8e8e8;
  --text-secondary: #a0a0a0;
  --border-color: #2a2a4a;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-color);
  transition: var(--transition);
}

.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 导航栏 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 60px;
  background-color: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--primary-color);
}

.brand-icon {
  font-size: 24px;
}

.nav-links {
  display: flex;
  gap: 24px;
}

.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  transition: var(--transition);
}

.nav-link:hover,
.nav-link.router-link-active {
  color: var(--primary-color);
  background-color: rgba(64, 158, 255, 0.1);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  cursor: pointer;
}

/* 主内容 */
.main-content {
  flex: 1;
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* 移动端底部导航 */
.mobile-nav {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--bg-card);
  border-top: 1px solid var(--border-color);
  padding: 8px 0;
  z-index: 100;
}

.mobile-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 8px;
  flex: 1;
  transition: var(--transition);
}

.mobile-nav-item.router-link-active {
  color: var(--primary-color);
}

.nav-icon {
  font-size: 20px;
}

.nav-label {
  font-size: 12px;
}

/* 响应式 */
@media (max-width: 768px) {
  .nav-bar {
    padding: 0 16px;
  }
  
  .nav-links {
    display: none;
  }
  
  .main-content {
    padding: 16px;
    padding-bottom: 80px;
  }
  
  .mobile-nav {
    display: flex;
  }
}

/* 加载动画 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loading-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

/* 卡片样式 */
.card {
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 20px;
  transition: var(--transition);
}

.card:hover {
  box-shadow: var(--shadow-lg);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.empty-state-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state-title {
  font-size: 18px;
  margin-bottom: 8px;
  color: var(--text-color);
}

.empty-state-desc {
  font-size: 14px;
}
</style>
