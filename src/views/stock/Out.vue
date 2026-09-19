<template>
  <div>
    <div class="page-header">
      <div class="page-title">
        出库领用
        <small>系统按「先到期先出」自动推荐批次，有效避免试剂过期浪费</small>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="10">
        <el-card shadow="never">
          <template #header><span style="font-weight:600">出库单</span></template>
          <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
            <el-form-item label="物料" prop="itemId">
              <el-select v-model="form.itemId" filterable placeholder="请选择物料" style="width:100%"
                         @change="onItemChange">
                <el-option v-for="i in items" :key="i.id" :value="i.id"
                           :label="`${i.name} ${i.spec ? '· ' + i.spec : ''}`">
                  <span style="float:left">{{ i.name }}</span>
                  <span style="float:right;color:#97a3b5;font-size:12px">{{ i.unit }}</span>
                </el-option>
              </el-select>
            </el-form-item>

            <el-form-item label="出库数量" prop="quantity">
              <el-input-number v-model="form.quantity" :min="0.01" :precision="2"
                               style="width:100%" @change="refreshRecommend" />
            </el-form-item>

            <el-form-item label="出库方式">
              <el-radio-group v-model="form.mode">
                <el-radio value="auto">自动分配（先到期先出）</el-radio>
                <el-radio value="manual">手动指定批次</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="经手人" prop="handler">
              <el-input v-model="form.handler" placeholder="实际领用人" />
            </el-form-item>
            <el-form-item label="用途">
              <el-input v-model="form.purpose" placeholder="如 取卵培养 / 胚胎冷冻" />
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
            </el-form-item>

            <el-alert v-if="currentItem" type="info" :closable="false" show-icon style="margin-bottom:14px">
              <template #title>
                当前库存：
                <b :style="{ color: totalStock > 0 ? '#1f2d3d' : '#f5222d' }">{{ totalStock }}</b>
                {{ currentItem.unit }}
                <span v-if="currentItem.min_stock > 0" style="margin-left:8px;color:#8b98a9">
                  （预警下限 {{ currentItem.min_stock }}）
                </span>
              </template>
            </el-alert>

            <el-form-item>
              <el-button type="primary" size="large" :icon="Check" :loading="saving"
                         :disabled="!form.itemId || totalStock <= 0" @click="submit">
                确认出库
              </el-button>
              <el-button size="large" @click="resetForm">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600">批次推荐（按有效期升序）</span>
              <el-tag v-if="form.mode === 'auto'" type="success" effect="light" size="small">
                系统已按先到期先出排好顺序
              </el-tag>
              <el-tag v-else type="warning" effect="light" size="small">请手动点击选择批次</el-tag>
            </div>
          </template>

          <el-table
            :data="batches" v-loading="loadingBatch" border size="small"
            :row-class-name="rowClass"
            highlight-current-row empty-text="该物料暂无可用批次"
            @current-change="onRowSelect">

            <el-table-column width="70" align="center">
              <template #default="{ row }">
                <el-radio v-if="form.mode === 'manual'" :model-value="form.batchId"
                          :value="row.id" @change="() => form.batchId = row.id">
                  <span></span>
                </el-radio>
                <el-icon v-else-if="row.recommended" style="color:#4a8cff;font-size:16px"><Star /></el-icon>
              </template>
            </el-table-column>
            <el-table-column prop="batch_no" label="批号" width="120" />
            <el-table-column prop="remaining" label="剩余" width="80" align="center" />
            <el-table-column prop="expire_date" label="有效期至" width="115" align="center">
              <template #default="{ row }">{{ row.expire_date || '—' }}</template>
            </el-table-column>
            <el-table-column label="效期" width="110" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.expired ? 'danger' : row.days_left <= 30 ? 'warning' : 'success'"
                        effect="light">
                  {{ row.expired ? `已过期${-row.days_left}天` : `剩${row.days_left}天` }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="location" label="存放位置" min-width="130" show-overflow-tooltip />
            <el-table-column label="建议出库" width="100" align="center">
              <template #default="{ row }">
                <span v-if="row.suggestQty > 0" style="color:#4a8cff;font-weight:700">{{ row.suggestQty }}</span>
                <span v-else style="color:#c0c4cc">—</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="lastResult" shadow="never" style="margin-top:16px">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600">最近一次出库结果</span>
              <el-button link type="primary" @click="lastResult = null">关闭</el-button>
            </div>
          </template>
          <el-alert type="success" :closable="false" show-icon style="margin-bottom:12px">
            <template #title>
              已出库 <b>{{ lastResult.itemName }}</b>，共扣减
              <b>{{ lastResult.details.reduce((s, d) => s + d.qty, 0) }} {{ lastResult.unit }}</b>
            </template>
          </el-alert>
          <el-table :data="lastResult.details" size="small" border>
            <el-table-column type="index" label="#" width="55" align="center" />
            <el-table-column prop="batchNo" label="批号" />
            <el-table-column prop="qty" label="扣减数量" align="right" />
            <el-table-column prop="expireDate" label="有效期" align="center" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Star } from '@element-plus/icons-vue'
import { api } from '@/api'

const items = ref([])
const batches = ref([])
const loadingBatch = ref(false)
const saving = ref(false)
const formRef = ref()
const lastResult = ref(null)

const form = reactive({
  itemId: null, quantity: 1, batchId: null, mode: 'auto',
  handler: '', purpose: '', remark: ''
})
const rules = {
  itemId: [{ required: true, message: '请选择物料', trigger: 'change' }],
  quantity: [{ required: true, message: '请填写出库数量', trigger: 'blur' }],
  handler: [{ required: true, message: '请填写经手人', trigger: 'blur' }]
}

const currentItem = computed(() => items.value.find(i => i.id === form.itemId))
const totalStock = computed(() =>
  batches.value.reduce((s, b) => s + (b.remaining || 0), 0))

const rowClass = ({ row }) => (form.mode === 'auto' && row.recommended ? 'row-recommend' : '')

async function onItemChange () {
  form.batchId = null
  await refreshRecommend()
}

async function refreshRecommend () {
  if (!form.itemId) { batches.value = []; return }
  loadingBatch.value = true
  try {
    batches.value = await api.stockRecommend({
      itemId: form.itemId,
      quantity: form.mode === 'auto' ? form.quantity : 0
    })
    if (form.mode === 'manual' && batches.value.length && !form.batchId) {
      form.batchId = batches.value[0].id
    }
  } catch (e) { ElMessage.error(e.message) }
  finally { loadingBatch.value = false }
}

watch(() => form.mode, (m) => {
  if (m === 'auto') form.batchId = null
  else if (batches.value.length) form.batchId = batches.value[0].id
  refreshRecommend()
})

function onRowSelect (row) {
  if (form.mode === 'manual' && row) form.batchId = row.id
}

async function submit () {
  await formRef.value.validate()
  if (form.mode === 'manual' && !form.batchId) return ElMessage.warning('请选择要出库的批次')
  if (form.quantity > totalStock.value) return ElMessage.warning('出库数量超过可用库存')

  saving.value = true
  try {
    const res = await api.stockOut({
      itemId: form.itemId,
      batchId: form.mode === 'manual' ? form.batchId : null,
      quantity: form.quantity,
      handler: form.handler,
      purpose: form.purpose,
      remark: form.remark
    })
    lastResult.value = res
    ElMessage.success('出库成功')
    await refreshRecommend()
    Object.assign(form, { quantity: 1, purpose: '', remark: '' })
  } catch (e) { ElMessage.error(e.message) }
  finally { saving.value = false }
}

function resetForm () {
  Object.assign(form, { itemId: null, quantity: 1, batchId: null, mode: 'auto', handler: '', purpose: '', remark: '' })
  batches.value = []
  lastResult.value = null
}

onMounted(async () => { items.value = await api.itemOptions() })
</script>
