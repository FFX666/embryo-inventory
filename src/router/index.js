import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from '@/store/user'

const routes = [
  { path: '/login', component: () => import('@/views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/layout/index.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '概览工作台' } },
      { path: 'items', component: () => import('@/views/items/index.vue'), meta: { title: '物料档案' } },
      { path: 'batches', component: () => import('@/views/batches/index.vue'), meta: { title: '批次库存' } },
      { path: 'stock/in', component: () => import('@/views/stock/In.vue'), meta: { title: '扫码入库', roles: ['admin', 'operator'] } },
      { path: 'stock/out', component: () => import('@/views/stock/Out.vue'), meta: { title: '出库领用', roles: ['admin', 'operator'] } },
      { path: 'stock/records', component: () => import('@/views/stock/Records.vue'), meta: { title: '出入库流水' } },
      { path: 'reports', component: () => import('@/views/reports/index.vue'), meta: { title: '报表中心' } },
      { path: 'system/users', component: () => import('@/views/system/Users.vue'), meta: { title: '账号管理', roles: ['admin'] } },
      { path: 'system/logs', component: () => import('@/views/system/Logs.vue'), meta: { title: '操作日志', roles: ['admin'] } },
      { path: 'system/settings', component: () => import('@/views/system/Settings.vue'), meta: { title: '系统设置', roles: ['admin'] } }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  const store = useUserStore()
  if (to.meta.public) return true
  if (!store.isLogin) return '/login'
  if (to.meta.roles && !to.meta.roles.includes(store.role)) return '/dashboard'
  return true
})

export default router
