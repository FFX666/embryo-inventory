<template>
  <div>
    <div class="page-header">
      <div class="page-title">批次库存 <small>按批号追溯每一支试剂 / 耗材</small></div>
    </div>

    <div class="filter-bar">
      <el-input v-model="q.keyword" placeholder="搜索物料 / 批号 / 编码" clearable
                style="width:280px" :prefix-icon="Search" @keyup.enter="load(1)" @clear="load(1)" />
      <el-select v-model="q.status" placeholder="全部效期状态" clearable style="width:150px" @change="load(1)">
        <el-option label="正常" value="normal" />
        <el-option label="临期" value="expiring" />
        <el-option label="已过期" value="expired" />
        <el-option label="已用完" value="used" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
      <el-button :icon="Refresh" @click="() => { Object.assign(q, { keyword: '', status: '', page: 1 }); load() }">重置</el-button>
    </div>

    <el-card shadow="never">
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column type="index" label="#" width="55" align="center" />
        <el-table-column prop="item_name" label="物料名称" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="font-weight:600">{{ row.item_name }}</span>
            <div style="font-size:12px;color:#97a3b5">{{ row.spec }} · {{ row.manufacturer }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="batch_no" label="批号" width="130" />
        <el-table-column label="入库 / 剩余" width="130" align="center">
          <template #default="{ row }">
            <span style="color:#8b98a9">{{ row.quantity }}</span>
            <span style="color:#c0c4cc"> / </span>
            <span style="font-weight:700" :style="{ color: row.remaining > 0 ? '#1f2d3d' : '#c0c4cc' }">
              {{ row.remaining }}
            </span>
            <span style="font-size:12px;color:#97a3b5"> {{ row.unit }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="expire_date" label="有效期至" width="120" align="center">
          <template #default="{ row }">{{ row.expire_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="效期状态" width="130" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="light" :type="tagType(row.status)">
              {{ statusText(row.status, row.days_left) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="存放位置" min-width="130" show-overflow-tooltip />
        <el-table-column prop="supplier" label="供应商" width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="trace(row)">追溯</el-button>
            <el-button v-if="store.canWrite" link type="danger" size="small"
                       :disabled="row.remaining <= 0" @click="scrap(row)">报废</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination style="margin-top:14px;justify-content:flex-end"
        background layout="total, sizes, prev, pager, next, jumper"
        :total="total" v-model:current-page="q.page" v-model:page-size="q.pageSize"
        :page-sizes="[10, 20, 50]" @current-change="load()" @size-change="load(1)" />
    </el-card>

    <el-drawer v-model="drawer" title="批次追溯" size="720px">
      <template v-if="traceData.batch">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="物料">{{ traceData.batch.item_name }}</el-descriptions-item>
          <el-descriptions-item label="批号">{{ traceData.batch.batch_no }}</el-descriptions-item>
          <el-descriptions-item label="规格">{{ traceData.batch.spec }}</el-descriptions-item>
          <el-descriptions-item label="厂家">{{ traceData.batch.manufacturer }}</el-descriptions-item>
          <el-descriptions-item label="入库总量">{{ traceData.batch.quantity }}</el-descriptions-item>
          <el-descriptions-item label="当前剩余">{{ traceData.batch.remaining }}</el-descriptions-item>
          <el-descriptions-item label="生产日期">{{ traceData.batch.production_date || '—' }}</el-descriptions-item>
          <el-descriptions-item label="有效期至">{{ traceData.batch.expire_date || '—' }}</el-descriptions-item>
          <el-descriptions-item label="存放位置">{{ traceData.batch.location || '—' }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ traceData.batch.supplier || '—' }}</el-descriptions-item>
        </el-descriptions>

        <div style="font-weight:600;margin:20px 0 10px">出入库流水</div>
        <el-timeline>
          <el-timeline-item
            v-for="r in traceData.records" :key="r.id"
            :timestamp="r.created_at" placement="top"
            :type="r.type === 'IN' ? 'success' : r.type === 'SCRAP' ? 'danger' : 'primary'">
            <div style="font-size:14px">
              <b>{{ { IN: '入库', OUT: '出库', SCRAP: '报废' }[r.type] || r.type }}</b>
              数量 {{ r.quantity }} {{ r.unit }}
              <span v-if="r.handler" style="margin-left:8px;color:#5a6b80">经手人：{{ r.handler }}</span>
            </div>
            <div style="font-size:12px;color:#97a3b5;margin-top:4px">
              操作员 {{ r.operator_name }}<span v-if="r.purpose"> · 用途：{{ r.purpose }}</span>
              <span v-if="r.remark"> · {{ r.remark }}</span>
            </div>
          </el-timeline-item>
        </el-timeline>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import { api } from '@/api'
import { useUserStore } from '@/store/user'

const store = useUserStore()
const loading = ref(false)
const rows = ref([]), total = ref(0)
const q = reactive({ keyword: '', status: '', page: 1, pageSize: 10 })

const drawer = ref(false)
const traceData = reactive({ batch: null, records: [] })

const statusText = (s, days) => ({
  used: '已用完', expired: '已过期',
  expiring: `临期（${days}天）`, normal: '正常'
}[s] || s)
const tagType = (s) => ({ used: 'info', expired: 'danger', expiring: 'warning', normal: 'success' }[s] || '')

async function load (resetPage) {
  if (resetPage === 1) q.page = 1
  loading.value = true
  try {
    const res = await api.batchList({ ...q })
    rows.value = res.rows
    total.value = res.total
  } catch (e) { ElMessage.error(e.message) }
  finally { loading.value = false }
}

async function trace (row) {
  try {
    const res = await api.batchTrace({ batchId: row.id })
    traceData.batch = res.batch
    traceData.records = res.records
    drawer.value = true
  } catch (e) { ElMessage.error(e.message) }
}

async function scrap (row) {
  const { value } = await ElMessageBox.prompt(
    `批次 ${row.batch_no} 当前剩余 ${row.remaining} ${row.unit}，请输入报废数量：`,
    '批次报废',
    { inputPattern: /^\d+(\.\d+)?$/, inputErrorMessage: '请输入正确的数量', type: 'warning' })
  try {
    await api.batchScrap({ batchId: row.id, quantity: Number(value), remark: '人工报废' })
    ElMessage.success('报废成功')
    load()
  } catch (e) { ElMessage.error(e.message) }
}

onMounted(load)
</script>
