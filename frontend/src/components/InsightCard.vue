<template>
  <div class="insight-card" :class="`insight-${insight.importance}`">
    <div class="insight-icon">
      <span v-if="insight.importance === 'high'">⚠️</span>
      <span v-else-if="insight.importance === 'medium'">📊</span>
      <span v-else>💡</span>
    </div>
    <div class="insight-content">
      <h4 class="insight-title">{{ insight.title }}</h4>
      <p class="insight-description">{{ insight.description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface Insight {
  type: string;
  title: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
}

defineProps<{
  insight: Insight;
}>();
</script>

<style scoped>
.insight-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 0.3s;
}

.insight-high {
  background: #fef0f0;
  border-left: 4px solid #f56c6c;
}

.insight-medium {
  background: #fdf6ec;
  border-left: 4px solid #e6a23c;
}

.insight-low {
  background: #f0f9ff;
  border-left: 4px solid #409eff;
}

.insight-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.insight-content {
  flex: 1;
}

.insight-title {
  margin: 0 0 8px 0;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.insight-description {
  margin: 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
}
</style>
