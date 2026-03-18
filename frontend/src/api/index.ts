import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('[API] 请求:', config.method?.toUpperCase(), config.url, config.data);
  return config;
});

api.interceptors.response.use(
  (response) => {
    console.log('[API] 响应:', response.status, response.data);
    return response;
  },
  (error) => {
    console.log('[API] 错误:', error.message, error.response?.data);
    return Promise.reject(error);
  }
);

export const userApi = {
  login: (username: string, password: string) => api.post('/users/login', { username, password }),
  register: (data: any) => api.post('/users/register', data),
  getProfile: () => api.get('/users/profile')
};

export const datasourceApi = {
  getList: () => api.get('/datasources'),
  getById: (id: string) => api.get(`/datasources/${id}`),
  create: (data: any) => api.post('/datasources', data),
  update: (id: string, data: any) => api.put(`/datasources/${id}`, data),
  delete: (id: string) => api.delete(`/datasources/${id}`),
  test: (data: any) => api.post('/datasources/test', data)
};

export const queryApi = {
  execute: (question: string, datasourceId?: string, sessionId?: string) => api.post('/query/execute', { question, datasourceId, sessionId }),
  getHistory: (limit?: number, offset?: number) => api.get('/query/history', { params: { limit, offset } }),
  getById: (id: string) => api.get(`/query/history/${id}`)
};

export const aiApi = {
  chat: (messages: any[], sessionId?: string) => api.post('/ai/chat', { messages, sessionId }),
  generateSql: (question: string, schema: any, context?: any) => api.post('/ai/generate-sql', { question, schema, context }),
  generateConclusion: (question: string, result: any, sql: string) => api.post('/ai/generate-conclusion', { question, result, sql })
};

export const agentApi = {
  // Agent 架构查询
  query: (query: string, datasourceId?: string) => api.post('/agent/query', { query, datasourceId }),
  // 分步执行（调试）
  querySteps: (query: string, datasourceId?: string) => api.post('/agent/query/steps', { query, datasourceId }),
  // Agent 列表
  getAgents: () => api.get('/agent/list'),
};

export const historyApi = {
  // 获取历史列表
  getList: (limit?: number, offset?: number) => api.get('/history', { params: { limit, offset } }),
  // 保存历史
  save: (data: any) => api.post('/history', data),
  // 获取单条
  getById: (id: string) => api.get(`/history/${id}`),
  // 删除
  delete: (id: string) => api.delete(`/history/${id}`),
  // 切换收藏
  toggleFavorite: (id: string) => api.put(`/history/${id}/favorite`),
};

export const systemApi = {
  getConfig: () => api.get('/system/config'),
  updateConfig: (config_key: string, config_value: string) => api.put('/system/config', { config_key, config_value }),
  getLogs: (action?: string, limit?: number, offset?: number) => api.get('/system/logs', { params: { action, limit, offset } }),
  getStats: () => api.get('/system/stats')
};

export default api;
