<template>
  <div>
    <div class="page-header">
      <div class="page-title">出入库流水 <small>全部库存变动均可追溯</small></div>
      <el-button type="primary" :icon="Download" @click="exportData">导出 Excel</el-button>
    </div>

    <div class="filter-bar">
      <el-select v-model="q.type" placeholder="全部类型" clearable style="width:130px" @change="load(1)">
        <el-option label="入库" value="IN" />
        <el-option label="出库" value="OUT" />
        <el-option label="报废" value="SCRAP" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD"
                      range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
                      style="width:280px" @change="onDateChange" />
      <el-input v-model="q.keyword" placeholder="物料 / 批号 / 经手人" clearable
                style="width:240px" :prefix-icon="Search" @keyup.enter="load(1)" @clear="load(1)" />
      <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
      <el-button :icon="Refresh" @click="reset">重置</el-button>
    </div>

    <el-card shadow="never">
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column type="index" label="#" width="55" align="center"
                         :index="i => (q.page - 1) * q.pageSize + i + 1" />
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="light" :type="typeTag(row.type)">{{ typeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="item_name" label="物料名称" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="font-weight:600">{{ row.item_name }}</span>
            <div style="font-size:12px;color:#97a3b5">{{ row.spec }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="batch_no" label="批号" width="130" />
        <el-table-column label="数量" width="110" align="right">
          <template #default="{ row }">
            <span :style="{ color: row.type === 'IN' ? '#34c38f' : '#f5222d', fontWeight: 600 }">
              {{ row.type === 'IN' ? '+' : '-' }}{{ row.quantity }}
            </span>
            <span style="color:#97a3b5;font-size:12px"> {{ row.unit }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="handler" label="经手人" width="110">
          <template #default="{ row }">{{ row.handler || '—' }}</template>
        </el-table-column>
        <el-table-column prop="operator_name" label="操作员" width="110" />
        <el-table-column prop="purpose" label="用途" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.purpose || '—' }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="操作时间" width="170" />
      </el-table>

      <el-pagination style="margin-top:14px;justify-content:flex-end"
        background layout="total, sizes, prev, pager, next, jumper"
        :total="total" v-model:current-page="q.page" v-model:page-size="q.pageSize"
        :page-sizes="[15, 30, 50, 100]" @current-change
