<template>
  <div class="progress-steps">
    <div
      v-for="(step, index) in steps"
      :key="index"
      class="step-item"
      :class="{
        active: index === currentStep,
        finished: step.status === 'finish',
        error: step.status === 'error'
      }"
    >
      <div class="step-connector" v-if="index > 0">
        <div class="connector-line" :class="{ active: index <= currentStep || step.status === 'finish' }"></div>
      </div>
      <div class="step-dot">
        <el-icon v-if="step.status === 'finish'" color="#67c23a"><Check /></el-icon>
        <el-icon v-else-if="step.status === 'error'" color="#f56c6c"><Close /></el-icon>
        <span v-else>{{ index + 1 }}</span>
      </div>
      <div class="step-content">
        <div class="step-title">{{ step.title }}</div>
        <div class="step-desc">{{ step.description }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check, Close } from '@element-plus/icons-vue';

export interface ProgressStep {
  title: string;
  description: string;
  status: 'wait' | 'process' | 'finish' | 'error';
}

defineProps<{
  steps: ProgressStep[];
  currentStep: number;
}>();
</script>

<style scoped>
.progress-steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: #fafafa;
  border-radius: 8px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  position: relative;
  opacity: 0.5;
  transition: all 0.3s;
}

.step-item.active {
  opacity: 1;
}

.step-item.finished {
  opacity: 1;
}

.step-item.error {
  opacity: 1;
}

.step-connector {
  position: absolute;
  left: 15px;
  top: 40px;
  width: 2px;
  height: calc(100% + 16px);
}

.connector-line {
  width: 100%;
  height: 100%;
  background: #e4e7ed;
  transition: background 0.3s;
}

.connector-line.active {
  background: #67c23a;
}

.step-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #909399;
  flex-shrink: 0;
  transition: all 0.3s;
  z-index: 1;
}

.step-item.active .step-dot {
  background: #409eff;
  color: white;
  animation: pulse 1.5s infinite;
}

.step-item.finished .step-dot {
  background: #67c23a;
  color: white;
}

.step-item.error .step-dot {
  background: #f56c6c;
  color: white;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(64, 158, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0);
  }
}

.step-content {
  margin-left: 16px;
  flex: 1;
  padding-top: 4px;
}

.step-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.step-item.active .step-title {
  color: #409eff;
}

.step-item.error .step-title {
  color: #f56c6c;
}

.step-desc {
  font-size: 13px;
  color: #909399;
}
</style>
