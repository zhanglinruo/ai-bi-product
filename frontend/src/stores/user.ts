import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api'
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '');
  const userInfo = ref<any>(null);

  const isLoggedIn = computed(() => !!token.value);
  const isAdmin = computed(() => userInfo.value?.role === 'admin');

  async function login(username: string, password: string) {
    const res = await api.post('/users/login', { username, password });
    if (res.data.success) {
      token.value = res.data.data.token;
      userInfo.value = res.data.data.user;
      localStorage.setItem('token', token.value);
      return true;
    }
    return false;
  }

  async function fetchUserInfo() {
    if (!token.value) return;
    try {
      const res = await api.get('/users/profile');
      if (res.data.success) {
        userInfo.value = res.data.data;
      }
    } catch (e) {
      logout();
    }
  }

  function logout() {
    token.value = '';
    userInfo.value = null;
    localStorage.removeItem('token');
  }

  return { token, userInfo, isLoggedIn, isAdmin, login, fetchUserInfo, logout, api };
});

export { api };
