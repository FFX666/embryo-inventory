<template>
  <div>
    <div class="page-header">
      <div class="page-title">系统设置 <small>数据备份、恢复与运行信息</small></div>
    </div>

    <el-row :gutter="16">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header><span style="font-weight:600">数据存储</span></template>
          <el-descriptions :column="1" border size="default">
            <el-descriptions-item label="数据库文件路径">
              <div style="display:flex;align-items:center;gap:8px">
                <code class="path">{{ info.dbPath || '—' }}</code>
                <el-button link type="primary" size="small" :icon="CopyDocument"
                           @click="copyPath">复制</el-button>
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="数据目录">
              <div style="display:flex;align-items:center;gap:8px">
                <code class="path">{{ info.dataDir || '—' }}</code>
                <el-button link type="primary" size="small" @click="openDir">打开目录</el-button>
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="数据库大小">{{ formatSize(info.dbSize) }}</el-descriptions-item>
          </el-descriptions>

          <div style="margin-top:20px;display:flex;gap:12px">
            <el-button type="primary" :icon="FolderChecked" :loading="backing" @click="doBackup">
              备份数据库
            </el-button>
            <el-button type="warning" :icon="RefreshLeft" :loading="restoring" @click="doRestore">
              从备份恢复
            </el-button>
          </div>

          <el-alert type="warning" :closable="false" show-icon style="margin-top:16px">
            <template #title>恢复操作会完全覆盖当前数据，请务必确认后再执行。</template>
            <template #default>
              建议在每日作业结束后执行一次备份，并将备份文件保存至移动硬盘或网络盘。
            </template>
          </el-alert>
        </el-card>

        <el-card shadow="never" style="margin-top:16px">
          <template #header><span style="font-weight:600">数据统计</span></template>
          <el-row :gutter="12">
            <el-col :span="6">
              <div class="mini-stat"><div class="v">{{ info.counts?.items || 0 }}</div><div class="k">物料</div></div>
            </el-col>
            <el-col :span="6">
              <div class="mini-stat"><div class="v">{{ info.counts?.batches || 0 }}</div><div class="k">批次</div></div>
            </el-col>
            <el-col :span="6">
              <div class="mini-stat"><div class="v">{{ info.counts?.records || 0 }}</div><div class="k">流水</div></div>
            </el-col>
            <el-col :span="6">
              <div class="mini-stat"><div class="v">{{ info.counts?.logs || 0 }}</div><div class="k">日志</div></div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>

      <el-col :span="10">
        <el-card shadow="never">
          <template #header><span style="font-weight:600">运行环境</span></template>
          <el-descriptions :column="1" border size="default">
            <el-descriptions-item label="应用名称">胚胎实验室库存管理</el-descriptions-item>
            <el-descriptions-item label="应用版本">v{{ info.version }}</el-descriptions-item>
            <el-descriptions-item label="Electron">{{ info.electron }}</el-descriptions-item>
            <el-descriptions-item label="Node.js">{{ info.node }}</el-descriptions-item>
            <el-descriptions-item label="数据库引擎">SQLite 3（better-sqlite3）</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never" style="margin-top:16px">
          <template #header><span style="font-weight:600">预警规则说明</span></template>
          <ul class="rules">
            <li><b>低库存</b>：物料当前库存 ≤ 该物料设置的「最低库存」时触发</li>
            <li><b>临期</b>：批次剩余量 &gt; 0 且有效期在「预警天数」内时触发</li>
            <li><b>已过期</b>：批次剩余量 &gt; 0 且有效期早于当天时触发</li>
            <li><b>出库推荐</b>：按「有效期升序」排列批次，实现先到期先出（FEFO）</li>
          </ul>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, FolderChecked, RefreshLeft } from '@element-plus/icons-vue'
import { api } from '@/api'

const info = ref({ counts: {} })
const backing = ref(false), restoring = ref(false)

const formatSize = (b) => {
  if (!b) return '0 B'
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(2) + ' MB'
}

async function load () { info.value = await api.sysInfo() }

async function copyPath () {
  await navigator.clipboard.writeText(info.value.dbPath)
  ElMessage.success('路径已复制到剪贴板')
}

async function openDir () { await api.openDataDir() }

async function doBackup () {
  backing.value = true
  try {
    const res = await api.backup()
    if (!res.cancelled) ElMessage.success('备份完成：' + res.path)
  } catch (e) { ElMessage.error(e.message) }
  finally { backing.value = false }
}

async function doRestore () {
  await ElMessageBox.confirm(
    '恢复操作将完全覆盖当前所有数据，且不可撤销。确定要继续吗？',
    '危险操作确认',
    { type: 'error', confirmButtonText: '确认恢复', confirmButtonClass: 'el-button--danger' })
  restoring.value = true
  try {
    const res = await api.restore()
    if (!res.cancelled) {
      ElMessage.success('数据恢复成功，界面将重新加载')
      await load()
      setTimeout(() => window.location.reload(), 800)
    }
  } catch (e) { ElMessage.error(e.message) }
  finally { restoring.value = false }
}

onMounted(load)
</script>

<style scoped>
.path {
  background: #f6f8fb; padding: 3px 8px; border-radius: 5px;
  font-size: 12px; color: #2f4f7a; word-break: break-all;
}
.mini-stat {
  text-align: center; padding: 16px 8px; background: #f7f9fc;
  border-radius: 10px; border: 1px solid #edf1f7;
}
.mini-stat .v { font-size: 24px; font-weight: 700; color: #2f6bff; }
.mini-stat .k { font-size: 12px; color: #8b98a9; margin-top: 4px; }
.rules { padding-left: 18px; margin: 0; font-size: 13px; line-height: 2.2; color: #5a6b80; }
.rules b { color: #1f2d3d; }
</style>
