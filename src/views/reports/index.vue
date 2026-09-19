<template>
  <div>
    <div class="page-header">
      <div class="page-title">报表中心 <small>库存 / 出入库统计分析</small></div>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="出入库统计" name="flow">
        <div class="filter-bar">
          <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD"
                          range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
                          style="width:300px" />
          <el-button type="primary" :icon="Search" :loading="loading" @click="loadSummary">统计</el-button>
          <el-button :icon="Download" @click="exportFlow">导出</el-button>
        </div>

        <el-card shadow="never">
          <el-table :data="summary.inOut" v-loading="loading" border stripe>
            <el-table-column type="index" label="#" width="55" align="center" />
            <el-table-column prop="code" label="物料编码" width="140" />
            <el-table-column prop="name" label="物料名称" min-width="200" show-overflow-tooltip />
            <el-table-column prop="spec" label="规格" width="130" />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column label="入库合计" width="120" align="right">
              <template #default="{ row }">
                <span style="color:#34c38f;font-weight:600">+{{ row.inQty }}</span>
              </template>
            </el-table-column>
            <el-table-column label="出库合计" width="120" align="right">
              <template #default="{ row }">
                <span style="color:#f5222d;font-weight:600">-{{ row.outQty }}</span>
              </template>
            </el-table-column>
            <el-table-column label="报废合计" width="120" align="right">
              <template #default="{ row }">{{ row.scrapQty }}</template>
            </el-table-column>
            <el-table-column label="净变化" width="120" align="right">
              <template #default="{ row }">
                <span :style="{ color: (row.inQty - row.outQty) >= 0 ? '#34c38f' : '#f5222d', fontWeight: 600 }">
                  {{ (row.inQty - row.outQty) >= 0 ? '+' : '' }}{{ row.inQty - row.outQty }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="经手人用量" name="handler">
        <el-card shadow="never">
          <el-table :data="summary.byHandler" border stripe>
            <el-table-column type="index" label="#" width="55" align="center" />
            <el-table-column prop="handler" label="经手人" min-width="160" />
            <el-table-column prop="outQty" label="累计领用量" width="160" align="right" />
            <el-table-column prop="times" label="领用次数" width="140" align="center" />
            <el-table-column label="占比" min-width="260">
              <template #default="{ row }">
                <el-progress :percentage="pctHandler(row.outQty)" :stroke-width="14"
                             :format="() => pctHandler(row.outQty) + '%'" />
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="效期分析" name="expiry">
        <div class="filter-bar">
          <el-button :icon="Download" @click="exportExpiry">导出效期分析</el-button>
          <span style="color:#8b98a9;font-size:13px">数据来自概览工作台实时统计</span>
        </div>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-card shadow="never">
              <template #header><span style="font-weight:600;color:#fa8c16">临期批次（{{ stats.expiring.length }}）</span></template>
              <el-table :data="stats.expiring" size="small" border height="380">
                <el-table-column prop="item_name" label="物料" min-width="180" show-overflow-tooltip />
                <el-table-column prop="batch_no" label="批号" width="110" />
                <el-table-column prop="remaining" label="剩余" width="75" align="center" />
                <el-table-column prop="expire_date" label="有效期" width="110" align="center" />
                <el-table-column label="剩余天数" width="95" align="center">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.days_left <= 7 ? 'danger' : 'warning'">{{ row.days_left }}天</el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="never">
              <template #header><span style="font-weight:600;color:#f5222d">过期批次（{{ stats.expired.length }}）</span></template>
              <el-table :data="stats.expired" size="small" border height="380">
                <el-table-column prop="item_name" label="物料" min-width="180" show-overflow-tooltip />
                <el-table-column prop="batch_no" label="批号" width="110" />
                <el-table-column prop="remaining" label="剩余" width="75" align="center" />
                <el-table-column prop="expire_date" label="有效期" width="110" align="center" />
                <el-table-column label="已过期" width="95" align="center">
                  <template #default="{ row }">
                    <el-tag size="small" type="danger" effect="dark">{{ row.days_over }}天</el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Download } from '@element-plus/icons-vue'
import { api } from '@/api'

const tab = ref('flow')
const loading = ref(false)
const range = ref([])
const summary = ref({ inOut: [], byHandler: [] })
const stats = ref({ expiring: [], expired: [] })

const maxHandler = computed(() => Math.max(1, ...summary.value.byHandler.map(h => h.outQty)))
const pctHandler = v => Math.round((v / maxHandler.value) * 100)

async function loadSummary () {
  loading.value = true
  try {
    summary.value = await api.reportSummary({
      startDate: range.value?.[0] || '',
      endDate: range.value?.[1] || ''
    })
  } catch (e) { ElMessage.error(e.message) }
  finally { loading.value = false }
}

async function exportFlow () {
  if (!summary.value.inOut.length) return ElMessage.warning('请先统计')
  try {
    const res = await api.exportExcel({
      filename: `出入库统计_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [
        {
          name: '出入库统计',
          columns: [
            { header: '物料编码', key: 'code', width: 16 },
            { header: '物料名称', key: 'name', width: 30 },
            { header: '规格', key: 'spec', width: 16 },
            { header: '单位', key: 'unit', width: 10 },
            { header: '厂家', key: 'manufacturer', width: 18 },
            { header: '入库合计', key: 'inQty', width: 12 },
            { header: '出库合计', key: 'outQty', width: 12 },
            { header: '报废合计', key: 'scrapQty', width: 12 },
            { header: '净变化', key: 'net', width: 12 }
          ],
          rows: summary.value.inOut.map(r => ({ ...r, net: r.inQty - r.outQty }))
        },
        {
          name: '经手人用量',
          columns: [
            { header: '经手人', key: 'handler', width: 18 },
            { header: '累计领用量', key: 'outQty', width: 16 },
            { header: '领用次数', key: 'times', width: 14 }
          ],
          rows: summary.value.byHandler
        }
      ]
    })
    if (!res.cancelled) ElMessage.success('导出成功：' + res.path)
  } catch (e) { ElMessage.error(e.message) }
}

async function exportExpiry () {
  try {
    const res = await api.exportExcel({
      filename: `效期分析_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [
        {
          name: '临期批次',
          columns: [
            { header: '物料名称', key: 'item_name', width: 30 },
            { header: '规格', key: 'spec', width: 16 },
            { header: '批号', key: 'batch_no', width: 16 },
            { header: '剩余数量', key: 'remaining', width: 12 },
            { header: '单位', key: 'unit', width: 10 },
            { header: '有效期至', key: 'expire_date', width: 14 },
            { header: '剩余天数', key: 'days_left', width: 12 },
            { header: '存放位置', key: 'location', width: 18 }
          ],
          rows: stats.value.expiring
        },
        {
          name: '过期批次',
          columns: [
            { header: '物料名称', key: 'item_name', width: 30 },
            { header: '规格', key: 'spec', width: 16 },
            { header: '批号', key: 'batch_no', width: 16 },
            { header: '剩余数量', key: 'remaining', width: 12 },
            { header: '单位', key: 'unit', width: 10 },
            { header: '有效期至', key: 'expire_date', width: 14 },
            { header: '已过期天数', key: 'days_over', width: 14 },
            { header: '存放位置', key: 'location', width: 18 }
          ],
          rows: stats.value.expired
        }
      ]
    })
    if (!res.cancelled) ElMessage.success('导出成功：' + res.path)
  } catch (e) { ElMessage.error(e.message) }
}

onMounted(async () => {
  await loadSummary()
  try { stats.value = await api.dashboard() } catch (e) {}
})
</script>
