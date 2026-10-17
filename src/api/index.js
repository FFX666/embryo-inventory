import axios from 'axios'
import ExcelJS from 'exceljs'

const getServerIp = () => localStorage.getItem('server_ip') || '192.168.1.100'
const apiBase = `http://${getServerIp()}:3000/api`

export async function call (channel, payload) {
  try {
    const res = await axios.post(`${apiBase}/${channel}`, payload)
    if (!res.data.success) throw new Error(res.data.message)
    return res.data.data
  } catch (e) {
    if (e.code === 'ERR_NETWORK') throw new Error('无法连接服务器，请检查主机的IP和网络状态')
    throw e
  }
}

/**
 * 纯前端生成并下载 Excel
 */
export async function exportExcel ({ filename = 'export.xlsx', sheets = [] }) {
  try {
    const wb = new ExcelJS.Workbook()
    wb.creator = '胚胎实验室库存管理系统'
    wb.created = new Date()

    sheets.forEach(s => {
      const ws = wb.addWorksheet(s.name || 'Sheet1')
      ws.columns = (s.columns || []).map(c => ({
        header: c.header, key: c.key, width: c.width || 18
      }))

      // 表头样式
      const head = ws.getRow(1)
      head.font = { bold: true, color: { argb: 'FF1F2D3D' } }
      head.alignment = { vertical: 'middle', horizontal: 'center' }
      head.height = 22
      head.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1FF' } }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFC9D6E5' } },
          left: { style: 'thin', color: { argb: 'FFC9D6E5' } },
          bottom: { style: 'thin', color: { argb: 'FFC9D6E5' } },
          right: { style: 'thin', color: { argb: 'FFC9D6E5' } }
        }
      })

      // 写入数据
      ;(s.rows || []).forEach(r => ws.addRow(r))

      // 内容样式
      ws.eachRow((row, idx) => {
        if (idx === 1) return
        row.alignment = { vertical: 'middle' }
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'hair', color: { argb: 'FFE0E6ED' } },
            left: { style: 'hair', color: { argb: 'FFE0E6ED' } },
            bottom: { style: 'hair', color: { argb: 'FFE0E6ED' } },
            right: { style: 'hair', color: { argb: 'FFE0E6ED' } }
          }
        })
      })
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: (s.columns || []).length } }
    })

    // 生成 Blob 并触发浏览器下载
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    return { success: true, path: '已下载到本地' }
  } catch (e) {
    throw new Error('导出失败: ' + e.message)
  }
}

export const api = {
  // 认证
  login: d => call('auth:login', d),
  logout: () => call('auth:logout'),
  changePwd: d => call('auth:changePwd', d),
  // 用户
  userList: d => call('user:list', d),
  userSave: d => call('user:save', d),
  userDelete: d => call('user:delete', d),
  // 分类
  categoryList: () => call('category:list'),
  categorySave: d => call('category:save', d),
  categoryDelete: d => call('category:delete', d),
  // 物料
  itemList: d => call('item:list', d),
  itemOptions: () => call('item:options'),
  itemSave: d => call('item:save', d),
  itemDelete: d => call('item:delete', d),
  itemFindByCode: d => call('item:findByCode', d),
  // 批次
  batchList: d => call('batch:list', d),
  batchTrace: d => call('batch:trace', d),
  batchScrap: d => call('batch:scrap', d),
  batchDelete: d => call('batch:delete', d),
  // 出入库
  stockIn: d => call('stock:in', d),
  stockOut: d => call('stock:out', d),
  stockRecommend: d => call('stock:recommend', d),
  recordList: d => call('record:list', d),
  // 报表
  dashboard: () => call('dashboard:stats'),
  reportSummary: d => call('report:summary', d),
  exportExcel: exportExcel, // 指向纯前端方法
  // 日志
  logList: d => call('log:list', d),
  // 系统
  sysInfo: () => call('system:info'),
  backup: () => call('system:backup'),
  restore: () => call('system:restore'),
  openDataDir: () => call('system:openDataDir')
}
