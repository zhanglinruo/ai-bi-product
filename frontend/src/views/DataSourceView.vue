<template>
  <div class="datasource-container">
    <div class="header">
      <h2>数据源管理</h2>
      <div>
        <el-button @click="$router.push('/')">返回首页</el-button>
        <el-button type="primary" @click="handleAdd">添加数据源</el-button>
      </div>
    </div>

    <el-table :data="datasources" v-loading="loading">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="type" label="类型">
        <template #default="{ row }">
          <el-tag>{{ typeMap[row.type] || row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="host" label="地址" />
      <el-table-column prop="status" label="状态">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" />
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">
            {{ row.status === 'active' ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑数据源' : '添加数据源'" width="500px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="数据源名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入数据源名称" />
        </el-form-item>
        <el-form-item label="数据源类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择类型" style="width: 100%">
            <el-option label="MySQL" value="mysql" />
            <el-option label="PostgreSQL" value="postgresql" />
            <el-option label="SQL Server" value="sqlserver" />
            <el-option label="ClickHouse" value="clickhouse" />
            <el-option label="Excel/CSV" value="excel" />
            <el-option label="CRM API" value="crm_api" />
          </el-select>
        </el-form-item>
        <el-form-item label="主机地址" prop="host">
          <el-input v-model="form.host" placeholder="localhost" />
        </el-form-item>
        <el-form-item label="端口" prop="port">
          <el-input-number v-model="form.port" :min="1" :max="65535" style="width: 100%" />
        </el-form-item>
        <el-form-item label="数据库名" prop="database_name">
          <el-input v-model="form.database_name" placeholder="数据库名称" />
        </el-form-item>
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="用户名" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { datasourceApi } from '../api';
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus';

const loading = ref(false);
const submitting = ref(false);
const datasources = ref<any[]>([]);
const dialogVisible = ref(false);
const isEdit = ref(false);
const formRef = ref<FormInstance>();

const form = reactive({
  id: '',
  name: '',
  type: '',
  host: '',
  port: 3306,
  database_name: '',
  username: '',
  password: ''
});

const rules = {
  name: [{ required: true, message: '请输入数据源名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择数据源类型', trigger: 'change' }]
};

const typeMap: Record<string, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlserver: 'SQL Server',
  clickhouse: 'ClickHouse',
  excel: 'Excel/CSV',
  crm_api: 'CRM API'
};

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await datasourceApi.getList();
    if (res.data.success) {
      datasources.value = res.data.data;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function handleAdd() {
  isEdit.value = false;
  Object.assign(form, { id: '', name: '', type: '', host: '', port: 3306, database_name: '', username: '', password: '' });
  dialogVisible.value = true;
}

function handleEdit(row: any) {
  isEdit.value = true;
  Object.assign(form, row);
  form.password = '';
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      if (isEdit.value) {
        await datasourceApi.update(form.id, form);
        ElMessage.success('更新成功');
      } else {
        await datasourceApi.create(form);
        ElMessage.success('创建成功');
      }
      dialogVisible.value = false;
      loadData();
    } catch (e: any) {
      ElMessage.error(e.response?.data?.message || '操作失败');
    } finally {
      submitting.value = false;
    }
  });
}

async function toggleStatus(row: any) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active';
  try {
    await datasourceApi.update(row.id, { status: newStatus });
    ElMessage.success(newStatus === 'active' ? '已启用' : '已禁用');
    loadData();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '操作失败');
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定要删除该数据源吗？', '提示', { type: 'warning' });
    await datasourceApi.delete(row.id);
    ElMessage.success('删除成功');
    loadData();
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.message || '删除失败');
    }
  }
}
</script>

<style scoped>
.datasource-container {
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
</style>
