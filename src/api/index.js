const bridge = window.electronAPI

export async function call (channel, payload) {
  if (!bridge) throw new Error('当前不在 Electron 运行环境中')
  const res = await bridge.invoke(channel, payload)
  if (!res) throw new Error('主进程无响应')
  if (!res.success) throw new Error(res.message || '操作失败')
  return res.data
}

export const api = {
  login: d => call('auth:login', d),
  logout: () => call('auth:logout'),
  changePwd: d => call('auth:changePwd', d),

  userList: d => call('user:list', d),
  userSave: d => call('user:save', d),
  userDelete: d => call('user:delete', d),

  categoryList: () => call('category:list'),
  categorySave: d => call('category:save', d),
  categoryDelete: d => call('category:delete', d),

  itemList: d => call('item:list', d),
  itemOptions: () => call('item:options'),
  itemSave: d => call('item:save', d),
  itemDelete: d => call('item:delete', d),
  itemFindByCode: d => call('item:findByCode', d),

  batchList: d => call('batch:list', d),
  batchTrace: d => call('batch:trace', d),
  batchScrap: d => call('batch:scrap', d),

  stockIn: d => call('stock:in', d),
  stockOut: d => call('stock:out', d),
  stockRecommend: d => call('stock:recommend', d),
  recordList: d => call('record:list', d),

  dashboard: () => call('dashboard:stats'),
  reportSummary: d => call('report:summary', d),
  exportExcel: d => call('report:export', d),

  logList: d => call('log:list', d),

  sysInfo: () => call('system:info'),
  backup: () => call('system:backup'),
  restore: () => call('system:restore'),
  openDataDir: () => call('system:openDataDir')
}
