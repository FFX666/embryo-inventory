import { defineStore } from 'pinia'
import { api } from '@/api'

export const useUserStore = defineStore('user', {
  state: () => ({ user: null }),
  getters: {
    isLogin: s => !!s.user,
    role: s => s.user?.role || '',
    isAdmin: s => s.user?.role === 'admin',
    canWrite: s => ['admin', 'operator'].includes(s.user?.role),
    displayName: s => s.user?.real_name || s.user?.username || ''
  },
  actions: {
    async login (form) {
      this.user = await api.login(form)
      return this.user
    },
    async logout () {
      try { await api.logout() } catch (e) {}
      this.user = null
    }
  }
})
