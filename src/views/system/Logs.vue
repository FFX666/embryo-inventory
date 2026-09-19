<template>
  <div>
    <div class="page-header">
      <div class="page-title">操作日志 <small>所有增删改与登录行为均自动留痕</small></div>
    </div>

    <div class="filter-bar">
      <el-select v-model="q.module" placeholder="全部模块" clearable style="width:150px" @change="load(1)">
        <el-option v-for="m in modules" :key="m" :label="m" :value="m" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD"
                      range-separator="至" start-placeholder="开始" end-placeholder="结束"
                      style="width:270px" @change="onDateChange" />
      <el-input v-model="q.keyword" placeholder="操作人 / 对象 / 详情" clearable
                style="width:260px" :prefix-icon="Search" @keyup.enter="load(1)" @clear="load(1)" />
      <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
      <el-button :icon="Refresh" @click="reset">重置</el-button>
    </div>

    <el-card shadow="never">
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column type="index" label="#" width="55" align="center"
                         :index="i => (q.page - 1) * q.pageSize + i + 1" />
        <el-table-column prop="created_at" label="操作时间" width="175" />
        <el-table-column prop="username" label="操作人" width="130" />
        <el-table-column prop="module" label="模块" width="130">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.module }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="动作" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="light"
                    :type="/删除|禁用|作废/.test(row.action) ? 'danger' : /新增|入库|恢复/.test(row.action) ? 'success' : 'primary'">
              {{ row.action }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="target" label="操作对象" min-width="180" show-overflow-tooltip />
        <el-table-column prop="detail" label="详情" min-width="300" show-overflow-tooltip />
      </el-table>

      <el-pagination style="margin-top:14px;justify-content:flex-end"
        background layout="total, sizes, prev, pager, next, jumper"
        :total="total" v-model:current-page="q.page" v-model:page-size="q.pageSize"
        :page-sizes="[15, 30, 50, 100]" @current-change="load()" @size-change="load(1)" />
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import { api } from '@/api'

const modules = ['系统', '系统管理', '基础档案', '库存管理', '报表中心', '系统设置']
const loading = ref(false)
const rows = ref([]), total = ref(0)
const dateRange = ref([])
const q = reactive({ keyword: '', module: '', startDate: '', endDate: '', page: 1, pageSize: 15 })

function onDateChange (v) {
  q.startDate = v?.[0] || ''
  q.endDate = v?.[1] || ''
  load(1)
}

async function load (resetPage) {
  if (resetPage === 1) q.page = 1
  loading.value = true
  try {
    const res = await api.logList({ ...q })
    rows.value = res.rows
    total.value = res.total
  } catch (e) { ElMessage.error(e.message) }
  finally { loading.value = false }
}

function reset () {
  Object.assign(q, { keyword: '', module: '', startDate: '', endDate: '', page: 1 })
  dateRange.value = []
  load()
}

onMounted(load)
</script>
