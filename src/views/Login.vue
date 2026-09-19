<template>
  <div class="login-wrap">
    <div class="bg-deco d1"></div>
    <div class="bg-deco d2"></div>

    <div class="login-card">
      <div class="left">
        <el-icon class="logo"><ColdDrink /></el-icon>
        <h1>胚胎实验室</h1>
        <h2>库存管理系统</h2>
        <p>Embryo Lab Inventory Management</p>
        <ul>
          <li>试剂耗材全生命周期管理</li>
          <li>批次效期自动预警提醒</li>
          <li>先进先出 / 先到期先出出库</li>
          <li>完整追溯与操作留痕</li>
        </ul>
      </div>

      <div class="right">
        <h3>账号登录</h3>
        <p class="tip">请使用实验室分配的账号登录系统</p>

        <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" clearable>
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="form.password" type="password" placeholder="密码" show-password>
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="submit">
            登 录
          </el-button>
        </el-form>

        <div class="demo">
          <span>演示账号：</span>
          <el-tag size="small" @click="fill('admin', 'admin123')">admin / admin123</el-tag>
          <el-tag size="small" type="success" @click="fill('operator', '123456')">operator / 123456</el-tag>
          <el-tag size="small" type="info" @click="fill('viewer', '123456')">viewer / 123456</el-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'

const router = useRouter()
const store = useUserStore()
const formRef = ref()
const loading = ref(false)

const form = reactive({ username: 'admin', password: 'admin123' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

function fill (u, p) { form.username = u; form.password = p }

async function submit () {
  await formRef.value.validate()
  loading.value = true
  try {
    await store.login({ ...form })
    ElMessage.success(`欢迎回来，${store.displayName}`)
    router.replace('/dashboard')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  height: 100vh; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(1200px 600px at 20% 20%, #24406e, #0f1a2e 70%);
  position: relative; overflow: hidden;
}
.bg-deco { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .45; }
.d1 { width: 460px; height: 460px; background: #4a8cff; top: -140px; left: -120px; }
.d2 { width: 520px; height: 520px; background: #7048e8; bottom: -180px; right: -140px; }

.login-card {
  position: relative; z-index: 2; display: flex; width: 880px; height: 520px;
  border-radius: 18px; overflow: hidden;
  box-shadow: 0 30px 70px rgba(0, 0, 0, .45);
  background: #fff;
}
.left {
  width: 380px; padding: 48px 40px; color: #fff;
  background: linear-gradient(160deg, #2a6bff 0%, #1e4fd8 55%, #143a9e 100%);
  display: flex; flex-direction: column;
}
.left .logo { font-size: 54px; opacity: .9; }
.left h1 { margin: 18px 0 4px; font-size: 26px; letter-spacing: 3px; }
.left h2 { margin: 0; font-size: 17px; font-weight: 400; opacity: .9; letter-spacing: 6px; }
.left p { margin: 6px 0 26px; font-size: 11px; opacity: .6; letter-spacing: 1px; }
.left ul { padding-left: 0; list-style: none; margin: 0; }
.left ul li {
  font-size: 13px; line-height: 2.2; opacity: .9; padding-left: 18px; position: relative;
}
.left ul li::before {
  content: ''; position: absolute; left: 0; top: 14px;
  width: 6px; height: 6px; border-radius: 50%; background: #8fd0ff;
}

.right { flex: 1; padding: 58px 52px; display: flex; flex-direction: column; }
.right h3 { margin: 0 0 6px; font-size: 22px; color: #1f2d3d; }
.right .tip { margin: 0 0 30px; font-size: 13px; color: #8b98a9; }
.demo { margin-top: auto; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: #8b98a9; }
.demo .el-tag { cursor: pointer; }
</style>
