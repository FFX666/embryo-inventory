<template>
  <div>
    <div class="page-header">
      <div class="page-title">出入库流水</div>
      <el-button type="primary" @click="exportData">导出 Excel</el-button>
    </div>
    <div class="filter-bar">
      <el-select v-model="q.type" placeholder="全部类型" clearable style="width:130px" @change="load(1)">
        <el-option label="入库" value="IN" />
        <el-option label="出库" value="OUT" />
        <el-option label="报废" value="SCRAP" />
      </el-select>
      <el-input v-model="q.keyword" placeholder="关键字" clearable style="width:240px" @keyup.enter="load(1)" />
      <el-button type="primary" @click="load(1)">查询</el-button>
      <el-button @click="reset">重置</el-button>
    </div>
    <el-card shadow="never">
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column type="index" label="#" width="55" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ typeText(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="item_name" label="物料名称" min-width="200" />
        <el-table-column prop="batch_no" label="批号" width="130" />
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="handler" label="经手人" width="110" />
        <el-table-column prop="operator_name" label="操作员" width="110" />
        <el-table-column prop="created_at" label="操作时间" width="170" />
      </el-table>
      <el-pagination style="margin-top:14px;justify-content:flex-end"
        background layout="total, sizes, prev, pager, next, jumper"
        :total="total" v-model:current-page="q.page" v-model:page-size="q.pageSize"
        :page-sizes="[15, 30, 50]" @current-change="load()" />
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api'

const loading = ref(false)
const rows = ref([]), total = ref(0)
const q = reactive({ type: '', keyword: '', page: 1, pageSize: 15 })

const typeText = t => ({ IN: '入库', OUT: '出库', SCRAP: '报废' }[t] || t)

async function load (p) {
  if (p === 1) q.page = 1
  loading.value = true
  try {
    const res = await api.recordList({ ...q })
    rows.value = res.rows
    total.value = res.total
  } catch (e) { ElMessage.error(e.message) }
  finally { loading.value = false }
}

function reset () {
  Object.assign(q, { type: '', keyword: '', page: 1 })
  load()
}

async function exportData () {
  if (!rows.value.length) return ElMessage.warning('暂无数据')
  try {
    const res = await api.exportExcel({
      filename: '出入库流水.xlsx',
      sheets: [{
        name: '流水',
        columns: [
          { header: '类型', key: 'typeText', width: 10 },
          { header: '物料', key: 'item_name', width: 30 },
          { header: '批号', key: 'batch_no', width: 16 },
          { header: '数量', key: 'quantity', width: 12 },
          { header: '单位', key: 'unit', width: 10 },
          { header: '经手人', key: 'handler', width: 14 },
          { header: '操作员', key: 'operator_name', width: 14 },
          { header: '时间', key: 'created_at', width: 22 }
        ],
        rows: rows.value.map(r => ({ ...r, typeText: typeText(r.type) }))
      }]
    })
    if (!res.cancelled) ElMessage.success('已导出')
  } catch (e) { ElMessage.error(e.message) }
}

onMounted(load)
</script>