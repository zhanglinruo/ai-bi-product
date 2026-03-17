<template>
  <div class="admin-container">
    <div class="header">
      <h2>系统管理</h2>
      <el-button @click="$router.push('/')">返回首页</el-button>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="概览" name="overview">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-card>
              <template #header>用户数</template>
              <div class="stat-value">{{ stats.userCount }}</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card>
              <template #header>数据源数</template>
              <div class="stat-value">{{ stats.datasourceCount }}</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card>
              <template #header>查询次数</template>
              <div class="stat-value">{{ stats.queryCount }}</div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <el-tab-pane label="系统配置" name="config">
        <el-card>
          <el-form label-width="150px">
            <el-form-item label="系统名称">
              <el-input v-model="config.system_name" @blur="updateConfig('system_name', config.system_name)" />
            </el-form-item>
            <el-form-item label="大模型Base URL">
              <el-input v-model="config.llm_base_url" @blur="updateConfig('llm_base_url', config.llm_base_url)" placeholder="http://localhost:8000" />
            </el-form-item>
            <el-form-item label="大模型API Key">
              <el-input v-model="config.llm_api_key" type="password" @blur="updateConfig('llm_api_key', config.llm_api_key)" placeholder="API Key" />
            </el-form-item>
            <el-form-item label="大模型名称">
              <el-input v-model="config.llm_model" @blur="updateConfig('llm_model', config.llm_model)" placeholder="gpt-3.5-turbo" />
            </el-form-item>
            <el-form-item label="会话超时时间(秒)">
              <el-input-number v-model="config.session_timeout" :min="300" :max="86400" @change="updateConfig('session_timeout', String(config.session_timeout))" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="操作日志" name="logs">
        <el-table :data="logs" v-loading="logsLoading">
          <el-table-column prop="action" label="操作" />
          <el-table-column prop="resource_type" label="资源类型" />
          <el-table-column prop="ip_address" label="IP地址" />
          <el-table-column prop="created_at" label="时间" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { systemApi } from '../api';
import { ElMessage } from 'element-plus';

const activeTab = ref('overview');
const stats = reactive({ userCount: 0, datasourceCount: 0, queryCount: 0 });
const config = reactive<Record<string, any>>({});
const logs = ref<any[]>([]);
const logsLoading = ref(false);

onMounted(async () => {
  loadStats();
  loadConfig();
  loadLogs();
});

async function loadStats() {
  try {
    const res = await systemApi.getStats();
    if (res.data.success) {
      Object.assign(stats, res.data.data);
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadConfig() {
  try {
    const res = await systemApi.getConfig();
    if (res.data.success) {
      Object.assign(config, res.data.data);
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadLogs() {
  logsLoading.value = true;
  try {
    const res = await systemApi.getLogs();
    if (res.data.success) {
      logs.value = res.data.data;
    }
  } catch (e) {
    console.error(e);
  } finally {
    logsLoading.value = false;
  }
}

async function updateConfig(key: string, value: any) {
  try {
    await systemApi.updateConfig(key, value);
    ElMessage.success('配置已更新');
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '更新失败');
  }
}
</script>

<style scoped>
.admin-container {
  padding: 20px;
  min-height: 100vh;
  background: #f5f7fa;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  text-align: center;
  color: #409eff;
}
</style>
