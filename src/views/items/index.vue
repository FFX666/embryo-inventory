<template>
  <div>
    <div class="page-header">
      <div class="page-title">物料档案 <small>试剂 / 耗材的基础信息维护</small></div>
      <div>
        <el-button v-if="store.canWrite" type="primary" :icon="Plus" @click="openEdit()">新增物料</el-button>
        <el-button :icon="Download" @click="exportList">导出</el-button>
      </div>
    </div>

    <div class="filter-bar">
      <el-input v-model="q.keyword" placeholder="搜索名称 / 编码 / 条码 / 厂家" clearable
                style="width:280px" :prefix-icon="Search" @keyup.enter="load(1)" @clear="load(1)" />
      <el-select v-model="q.categoryId" placeholder="全部分类" clearable style="width:150px" @change="load(1)">
        <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="q.status" placeholder="全部状态" clearable style="width:130px" @change="load(1)">
        <el-option label="启用" :value="1" />
        <el-option label="停用" :value="0" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
      <el-button :icon="Refresh" @click="reset">重置</el-button>
      <div class="grow"></div>
      <span style="color:#8b98a9;font-size:13px">共 {{ total }} 条</span>
    </div>

    <el-card shadow="never">
      <el-table :data="rows" v-loading="loading" border stripe size="default">
        <el-table-column type="index" label="#" width="55" align="center" />
        <el-table-column prop="code" label="物料编码" width="130" />
        <el-table-column prop="name" label="物料名称" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="font-weight:600">{{ row.name }}</span>
            <el-tag v-if="row.status === 0" size="small" type="info" style="margin-left:6px">停用</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="category_name" label="分类" width="100" />
        <el-table-column prop="spec" label="规格" width="120" />
        <el-table-column prop="unit" label="单位" width="70" align="center" />
        <el-table-column prop="manufacturer" label="生产厂家" width="130" show-overflow-tooltip />
        <el-table-column label="当前库存" width="110" align="center">
          <template #default="{ row }">
            <span :style="{ color: row.current_stock <= row.min_stock && row.min_stock > 0 ? '#f5222d' : '#1f2d3d', fontWeight: 600 }">
              {{ row.current_stock }}
            </span>
            <span style="color:#c0c4cc;font-size:12px"> / {{ row.min_stock }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="warn_days" label="效期预警" width="95" align="center">
          <template #default="{ row }">{{ row.warn_days }} 天</template>
        </el-table-column>
        <el-table-column prop="storage_condition" label="存储条件" width="130" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="store.canWrite" link type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top:14px;justify-content:flex-end"
        background layout="total, sizes, prev, pager, next, jumper"
        :total="total" v-model:current-page="q.page" v-model:page-size="q.pageSize"
        :page-sizes="[10, 20, 50, 100]" @current-change="load()" @size-change="load(1)" />
    </el-card>

    <el-dialog v-model="visible" :title="form.id ? '编辑物料' : '新增物料'" width="720px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="物料编码" prop="code">
            <el-input v-model="form.code" placeholder="如 ML-GIVF-100" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="条码">
            <el-input v-model="form.barcode" placeholder="扫码枪录入的条码" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="物料名称" prop="name">
            <el-input v-model="form.name" placeholder="如 受精培养液 G-IVF Plus" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="分类">
            <el-select v-model="form.category_id" placeholder="请选择" clearable style="width:100%">
              <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
            </el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="规格">
            <el-input v-model="form.spec" placeholder="如 100mL/瓶" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="单位">
            <el-input v-model="form.unit" placeholder="瓶 / 支 / 个" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="生产厂家">
            <el-input v-model="form.manufacturer" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="供应商">
            <el-input v-model="form.supplier" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="最低库存">
            <el-input-number v-model="form.min_stock" :min="0" :precision="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="效期预警天数">
            <el-input-number v-model="form.warn_days" :min="1" :max="730" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="存储条件">
            <el-input v-model="form.storage_condition" placeholder="如 2~8℃ 避光" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="状态">
            <el-radio-group v-model="form.status">
              <el-radio :value="1">启用</el-radio>
              <el-radio :value="0">停用</el-radio>
            </el-radio-group></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注">
            <el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
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
import { Plus, Search, Refresh, Download } from '@element-plus/icons-vue'
import { api } from '@/api'
import { useUserStore } from '@/store/user'

const store = useUserStore()
const loading = ref(false), saving = ref(false)
const rows = ref([]), total = ref(0), categories = ref([])
const visible = ref(false), formRef = ref()

const q = reactive({ keyword: '', categoryId: null, status: '', page: 1, pageSize: 10 })
const EMPTY = {
  id: null, code: '', barcode: '', name: '', category_id: null, spec: '', unit: '瓶',
  manufacturer: '', supplier: '', min_stock: 0, warn_days: 30,
  storage_condition: '', remark: '', status: 1
}
const form = reactive({ ...EMPTY })
const rules = {
  name: [{ required: true, message: '请输入物料名称', trigger: 'blur' }],
  unit: [{ required: true, message: '请输入单位', trigger: 'blur' }]
}

async function load (resetPage) {
  if (resetPage === 1) q.page = 1
  loading.value = true
  try {
    const res = await api.itemList({ ...q })
    rows.value = res.rows
    total.value = res.total
  } catch (e) { ElMessage.error(e.message) }
  finally { loading.value = false }
}

function reset () {
  Object.assign(q, { keyword: '', categoryId: null, status: '', page: 1 })
  load()
}

function openEdit (row) {
  Object.assign(form, EMPTY, row || {})
  visible.value = true
}

async function submit () {
  await formRef.value.validate()
  saving.value = true
  try {
    await api.itemSave({ ...form })
    ElMessage.success('保存成功')
    visible.value = false
    load()
  } catch (e) { ElMessage.error(e.message) }
  finally { saving.value = false }
}

async function remove (row) {
  await ElMessageBox.confirm(`确定删除物料「${row.name}」吗？`, '删除确认', { type: 'warning' })
  try {
    await api.itemDelete({ id: row.id })
    ElMessage.success('已删除')
    load()
  } catch (e) { ElMessage.error(e.message) }
}

async function exportList () {
  try {
    const res = await api.exportExcel({
      filename: `物料档案_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [{
        name: '物料档案',
        columns: [
          { header: '物料编码', key: 'code', width: 16 },
          { header: '物料名称', key: 'name', width: 30 },
          { header: '分类', key: 'category_name', width: 12 },
          { header: '规格', key: 'spec', width: 16 },
          { header: '单位', key: 'unit', width: 8 },
          { header: '生产厂家', key: 'manufacturer', width: 18 },
          { header: '供应商', key: 'supplier', width: 18 },
          { header: '当前库存', key: 'current_stock', width: 12 },
          { header: '最低库存', key: 'min_stock', width: 12 },
          { header: '存储条件', key: 'storage_condition', width: 18 },
          { header: '状态', key: 'statusText', width: 10 }
        ],
        rows: rows.value.map(r => ({ ...r, statusText: r.status === 1 ? '启用' : '停用' }))
      }]
    })
    if (!res.cancelled) ElMessage.success('导出成功：' + res.path)
  } catch (e) { ElMessage.error(e.message) }
}

onMounted(async () => {
  categories.value = await api.categoryList()
  load()
})
</script>
