<template>
  <div class="query-container">
    <div class="header">
      <h2>数据查询</h2>
      <el-button @click="$router.push('/')">返回首页</el-button>
    </div>

    <el-card>
      <div class="query-area">
        <el-input
          v-model="question"
          type="textarea"
          :rows="4"
          placeholder="请输入你的问题... (Ctrl+Enter 发送)"
          @keydown.enter.ctrl="handleQuery"
        />
        
        <!-- 查询建议 -->
        <div class="suggestions" v-if="showSuggestions && suggestions.length > 0">
          <span class="suggestions-label">建议：</span>
          <el-tag
            v-for="sug in suggestions"
            :key="sug"
            class="suggestion-tag"
            @click="question = sug; showSuggestions = false"
          >
            {{ sug }}
          </el-tag>
        </div>
        
        <div class="query-actions">
          <el-select v-model="datasourceId" placeholder="选择数据源" clearable style="width: 200px">
            <el-option v-for="ds in datasources" :key="ds.id" :label="ds.name" :value="ds.id" />
          </el-select>
          <el-button type="primary" :loading="loading" @click="handleQuery">
            查询 (Ctrl+Enter)
          </el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 快捷指令面板 -->
    <div class="quick-commands">
      <el-tag
        v-for="cmd in quickCommands"
        :key="cmd"
        class="command-tag"
        @click="question = cmd"
      >
        {{ cmd }}
      </el-tag>
    </div>

    <el-card v-if="loading || progressSteps.length > 0" class="progress-card">
      <template #header>
        <div class="progress-header">
          <span>执行进度</span>
          <el-tag :type="loading ? 'warning' : 'success'">{{ loading ? '执行中' : '已完成' }}</el-tag>
        </div>
      </template>
      <div class="steps-container">
        <div v-for="(step, index) in progressSteps" :key="index" class="step-item" :class="{ active: index === currentStepIndex, finished: step.status === 'finish' }">
          <div class="step-dot">
            <span v-if="step.status === 'finish'">✓</span>
            <span v-else>{{ index + 1 }}</span>
          </div>
          <div class="step-content">
            <div class="step-title">{{ step.title }}</div>
            <div class="step-desc">{{ step.description }}</div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card v-if="result" class="result-card">
      <template #header>
        <div class="result-header">
          <span>查询结果</span>
          <div>
            <el-button size="small" @click="handleExport">导出</el-button>
            <el-button size="small" type="primary" @click="handleSave">保存</el-button>
          </div>
        </div>
      </template>
      
      <!-- SQL 展示 -->
      <div v-if="result.sql" class="sql-section">
        <div class="sql-header">
          <span>生成的 SQL</span>
          <el-tag size="small" type="info">{{ result.sqlExplanation }}</el-tag>
        </div>
        <pre class="sql-code">{{ result.sql }}</pre>
      </div>
      
      <!-- 结论 -->
      <div class="conclusion">{{ result.conclusion }}</div>
      
      <!-- 洞察 -->
      <div v-if="result.insights && result.insights.length > 0" class="insights-section">
        <h4>数据洞察</h4>
        <el-alert
          v-for="(insight, idx) in result.insights"
          :key="idx"
          :title="insight.title"
          :description="insight.description"
          :type="insight.importance === 'high' ? 'warning' : 'info'"
          show-icon
          style="margin-bottom: 10px"
        />
      </div>
      
      <!-- 图表 -->
      <div class="chart-wrapper" ref="chartRef"></div>
      
      <!-- 数据表格 -->
      <el-table :data="result.result" style="width: 100%; margin-top: 20px" v-if="result.result && result.result.length > 0">
        <el-table-column v-for="(value, key) in result.result[0]" :key="key" :prop="String(key)" :label="String(key)" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { datasourceApi, agentApi, historyApi } from '../api';
import * as echarts from 'echarts';
import { ElMessage, ElMessageBox } from 'element-plus';

interface ProgressStep {
  title: string;
  description: string;
  status: 'wait' | 'process' | 'finish' | 'error';
}

interface HistoryItem {
  id: string;
  query_text: string;
  sql: string;
  result_summary: string;
  row_count: number;
  execution_time: number;
  is_favorite: boolean;
  created_at: string;
}

const router = useRouter();
const route = useRoute();
const question = ref('');
const datasourceId = ref('');
const loading = ref(false);
const result = ref<any>(null);
const datasources = ref<any[]>([]);
const chartRef = ref<HTMLElement>();
const progressSteps = ref<ProgressStep[]>([]);
const currentStepIndex = ref(0);
const historyList = ref<HistoryItem[]>([]);
const showHistory = ref(false);

// 查询建议
const showSuggestions = ref(false);
const suggestions = ref<string[]>([]);

// 快捷指令
const quickCommands = [
  '本月销售额',
  '按地区统计订单量',
  '最近一个月的销售趋势',
  '客户类型分布',
  '销售排行前10',
  '同比增长分析',
];

const defaultSteps: ProgressStep[] = [
  { title: 'NLU 分析', description: '理解用户意图，提取关键实体', status: 'wait' },
  { title: '语义匹配', description: '映射业务术语到数据库字段', status: 'wait' },
  { title: 'SQL 生成', description: '生成符合规范的 SQL 查询', status: 'wait' },
  { title: 'SQL 校验', description: '校验 SQL 安全性', status: 'wait' },
  { title: '执行查询', description: '执行数据库查询', status: 'wait' },
  { title: '洞察分析', description: '分析数据，生成洞察', status: 'wait' },
  { title: '可视化', description: '生成图表配置', status: 'wait' }
];

onMounted(async () => {
  const res = await datasourceApi.getList();
  if (res.data.success) {
    datasources.value = res.data.data.filter((ds: any) => ds.status === 'active');
  }
  loadHistory();
  
  // 从 URL 参数获取查询
  if (route.query.q) {
    question.value = route.query.q as string;
    handleQuery();
  }
  
  // 键盘快捷键
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

// 监听输入变化，显示建议
watch(question, (val) => {
  if (val.length > 0 && val.length < 10) {
    showSuggestions.value = true;
    // 简单的建议逻辑
    const keywords = ['销售', '订单', '客户', '产品', '地区', '时间'];
    const matched = keywords.filter(k => val.includes(k));
    if (matched.length > 0) {
      suggestions.value = [
        `${matched[0]}额统计`,
        `按${matched[0]}分类`,
        `${matched[0]}趋势分析`,
      ];
    } else {
      suggestions.value = ['销售额统计', '订单量排名', '客户分布'];
    }
  } else {
    showSuggestions.value = false;
  }
});

function handleKeydown(e: KeyboardEvent) {
  // Ctrl+Enter 发送
  if (e.ctrlKey && e.key === 'Enter') {
    handleQuery();
  }
  // Escape 清空
  if (e.key === 'Escape') {
    question.value = '';
    result.value = null;
  }
}

async function loadHistory() {
  try {
    const res = await historyApi.getList(10);
    if (res.data.success) {
      historyList.value = res.data.data;
    }
  } catch (e) {
    console.error('加载历史失败', e);
  }
}

function useHistory(item: HistoryItem) {
  question.value = item.query_text;
  showHistory.value = false;
}

async function handleQuery() {
  if (!question.value.trim()) return;
  loading.value = true;
  result.value = null;
  progressSteps.value = JSON.parse(JSON.stringify(defaultSteps));
  currentStepIndex.value = 0;
  
  const startTime = Date.now();
  
  try {
    // 使用 Agent API
    progressSteps.value[0].status = 'process';
    
    const res = await agentApi.query(question.value, datasourceId.value || undefined);
    
    if (res.data.success) {
      // 标记所有步骤完成
      progressSteps.value.forEach((s, i) => {
        s.status = 'finish';
      });
      currentStepIndex.value = progressSteps.value.length;
      
      // 处理返回结果
      const data = res.data.data;
      
      result.value = {
        conclusion: data.summary || '查询完成',
        result: data.data || [],
        chartType: data.chartType || 'bar',
        sql: data.sql,
        sqlExplanation: data.sqlExplanation,
        insights: data.insights || [],
        chartConfig: data.chartConfig,
      };
      
      // 保存历史
      await historyApi.save({
        query_text: question.value,
        sql: data.sql,
        result_summary: data.summary,
        row_count: data.rowCount || (data.data?.length || 0),
        execution_time: Date.now() - startTime,
      });
      
      await nextTick();
      if (result.value.result && result.value.result.length > 0) {
        setTimeout(() => renderChart(), 100);
      }
      
      loadHistory();
    } else {
      // 处理错误
      const errorMsg = res.data.errors?.[0]?.message || '查询失败';
      ElMessage.error(errorMsg);
      
      // 标记失败步骤
      progressSteps.value.forEach((s, i) => {
        if (s.status === 'process') s.status = 'error';
      });
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || e.message || '查询失败');
    progressSteps.value.forEach((s, i) => {
      if (s.status === 'process') s.status = 'error';
    });
  } finally {
    loading.value = false;
  }
}

function renderChart() {
  if (!chartRef.value || !result.value?.result || result.value.result.length === 0) return;
  
  const chart = echarts.init(chartRef.value);
  const data = result.value.result;
  const chartType = result.value.chartType || 'bar';
  
  const keys = Object.keys(data[0]);
  const xField = keys.find(k => ['name', 'province', 'city', 'hospital_name', 'manufacturer', 'corporate_group', 'product_name', 'generic_name', 'customer_type', 'category'].includes(k.toLowerCase())) || keys[0];
  const yField = keys.find(k => ['value', 'amount', 'quantity', 'total', 'sum', 'ratio', 'sales'].includes(k.toLowerCase())) || keys[1];
  
  const xData = data.map((r: any) => r[xField]);
  const yData = data.map((r: any) => parseFloat(r[yField]) || 0);
  
  let option: any = {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: xData },
    yAxis: { type: 'value' }
  };
  
  if (chartType === 'line') {
    option.series = [{ type: 'line', data: yData, itemStyle: { color: '#67c23a' }, smooth: true }];
  } else if (chartType === 'pie') {
    option = {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: '60%',
        data: data.map((r: any, i: number) => ({ name: r[xField], value: parseFloat(r[yField]) || 0 })),
        itemStyle: { color: (params: any) => ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#c71585', '#ff8c00'][params.dataIndex % 7] }
      }]
    };
  } else {
    option.series = [{ type: 'bar', data: yData, itemStyle: { color: '#409eff' } }];
  }
  
  chart.setOption(option);
}

function handleExport() {
  if (!result.value?.result || result.value.result.length === 0) {
    ElMessage.warning('没有可导出的数据');
    return;
  }
  
  // 弹出选择框
  ElMessageBox.confirm('请选择导出格式', '导出数据', {
    distinguishCancelAndClose: true,
    confirmButtonText: 'Excel',
    cancelButtonText: 'CSV',
  }).then(() => {
    // Excel 导出
    exportToExcel();
  }).catch((action: string) => {
    if (action === 'cancel') {
      // CSV 导出
      exportToCSV();
    }
  });
}

function exportToCSV() {
  const data = result.value.result;
  const keys = Object.keys(data[0]);
  
  let csv = keys.join(',') + '\n';
  data.forEach((row: any) => {
    csv += keys.map(k => {
      const val = row[k];
      if (typeof val === 'string' && val.includes(',')) {
        return `"${val}"`;
      }
      return val;
    }).join(',') + '\n';
  });
  
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `query_result_${new Date().toISOString().slice(0, 10)}.csv`);
  ElMessage.success('CSV 导出成功');
}

async function exportToExcel() {
  try {
    const data = result.value.result;
    const response = await fetch('http://localhost:3000/api/export/excel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        data,
        filename: `query_result_${new Date().toISOString().slice(0, 10)}`,
        sheetName: '查询结果',
      }),
    });
    
    if (!response.ok) {
      throw new Error('导出失败');
    }
    
    const blob = await response.blob();
    downloadBlob(blob, `query_result_${new Date().toISOString().slice(0, 10)}.xlsx`);
    ElMessage.success('Excel 导出成功');
  } catch (e) {
    ElMessage.error('Excel 导出失败');
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleSave() {
  if (!result.value) {
    ElMessage.warning('没有可保存的结果');
    return;
  }
  
  try {
    await historyApi.save({
      query_text: question.value,
      sql: result.value.sql,
      result_summary: result.value.conclusion,
      row_count: result.value.result?.length || 0,
      execution_time: 0,
    });
    
    ElMessage.success('已保存到历史记录');
    loadHistory();
  } catch (e) {
    ElMessage.error('保存失败');
  }
}
</script>

<style scoped>
.query-container {
  padding: 20px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.query-area {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.query-actions {
  display: flex;
  gap: 10px;
}

/* 查询建议 */
.suggestions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.suggestions-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.suggestion-tag {
  cursor: pointer;
  transition: all 0.2s;
}
.suggestion-tag:hover {
  background-color: var(--primary-color);
  color: white;
}

/* 快捷指令 */
.quick-commands {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 16px 0;
}
.command-tag {
  cursor: pointer;
  transition: all 0.2s;
}
.command-tag:hover {
  background-color: var(--primary-color);
  color: white;
}

.progress-card {
  margin-top: 20px;
}
.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.steps-container {
  padding: 10px 0;
}
.step-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 20px;
  opacity: 0.6;
}
.step-item.active {
  opacity: 1;
}
.step-item.finished {
  opacity: 1;
}
.step-dot {
  width: 28px;
  height: 28px;
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
  margin-bottom: 4px;
}
.step-item.active .step-title {
  color: #409eff;
}
.step-desc {
  font-size: 12px;
  color: #909399;
}
.result-card {
  margin-top: 20px;
}
.result-header {
  display: flex;
  justify-content: space-between;
}
.conclusion {
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 20px;
  font-size: 14px;
  line-height: 1.6;
}
.sql-section {
  margin-bottom: 20px;
}
.sql-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 600;
}
.sql-code {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 15px;
  border-radius: 4px;
  font-family: 'Consolas', monospace;
  font-size: 13px;
  overflow-x: auto;
  white-space: pre-wrap;
}
.insights-section {
  margin-bottom: 20px;
}
.insights-section h4 {
  margin: 0 0 15px 0;
  color: #303133;
}
.chart-wrapper {
  width: 100%;
  height: 400px;
}
.analysis-result {
  padding: 10px 0;
}
.step-result {
  padding: 15px;
  margin-bottom: 15px;
  background: #fafafa;
  border-radius: 4px;
  border-left: 3px solid #409eff;
}
.step-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}
.step-desc {
  font-size: 13px;
  color: #909399;
  margin-bottom: 10px;
}
.step-summary {
  padding: 10px;
  background: #ecf5ff;
  border-radius: 4px;
  font-size: 13px;
  color: #409eff;
  margin-bottom: 10px;
}
.final-report {
  margin-top: 20px;
  padding: 20px;
  background: #f0f9ff;
  border-radius: 4px;
  border: 1px solid #91d5ff;
}
.final-report h4 {
  margin: 0 0 15px 0;
  color: #1890ff;
}
.report-content {
  font-size: 14px;
  line-height: 1.8;
  color: #303133;
  white-space: pre-wrap;
}

/* 移动端响应式 */
@media (max-width: 768px) {
  .query-container {
    padding: 12px;
    padding-bottom: 80px;
  }
  
  .header {
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }
  
  .header h2 {
    font-size: 20px;
  }
  
  .query-actions {
    flex-direction: column;
  }
  
  .query-actions .el-select {
    width: 100% !important;
  }
  
  .query-actions .el-button {
    width: 100%;
  }
  
  .quick-commands {
    justify-content: center;
  }
  
  .suggestions {
    justify-content: center;
  }
  
  .progress-card {
    margin-top: 12px;
  }
  
  .steps-container {
    padding: 8px 0;
  }
  
  .step-item {
    margin-bottom: 12px;
  }
  
  .step-dot {
    width: 24px;
    height: 24px;
    font-size: 10px;
  }
  
  .step-title {
    font-size: 13px;
  }
  
  .step-desc {
    font-size: 11px;
  }
  
  .result-card {
    margin-top: 12px;
  }
  
  .result-header {
    flex-direction: column;
    gap: 12px;
  }
  
  .result-header > div {
    display: flex;
    gap: 8px;
  }
  
  .result-header .el-button {
    flex: 1;
  }
  
  .chart-wrapper {
    height: 250px;
  }
  
  .sql-code {
    font-size: 12px;
    padding: 10px;
    overflow-x: auto;
  }
  
  .conclusion {
    padding: 12px;
    font-size: 13px;
  }
}

/* 小屏幕优化 */
@media (max-width: 480px) {
  .query-container {
    padding: 8px;
  }
  
  .header h2 {
    font-size: 18px;
  }
  
  .quick-commands {
    gap: 6px;
  }
  
  .command-tag {
    font-size: 12px;
  }
}
</style>
