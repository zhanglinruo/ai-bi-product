<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <h2>登录 - 数答</h2>
      </template>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="0">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" prefix-icon="Lock" @keydown.enter="handleLogin" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleLogin" style="width: 100%">
            登录
          </el-button>
        </el-form-item>
      </el-form>
      <div class="tips">
        <p>还没有账号？<router-link to="/register">立即注册</router-link></p>
        <p style="margin-top: 8px;">默认管理员账号: admin / admin123</p>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';
import { ElMessage, FormInstance } from 'element-plus';

const router = useRouter();
const userStore = useUserStore();

const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({
  username: '',
  password: ''
});

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};

async function handleLogin() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      const success = await userStore.login(form.username, form.password);
      if (success) {
        ElMessage.success('登录成功');
        router.push('/');
      } else {
        ElMessage.error('用户名或密码错误');
      }
    } catch (e: any) {
      ElMessage.error(e.response?.data?.message || '登录失败');
    } finally {
      loading.value = false;
    }
  });
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
}

.login-card h2 {
  text-align: center;
  margin: 0;
}

.tips {
  text-align: center;
  color: #999;
  font-size: 12px;
}

.tips a {
  color: #409eff;
  text-decoration: none;
}

.tips a:hover {
  text-decoration: underline;
}
</style>
