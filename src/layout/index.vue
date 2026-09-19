<template>
  <el-container style="height:100vh">
    <el-aside width="228px" class="sidebar">
      <div class="brand">
        <el-icon class="brand-icon"><ColdDrink /></el-icon>
        <div class="brand-text">
          <div class="t1">胚胎实验室</div>
          <div class="t2">库存管理系统</div>
        </div>
      </div>

      <el-scrollbar>
        <el-menu :default-active="route.path" router class="side-menu"
                 background-color="transparent" text-color="#c3cede" active-text-color="#fff">
          <template v-for="g in menus" :key="g.title">
            <div class="menu-group">{{ g.title }}</div>
            <el-menu-item v-for="m in g.items" :key="m.path" :index="m.path">
              <el-icon><component :is="m.icon" /></el-icon>
              <span>{{ m.title }}</span>
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-container>
      <el-header class="topbar">
        <div class="crumbs">
          <el-icon><Location /></el-icon>
          <span>{{ route.meta.title || '工作台' }}</span>
        </div>
        <div class="right">
          <el-tag size="small" effect="plain" type="info" style="margin-right:12px">
            {{ roleText }}
          </el-tag>
          <el-dropdown @command="onCommand">
            <span class="user">
              <el-avatar :size="30" style="background:#4a8cff">{{ avatarChar }}</el-avatar>
              <span class="name">{{ store.displayName }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="pwd">修改密码</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view v-slot="{ Component }">
          <keep-alive :max="6">
            <component :is="Component" :key="route.fullPath" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>

    <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
      <el-form :model="pwdForm" label-width="90px">
        <el-form-item label="原密码"><el-input v-model="pwdForm.oldPwd" type="password" show-password /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="pwdForm.newPwd" type="password" show-password /></el-form-item>
        <el-form-item label="确认密码"><el-input v-model="pwdForm.confirm" type="password" show-password /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" @click="submitPwd">确定</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import { api } from '@/api'

const route = useRoute()
const router = useRouter()
const store = useUserStore()

const MENUS = [
  { title: '工作台', items: [{ path: '/dashboard', title: '概览工作台', icon: 'Odometer' }] },
  {
    title: '库存作业',
    items: [
      { path: '/stock/in', title: '扫码入库', icon: 'Download', roles: ['admin', 'operator'] },
      { path: '/stock/out', title: '出库领用', icon: 'Upload', roles: ['admin', 'operator'] },
      { path: '/stock/records', title: '出入库流水', icon: 'Tickets' }
    ]
  },
  {
    title: '档案管理',
    items: [
      { path: '/items', title: '物料档案', icon: 'Box' },
      { path: '/batches', title: '批次库存', icon: 'Files' }
    ]
  },
  { title: '统计分析', items: [{ path: '/reports', title: '报表中心', icon: 'DataAnalysis' }] },
  {
    title: '系统管理',
    items: [
      { path: '/system/users', title: '账号管理', icon: 'User', roles: ['admin'] },
      { path: '/system/logs', title: '操作日志', icon: 'Document', roles: ['admin'] },
      { path: '/system/settings', title: '系统设置', icon: 'Setting', roles: ['admin'] }
    ]
  }
]

const menus = computed(() =>
  MENUS.map(g => ({
    title: g.title,
    items: g.items.filter(i => !i.roles || i.roles.includes(store.role))
  })).filter(g => g.items.length)
)

const roleText = computed(() => ({
  admin: '管理员', operator: '录入员', viewer: '只读用户'
}[store.role] || store.role))

const avatarChar = computed(() => (store.displayName || 'U').charAt(0))

const pwdVisible = ref(false)
const pwdForm = reactive({ oldPwd: '', newPwd: '', confirm: '' })

async function submitPwd () {
  if (!pwdForm.newPwd || pwdForm.newPwd.length < 6) return ElMessage.warning('新密码不少于 6 位')
  if (pwdForm.newPwd !== pwdForm.confirm) return ElMessage.warning('两次输入的新密码不一致')
  try {
    await api.changePwd({ oldPwd: pwdForm.oldPwd, newPwd: pwdForm.newPwd })
    ElMessage.success('密码已修改，请重新登录')
    pwdVisible.value = false
    await store.logout()
    router.replace('/login')
  } catch (e) { ElMessage.error(e.message) }
}

async function onCommand (cmd) {
  if (cmd === 'pwd') {
    Object.assign(pwdForm, { oldPwd: '', newPwd: '', confirm: '' })
    pwdVisible.value = true
  } else if (cmd === 'logout') {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
    await store.logout()
    router.replace('/login')
  }
}
</script>

<style scoped>
.sidebar {
  background: linear-gradient(180deg, #1b2740 0%, #16203a 100%);
  display: flex; flex-direction: column;
}
.brand {
  height: 68px; display: flex; align-items: center; gap: 10px;
  padding: 0 18px; color: #fff; border-bottom: 1px solid rgba(255,255,255,.06);
}
.brand-icon { font-size: 26px; color: #4a8cff; }
.brand-text .t1 { font-size: 15px; font-weight: 700; letter-spacing: .5px; }
.brand-text .t2 { font-size: 11px; color: #8b9ab5; letter-spacing: 2px; }

.side-menu { border-right: none; padding: 8px 0 24px; }
.menu-group {
  padding: 14px 20px 6px; font-size: 11px; color: #5e6f8a; letter-spacing: 1.5px;
}
.side-menu :deep(.el-menu-item) {
  height: 42px; line-height: 42px; margin: 2px 10px; border-radius: 8px; font-size: 14px;
}
.side-menu :deep(.el-menu-item:hover) { background: rgba(74,140,255,.14) !important; }
.side-menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, #4a8cff, #2f6bff) !important;
  box-shadow: 0 4px 12px rgba(74,140,255,.35);
}

.topbar {
  height: 60px; background: #fff; border-bottom: 1px solid #eaeff6;
  display: flex; align-items: center; justify-content: space-between; padding: 0 22px;
}
.crumbs { display: flex; align-items: center; gap: 6px; color: #5a6b80; font-size: 14px; }
.topbar .right { display: flex; align-items: center; }
.user { display: flex; align-items: center; gap: 8px; cursor: pointer; outline: none; }
.user .name { font-size: 14px; color: #1f2d3d; }

.main { padding: 18px 22px; background: #f4f6fa; overflow-y: auto; }
</style>
