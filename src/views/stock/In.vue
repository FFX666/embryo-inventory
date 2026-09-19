<template>
  <div>
    <div class="page-header">
      <div class="page-title">扫码入库 <small>支持扫码枪直接扫描商品条码自动带出物料</small></div>
    </div>

    <el-card shadow="never" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <el-icon style="font-size:22px;color:#4a8cff"><Aim /></el-icon>
        <el-input
          ref="scanRef" v-model="scanCode" class="scan-input"
          size="large" clearable placeholder="请将光标置于此处，使用扫码枪扫描条码（或手动输入后按回车）"
          style="max-width:560px" @keyup.enter="handleScan">
          <template #append>
            <el-button :icon="Search" @click="handleScan">查询</el-button>
          </template>
        </el-input>
        <el-tag v-if="scannedItem" type="success" effect="light">
          已识别：{{ scannedItem.name }}
        </el-tag>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header><span style="font-weight:600">入库单信息</span></template>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="物料" prop="itemId">
              <el-select v-model="form.itemId" filterable placeholder="请选择物料" style="width:100%"
                         @change="onItemChange">
                <el-option v-for="i in items" :key="i.id" :value="i.id"
                           :label="`${i.name} ${i.spec ? '· ' + i.spec : ''}`">
                  <span style="float:left">{{ i.name }}</span>
                  <span style="float:right;color:#97a3b5;font-size:12px">{{ i.spec }} / {{ i.unit }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="批号" prop="batchNo">
              <el-input v-model="form.batchNo" placeholder="如 B240815（同批号自动累加）" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="入库数量" prop="quantity">
              <el-input-number v-model="form.quantity" :min="0.01" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="生产日期">
              <el-date-picker v-model="form.productionDate" type="date" value-format="YYYY-MM-DD"
                              placeholder="选择日期" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="有效期至">
              <el-date-picker v-model="form.expireDate" type="date" value-format="YYYY-MM-DD"
                              placeholder="选择日期" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="存放位置">
              <el-input v-model="form.location" placeholder="如 2号冰箱 A 层" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="单价（元）">
              <el-input-number v-model="form.price" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="供应商">
              <el-input v-model="form.supplier" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="经手人">
              <el-input v-model="form.handler" placeholder="实际收货 / 经手人" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item>
          <el-button type="primary" size="large" :icon="Check" :loading="saving" @click="submit">
            确认入库
          </el-button>
          <el-button size="large" @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="sessionList.length" shadow="never" style="margin-top:16px">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:600">本次入库记录（{{ sessionList.length }}）</span>
          <el-button link type="primary" @click="sessionList = []">清空</el-button>
        </div>
      </template>
      <el-table :data="sessionList" size="small" border>
        <el-table-column type="index" width="55" align="center" />
        <el-table-column prop="time" label="时间" width="170" />
        <el-table-column prop="itemName" label="物料" min-width="200" show-overflow-tooltip />
        <el-table-column prop="batchNo" label="批号" width="130" />
        <el-table-column prop="quantity" label="数量" width="100" align="right" />
        <el-table-column prop="unit" label="单位" width="80" align="center" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Aim, Search, Check } from '@element-plus/icons-vue'
import { api } from '@/api'

const items = ref([])
const scanCode = ref('')
const scannedItem = ref(null)
const scanRef = ref()
const formRef = ref()
const saving = ref(false)
const sessionList = ref([])

const form = reactive({
  itemId: null, batchNo: '', quantity: 1, productionDate: '', expireDate: '',
  location: '', price: 0, supplier: '', handler: '', remark: ''
})

const rules = {
  itemId: [{ required: true, message: '请选择物料', trigger: 'change' }],
  batchNo: [{ required: true, message: '请填写批号', trigger: 'blur' }],
  quantity: [{ required: true, message: '请填写入库数量', trigger: 'blur' }]
}

async function handleScan () {
  const code = scanCode.value.trim()
  if (!code) return
  try {
    const item = await api.itemFindByCode({ code })
    if (item) {
      form.itemId = item.id
      scannedItem.value = item
      ElMessage.success(`已识别物料：${item.name}`)
      onItemChange(item.id)
      nextTick(() => scanRef.value?.focus())
    } else {
      scannedItem.value = null
      ElMessage.warning('未匹配到物料，请先在「物料档案」中登记该条码')
    }
  } catch (e) { ElMessage.error(e.message) }
}

function onItemChange (id) {
  const it = items.value.find(x => x.id === id)
  if (it) {
    if (!scannedItem.value || scannedItem.value.id !== id) scannedItem.value = it
  }
}

async function submit () {
  await formRef.value.validate()
  saving.value = true
  try {
    const res = await api.stockIn({ ...form })
    ElMessage.success(`入库成功：${res.itemName}`)
    sessionList.value.unshift({
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
      itemName: res.itemName, batchNo: form.batchNo,
      quantity: form.quantity, unit: res.unit
    })
    resetForm()
  } catch (e) { ElMessage.error(e.message) }
  finally { saving.value = false }
}

function resetForm () {
  Object.assign(form, {
    itemId: null, batchNo: '', quantity: 1, productionDate: '', expireDate: '',
    location: '', price: 0, supplier: '', handler: '', remark: ''
  })
  scanCode.value = ''
  scannedItem.value = null
  nextTick(() => scanRef.value?.focus())
}

onMounted(async () => {
  items.value = await api.itemOptions()
  nextTick(() => scanRef.value?.focus())
})
</script>
