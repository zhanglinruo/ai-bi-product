<template>
  <div class="home">
    <div class="header">
      <h1>数答</h1>
      <p class="slogan">问数据，一句话，得答案</p>
      <div class="user-info" v-if="userStore.isLoggedIn">
        <span>欢迎，{{ userStore.userInfo?.username }}</span>
        <el-button type="danger" size="small" @click="handleLogout">退出</el-button>
      </div>
      <div class="user-info" v-else>
        <el-button type="primary" size="small" @click="$router.push('/login')">登录</el-button>
      </div>
    </div>

    <div class="main-content">
      <div class="query-box">
        <el-input
          v-model="question"
          type="textarea"
          :rows="3"
          placeholder="请输入你的问题，例如：上月华东区销售额是多少？"
          @keydown.enter.ctrl="handleQuery"
        />
        <el-button type="primary" size="large" :loading="loading" @click="handleQuery" class="query-btn">
          提问
        </el-button>
      </div>

      <div class="quick-actions">
        <el-button v-for="example in examples" :key="example" @click="question = example">
          {{ example }}
        </el-button>
      </div>

      <div v-if="loading" class="progress-section">
        <div class="progress-header">
          <span>执行进度</span>
          <span class="loading-text">处理中...</span>
        </div>
        <div class="steps-container">
          <div v-for="(step, index) in progressSteps" :key="index" class="step-item" :class="{ finished: index < currentStepIndex }">
            <div class="step-dot">
              <span v-if="index < currentStepIndex">✓</span>
              <span v-else>{{ index + 1 }}</span>
            </div>
            <div class="step-content">
              <div class="step-title">{{ step.title }}</div>
              <div class="step-desc">{{ step.description }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && result" class="result-section">
        <el-card>
          <template #header>
            <div class="result-header">
              <span>查询结果</span>
              <el-button type="primary" size="small" @click="handleSave">保存</el-button>
            </div>
          </template>
          <div v-if="result.type === 'analysis'" class="analysis-result">
            <el-alert v-if="result.template" :title="'分析模板: ' + result.template" type="info" :closable="false" style="margin-bottom: 15px" />
            <div v-for="(step, idx) in result.steps" :key="idx" class="step-result">
              <div class="step-title">{{ idx + 1 }}. {{ step.step }}</div>
              <div class="step-desc">{{ step.description }}</div>
              <div v-if="step.summary" class="step-summary">{{ step.summary }}</div>
              <el-table :data="step.data" style="width: 100%; margin-top: 10px" v-if="step.data && step.data.length > 0" size="small">
                <el-table-column v-for="(value, key) in step.data[0]" :key="key" :prop="String(key)" :label="String(key)" width="150" />
              </el-table>
            </div>
            <div v-if="result.finalReport" class="final-report">
              <h4>分析报告</h4>
              <div class="report-content">{{ result.finalReport }}</div>
            </div>
          </div>
          <template v-else>
            <div class="conclusion">{{ result.conclusion }}</div>
            <div class="chart-container" ref="chartRef"></div>
          </template>
        </el-card>
      </div>

      <div v-if="history.length" class="history-section">
        <h3>历史查询</h3>
        <el-timeline>
          <el-timeline-item v-for="item in history" :key="item.id" :timestamp="item.created_at" placement="top">
            <el-card @click="viewHistory(item)">
              <p>{{ item.question }}</p>
              <p class="conclusion-preview">{{ item.conclusion }}</p>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';
import { queryApi } from '../api';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

const router = useRouter();
const userStore = useUserStore();

const question = ref('');
const loading = ref(false);
const result = ref<any>(null);
const history = ref<any[]>([]);
const chartRef = ref<HTMLElement>();
const progressSteps = ref<any[]>([]);
const currentStepIndex = ref(0);

interface ProgressStep {
  title: string;
  description: string;
  status: 'wait' | 'process' | 'finish' | 'error';
}

const defaultSteps: ProgressStep[] = [
  { title: '语义理解', description: '解析用户问题，匹配语义层', status: 'wait' },
  { title: '模板匹配', description: '匹配分析模板或生成SQL', status: 'wait' },
  { title: 'SQL执行', description: '执行数据库查询', status: 'wait' },
  { title: '数据分析', description: '调用数据分析工具', status: 'wait' },
  { title: '报告生成', description: '生成分析结论', status: 'wait' }
];

const examples = [
  '本月销售额是多少？',
  '华东区销量排名',
  '同比增长最快的品类',
  '客户复购率分析'
];

onMounted(async () => {
  await userStore.fetchUserInfo();
  loadHistory();
});

async function loadHistory() {
  try {
    const res = await queryApi.getHistory(10);
    if (res.data.success) {
      history.value = res.data.data;
    }
  } catch (e) {
    console.error(e);
  }
}

async function handleQuery() {
  if (!question.value.trim()) return;
  if (!userStore.isLoggedIn) {
    router.push('/login');
    return;
  }

  const sessionId = generateId();
  let eventSource: EventSource | null = null;
  
  function connectProgressStream(sessionId: string) {
    if (eventSource) {
      eventSource.close();
    }
    
    const token = localStorage.getItem('token');
    eventSource = new EventSource(`http://localhost:3000/api/progress/stream/${sessionId}?token=${token}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[进度]', data);
        
        if (data.type === 'progress') {
          updateProgress(data.step, data.message, data.data);
        } else if (data.type === 'complete') {
          console.log('[进度] 任务完成');
        } else if (data.type === 'error') {
          ElMessage.error(data.error || '执行出错');
        }
      } catch (e) {
        console.error('[进度解析失败]', e);
      }
    };
    
    eventSource.onerror = () => {
      console.log('[进度] 连接断开');
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }
  
  function updateProgress(step: string, message: string, data?: any) {
    const stepMap: Record<string, number> = {
      'semantic': 0,
      'template': 1,
      'analysis': 1,
      'sql': 2,
      'entityFix': 2,
      'validate': 2,
      'execute': 3,
      'conclusion': 4,
      'complete': 5
    };
    
    const stepIndex = stepMap[step] ?? 0;
    
    for (let i = 0; i < progressSteps.value.length; i++) {
      if (i < stepIndex) {
        progressSteps.value[i].status = 'finish';
      } else if (i === stepIndex) {
        progressSteps.value[i].status = 'process';
        progressSteps.value[i].description = message;
      } else {
        progressSteps.value[i].status = 'wait';
      }
    }
    currentStepIndex.value = stepIndex;
    
    if (data?.currentStep && data?.totalSteps) {
      progressSteps.value[1].description = `${data.stepName} (${data.currentStep}/${data.totalSteps})`;
    }
  }

  loading.value = true;
  result.value = null;
  progressSteps.value = JSON.parse(JSON.stringify(defaultSteps));
  currentStepIndex.value = 0;
  
  connectProgressStream(sessionId);
  
  try {
    const res = await queryApi.execute(question.value, undefined, sessionId);
    
    if (eventSource) {
      setTimeout(() => {
        eventSource?.close();
        eventSource = null;
      }, 2000);
    }
    
    progressSteps.value.forEach(s => s.status = 'finish');
    currentStepIndex.value = progressSteps.value.length;
    
    if (res.data.success) {
      result.value = res.data.data;
      await nextTick();
      if (result.value.type !== 'analysis') {
        renderChart();
      }
      loadHistory();
    } else {
      ElMessage.warning(res.data.message || '查询无结果');
    }
  } catch (e: any) {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    console.error('查询失败:', e);
    ElMessage.error(e.response?.data?.message || e.message || '查询失败');
  } finally {
    loading.value = false;
  }
}

function renderChart() {
  if (!chartRef.value || !result.value?.result) return;
  const chart = echarts.init(chartRef.value);
  chart.setOption({
    tooltip: {},
    xAxis: { type: 'category', data: result.value.result.map((r: any) => r.name) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: result.value.result.map((r: any) => r.value) }]
  });
}

function handleSave() {
  ElMessage.success('保存成功');
}

function viewHistory(item: any) {
  result.value = item;
  question.value = item.question;
  nextTick(() => renderChart());
}

function handleLogout() {
  userStore.logout();
  ElMessage.success('已退出登录');
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.header {
  text-align: center;
  color: white;
  padding: 40px 0;
}

.header h1 {
  font-size: 48px;
  margin: 0;
}

.slogan {
  font-size: 18px;
  opacity: 0.9;
  margin-top: 10px;
}

.user-info {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: white;
}

.main-content {
  max-width: 800px;
  margin: 0 auto;
}

.query-box {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.query-btn {
  margin-top: 15px;
  width: 100%;
}

.quick-actions {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.result-section {
  margin-top: 30px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.conclusion {
  font-size: 16px;
  line-height: 1.8;
  color: #333;
  margin-bottom: 20px;
}

.chart-container {
  height: 300px;
}

.progress-section {
  margin-top: 30px;
  padding: 20px;
  background: #fafafa;
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  font-weight: 600;
  color: #333;
}

.loading-text {
  color: #409eff;
  font-weight: normal;
  font-size: 12px;
}

.steps-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-item {
  display: flex;
  align-items: center;
  opacity: 0.5;
  transition: opacity 0.3s;
}

.step-item.active {
  opacity: 1;
}

.step-item.finished {
  opacity: 1;
}

.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  margin-right: 12px;
  flex-shrink: 0;
}

.step-item.active .step-dot {
  background: #409eff;
}

.step-item.finished .step-dot {
  background: #67c23a;
}

.step-content {
  flex: 1;
}

.step-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.step-item.active .step-title {
  color: #409eff;
}

.step-desc {
  font-size: 12px;
  color: #909399;
}

.analysis-result {
  padding: 10px 0;
}

.step-result {
  padding: 12px;
  margin-bottom: 12px;
  background: #fafafa;
  border-radius: 4px;
  border-left: 3px solid #409eff;
}

.step-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}

.step-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.step-summary {
  padding: 8px;
  background: #ecf5ff;
  border-radius: 4px;
  font-size: 12px;
  color: #409eff;
  margin-bottom: 8px;
}

.final-report {
  margin-top: 15px;
  padding: 15px;
  background: #f0f9ff;
  border-radius: 4px;
  border: 1px solid #91d5ff;
}

.final-report h4 {
  margin: 0 0 10px 0;
  color: #1890ff;
}

.report-content {
  font-size: 14px;
  line-height: 1.6;
  color: #303133;
  white-space: pre-wrap;
}

.history-section {
  margin-top: 40px;
  color: white;
}
</style>
