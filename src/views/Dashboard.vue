<template>
  <div v-loading="loading">
    <el-row :gutter="16">
      <el-col :span="6">
        <div class="stat-card bg-blue">
          <div class="label">在册物料</div>
          <div class="value">{{ stats.itemCount }}<span class="unit">种</span></div>
          <el-icon class="icon"><Box /></el-icon>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card bg-green">
          <div class="label">有效批次</div>
          <div class="value">{{ stats.batchCount }}<span class="unit">批</span></div>
          <el-icon class="icon"><Files /></el-icon>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card bg-purple">
          <div class="label">库存总值（参考）</div>
          <div class="value">¥{{ Number(stats.totalValue || 0).toFixed(2) }}</div>
          <el-icon class="icon"><Money /></el-icon>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card bg-orange">
          <div class="label">预警总计</div>
          <div class="value">
            {{ stats.counts.lowStock + stats.counts.expiring + stats.counts.expired }}
            <span class="unit">项</span>
          </div>
          <el-icon class="icon"><Warning /></el-icon>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top:16px">
      <el-col :span="16">
        <el-card shadow="never">
          <template #header>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-weight:600">库存预警</span>
              <el-tabs v-model="warnTab" style="margin-bottom:-16px;border:none">
                <el-tab-pane :label="`低库存 (${stats.counts.lowStock})`" name="low" />
                <el-tab-pane :label="`临期 (${stats.counts.expiring})`" name="expiring" />
                <el-tab-pane :label="`已过期 (${stats.counts.expired})`" name="expired" />
              </el-tabs>
            </div>
          </template>

          <el-table v-if="warnTab==='low'" :data="stats.lowStock" size="small" height="310" empty-text="暂无低库存物料">
            <el-table-column prop="name" label="物料名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="spec" label="规格" width="110" />
            <el-table-column prop="manufacturer" label="厂家" width="110" />
            <el-table-column label="当前 / 预警下限" width="140" align="center">
              <template #default="{ row }">
                <span style="color:#f5222d;font-weight:600">{{ row.stock }}</span>
                <span style="color:#c0c4cc"> / {{ row.min_stock }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.stock <= 0 ? 'danger' : 'warning'" effect="light">
                  {{ row.stock <= 0 ? '缺货' : '偏低' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <el-table v-else-if="warnTab==='expiring'" :data="stats.expiring" size="small" height="310" empty-text="暂无临期批次">
            <el-table-column prop="item_name" label="物料名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="batch_no" label="批号" width="120" />
            <el-table-column prop="remaining" label="剩余" width="80" align="center" />
            <el-table-column prop="expire_date" label="有效期至" width="120" align="center" />
            <el-table-column label="剩余天数" width="110" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.days_left <= 7 ? 'danger' : 'warning'" effect="light">
                  {{ row.days_left }} 天
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="location" label="存放位置" min-width="120" show-overflow-tooltip />
          </el-table>

          <el-table v-else :data="stats.expired" size="small" height="310" empty-text="暂无过期批次">
            <el-table-column prop="item_name" label="物料名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="batch_no" label="批号" width="120" />
            <el-table-column prop="remaining" label="剩余" width="80" align="center" />
            <el-table-column prop="expire_date" label="有效期至" width="120" align="center" />
            <el-table-column label="已过期" width="110" align="center">
              <template #default="{ row }">
                <el-tag size="small" type="danger" effect="dark">{{ row.days_over }} 天</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="location" label="存放位置" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card shadow="never">
          <template #header><span style="font-weight:600">近 7 日出入库趋势</span></template>
          <div class="trend">
            <div v-for="t in stats.trend" :key="t.date" class="trend-col">
              <div class="bars">
                <div class="bar in" :style="{ height: barH(t.inQty) + 'px' }" :title="`入库 ${t.inQty}`"></div>
                <div class="bar out" :style="{ height: barH(t.outQty) + 'px' }" :title="`出库 ${t.outQty}`"></div>
              </div>
              <div class="d">{{ t.date.slice(5) }}</div>
            </div>
          </div>
          <div class="legend">
            <span><i class="dot in"></i>入库</span>
            <span><i class="dot out"></i>出库</span>
          </div>
        </el-card>

        <el-card shadow="never" style="margin-top:16px">
          <template #header><span style="font-weight:600">分类库存分布</span></template>
          <div v-for="c in stats.categoryDist" :key="c.name" class="cat-row">
            <span class="cat-name">{{ c.name }}</span>
            <el-progress
              :percentage="pct(c.stock)" :stroke-width="10"
              :show-text="false" style="flex:1;margin:0 10px" />
            <span class="cat-val">{{ c.stock }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" style="margin-top:16px">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:600">最近出入库动态</span>
          <el-button link type="primary" @click="$router.push('/stock/records')">查看全部</el-button>
        </div>
      </template>
      <el-table :data="stats.recentRecords" size="small" empty-text="暂无记录">
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="typeTag(row.type)" effect="light">{{ typeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="item_name" label="物料" min-width="180" show-overflow-tooltip />
        <el-table-column prop="batch_no" label="批号" width="130" />
        <el-table-column label="数量" width="110" align="right">
          <template #default="{ row }">
            <span :style="{ color: row.type === 'IN' ? '#34c38f' : '#f5222d' }">
              {{ row.type === 'IN' ? '+' : '-' }}{{ row.quantity }} {{ row.item_unit || '' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="handler" label="经手人" width="110" />
        <el-table-column prop="operator_name" label="操作员" width="110" />
        <el-table-column prop="created_at" label="时间" width="170" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const warnTab = ref('low')
const stats = ref({
  itemCount: 0, batchCount: 0, totalValue: 0,
  counts: { lowStock: 0, expiring: 0, expired: 0 },
  lowStock: [], expiring: [], expired: [], recentRecords: [], trend: [], categoryDist: []
})

const maxTrend = computed(() =>
  Math.max(1, ...stats.value.trend.map(t => Math.max(t.inQty, t.outQty))))
const barH = (v) => Math.round((v / maxTrend.value) * 110) || 2
const maxCat = computed(() => Math.max(1, ...stats.value.categoryDist.map(c => c.stock)))
const pct = (v) => Math.round((v / maxCat.value) * 100)

const typeText = (t) => ({ IN: '入库', OUT: '出库', SCRAP: '报废', ADJUST: '调整' }[t] || t)
const typeTag = (t) => ({ IN: 'success', OUT: 'warning', SCRAP: 'danger' }[t] || 'info')

async function load () {
  loading.value = true
  try { stats.value = await api.dashboard() }
  catch (e) { ElMessage.error(e.message) }
  finally { loading.value = false }
}

onMounted(load)
</script>

<style scoped>
.trend { display: flex; align-items: flex-end; justify-content: space-between; height: 150px; padding: 6px 4px 0; }
.trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.bars { display: flex; gap: 4px; align-items: flex-end; height: 120px; }
.bar { width: 10px; border-radius: 3px 3px 0 0; transition: height .3s; }
.bar.in { background: linear-gradient(180deg, #6bd4a4, #34c38f); }
.bar.out { background: linear-gradient(180deg, #7fb4ff, #4a8cff); }
.trend-col .d { font-size: 11px; color: #97a3b5; margin-top: 6px; }
.legend { display: flex; gap: 16px; justify-content: center; margin-top: 8px; font-size: 12px; color: #7b8799; }
.legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
.legend .dot.in { background: #34c38f; }
.legend .dot.out { background: #4a8cff; }

.cat-row { display: flex; align-items: center; font-size: 13px; margin-bottom: 10px; }
.cat-name { width: 76px; color: #5a6b80; }
.cat-val { width: 54px; text-align: right; color: #1f2d3d; font-weight: 600; }
</style>
