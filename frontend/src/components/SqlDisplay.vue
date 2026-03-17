<template>
  <div class="sql-display">
    <div class="sql-header">
      <span class="sql-title">生成的 SQL</span>
      <div class="sql-actions">
        <el-tag v-if="explanation" size="small" type="info">{{ explanation }}</el-tag>
        <el-button size="small" text @click="copySQL">
          <el-icon><CopyDocument /></el-icon>
          复制
        </el-button>
      </div>
    </div>
    <div class="sql-content">
      <pre><code>{{ formattedSQL }}</code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument } from '@element-plus/icons-vue';

const props = defineProps<{
  sql: string;
  explanation?: string;
}>();

const formattedSQL = computed(() => {
  if (!props.sql) return '';
  // 简单格式化
  return props.sql
    .replace(/\s+/g, ' ')
    .replace(/SELECT/gi, 'SELECT\n  ')
    .replace(/FROM/gi, '\nFROM')
    .replace(/WHERE/gi, '\nWHERE')
    .replace(/GROUP BY/gi, '\nGROUP BY')
    .replace(/ORDER BY/gi, '\nORDER BY')
    .replace(/LIMIT/gi, '\nLIMIT')
    .replace(/JOIN/gi, '\nJOIN');
});

async function copySQL() {
  try {
    await navigator.clipboard.writeText(props.sql);
    ElMessage.success('已复制到剪贴板');
  } catch (error) {
    ElMessage.error('复制失败');
  }
}
</script>

<style scoped>
.sql-display {
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 20px;
}

.sql-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
}

.sql-title {
  color: #9cdcfe;
  font-weight: 500;
  font-size: 14px;
}

.sql-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sql-content {
  padding: 16px;
  overflow-x: auto;
}

.sql-content pre {
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.sql-content code {
  color: #d4d4d4;
}
</style>
