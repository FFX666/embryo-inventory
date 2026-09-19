<template>
  <div>
    <div class="page-header">
      <div class="page-title">账号管理 <small>分级权限：管理员 / 录入员 / 只读用户</small></div>
      <el-button type="primary" :icon="Plus" @click="openEdit()">新增账号</el-button>
    </div>

    <el-card shadow="never">
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column type="index" label="#" width="55" align="center" />
        <el-table-column prop="username" label="用户名" width="150" />
        <el-table-column prop="real_name" label="姓名" width="150" />
        <el-table-column prop="role" label="角色" width="140" align="center">
          <template #default="{ row }">
            <el-tag :type="roleTag(row.role)" effect="light" size="small">{{ roleText(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权限说明" min-width="260">
          <template #default="{ row }">{{ roleDesc(row.role) }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="联系电话" width="150" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small" effect="light">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="170" />
        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="visible" :title="form.id ? '编辑账号' : '新增账号'" width="520px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="姓名" prop="real_name">
          <el-input v-model="form.real_name" placeholder="真实姓名" />
        </el-form-item>
        <el-form-item label="密码" :prop="form.id ? '' : 'password'">
          <el-input v-model="form.password" type="password" show-password
                    :placeholder="form.id ? '留空则不修改密码' : '不少于 6 位'" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-radio-group v-model="form.role">
            <el-radio value="admin">管理员</el-radio>
            <el-radio value="operator">录入员</el-radio>
            <el-radio value="viewer">只读用户</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0"
                     active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { api } from '@/api'

const loading = ref(false), saving = ref(false)
const rows = ref([])
const visible = ref(false), formRef = ref()

const EMPTY = { id: null, username: '', real_name: '', password: '', role: 'operator', phone: '', status: 1 }
const form = reactive({ ...EMPTY })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  real_name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const roleText = r => ({ admin: '管理员', operator: '录入员', viewer: '只读用户' }[r] || r)
const roleTag = r => ({ admin: 'danger', operator: 'primary', viewer: 'info' }[r] || '')
const roleDesc = r => ({
  admin: '全部权限，含账号管理、操作日志、系统备份恢复',
  operator: '可维护档案、执行出入库作业，不能管理账号与系统',
  viewer: '仅可查看数据与报表，不能进行任何写操作'
}[r] || '')

async function load () {
  loading.value = true
  try { rows.value = await api.userList({}) }
  catch (e) { ElMessage.error(e.message) }
  finally { loading.value = false }
}

function openEdit (row) {
  Object.assign(form, EMPTY, row || {}, row ? { password: '' } : {})
  visible.value = true
}

async function submit () {
  await formRef.value.validate()
  saving.value = true
  try {
    await api.userSave({ ...form })
    ElMessage.success('保存成功')
    visible.value = false
    load()
  } catch (e) { ElMessage.error(e.message) }
  finally { saving.value = false }
}

async function remove (row) {
  await ElMessageBox.confirm(`确定删除账号「${row.username}」吗？`, '删除确认', { type: 'warning' })
  try {
    await api.userDelete({ id: row.id })
    ElMessage.success('已删除')
    load()
  } catch (e) { ElMessage.error(e.message) }
}

onMounted(load)
</script>
