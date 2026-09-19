const { ipcMain, dialog, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const ExcelJS = require('exceljs')
const Database = require('better-sqlite3')
const {
  getDb, getDbPath, getDataDir, hashPassword, now, closeDb, reopenDb
} = require('../db')
const session = require('./session')

/* -------- 通用包装 -------- */
function handle (channel, fn) {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      const data = await fn(payload || {}, event)
      return { success: true, data }
    } catch (err) {
      console.error(`[IPC] ${channel}`, err)
      return { success: false, message: err?.message || String(err) }
    }
  })
}

/* -------- 操作日志 -------- */
function log (module, action, target = '', detail = '') {
  const db = getDb()
  const u = session.get()
  db.prepare(`INSERT INTO operation_logs
    (user_id, username, module, action, target, detail, created_at)
    VALUES (?,?,?,?,?,?,?)`)
    .run(u?.id ?? null, u?.username ?? 'system', module, action, target, detail, now())
}

function registerIpc () {
  /* ============================================================
   * 一、认证 & 账号
   * ============================================================ */
  handle('auth:login', ({ username, password }) => {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(username)
    if (!user) throw new Error('用户名不存在')
    if (user.status !== 1) throw new Error('该账号已被禁用，请联系管理员')
    if (user.password !== hashPassword(password)) throw new Error('密码错误')

    const safe = { id: user.id, username: user.username, real_name: user.real_name, role: user.role }
    session.set(safe)
    log('系统', '登录', user.username, '登录成功')
    return safe
  })

  handle('auth:logout', () => {
    const u = session.get()
    if (u) log('系统', '登出', u.username, '退出登录')
    session.set(null)
    return true
  })

  handle('auth:changePwd', ({ oldPwd, newPwd }) => {
    const u = session.get()
    if (!u) throw new Error('未登录')
    const db = getDb()
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(u.id)
    if (row.password !== hashPassword(oldPwd)) throw new Error('原密码不正确')
    if (!newPwd || newPwd.length < 6) throw new Error('新密码不少于 6 位')
    db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(newPwd), u.id)
    log('系统', '修改', '密码', '用户修改本人密码')
    return true
  })

  handle('user:list', ({ keyword = '' } = {}) => {
    const db = getDb()
    const kw = `%${keyword}%`
    return db.prepare(`SELECT id,username,real_name,role,phone,status,created_at FROM users
      WHERE username LIKE ? OR real_name LIKE ? ORDER BY id`).all(kw, kw)
  })

  handle('user:save', ({ id, username, password, real_name, role, phone, status }) => {
    const db = getDb()
    if (!username) throw new Error('用户名不能为空')
    if (id) {
      if (password) {
        db.prepare('UPDATE users SET username=?,password=?,real_name=?,role=?,phone=?,status=? WHERE id=?')
          .run(username, hashPassword(password), real_name, role, phone, status ?? 1, id)
      } else {
        db.prepare('UPDATE users SET username=?,real_name=?,role=?,phone=?,status=? WHERE id=?')
          .run(username, real_name, role, phone, status ?? 1, id)
      }
      log('系统管理', '修改', '账号', `修改账号 ${username}`)
    } else {
      if (!password) throw new Error('新建账号必须设置密码')
      const exist = db.prepare('SELECT id FROM users WHERE username=?').get(username)
      if (exist) throw new Error('用户名已存在')
      db.prepare('INSERT INTO users (username,password,real_name,role,phone,status,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(username, hashPassword(password), real_name, role, phone, status ?? 1, now())
      log('系统管理', '新增', '账号', `新增账号 ${username}（${role}）`)
    }
    return true
  })

  handle('user:delete', ({ id }) => {
    const db = getDb()
    const u = session.get()
    if (u?.id === id) throw new Error('不能删除当前登录账号')
    const row = db.prepare('SELECT username FROM users WHERE id=?').get(id)
    db.prepare('DELETE FROM users WHERE id=?').run(id)
    log('系统管理', '删除', '账号', `删除账号 ${row?.username || id}`)
    return true
  })

  /* ============================================================
   * 二、分类
   * ============================================================ */
  handle('category:list', () => getDb().prepare('SELECT * FROM categories ORDER BY sort,id').all())

  handle('category:save', ({ id, name, sort }) => {
    const db = getDb()
    if (!name) throw new Error('分类名称不能为空')
    if (id) { db.prepare('UPDATE categories SET name=?,sort=? WHERE id=?').run(name, sort ?? 0, id) }
    else { db.prepare('INSERT INTO categories (name,sort) VALUES (?,?)').run(name, sort ?? 0) }
    log('基础档案', id ? '修改' : '新增', '分类', name)
    return true
  })

  handle('category:delete', ({ id }) => {
    const db = getDb()
    if (db.prepare('SELECT COUNT(*) c FROM items WHERE category_id=?').get(id).c)
      throw new Error('该分类下存在物料，无法删除')
    db.prepare('DELETE FROM categories WHERE id=?').run(id)
    log('基础档案', '删除', '分类', String(id))
    return true
  })

  /* ============================================================
   * 三、物料档案
   * ============================================================ */
  const ITEM_BASE = `
    FROM items i
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN (
      SELECT item_id, SUM(remaining) AS stock FROM batches WHERE remaining > 0 GROUP BY item_id
    ) b ON b.item_id = i.id
  `

  handle('item:list', ({ keyword = '', categoryId = null, status = null, page = 1, pageSize = 10 } = {}) => {
    const db = getDb()
    const where = ['1=1'], params = []
    if (keyword) {
      where.push('(i.name LIKE ? OR i.code LIKE ? OR i.barcode LIKE ? OR i.manufacturer LIKE ?)')
      const kw = `%${keyword}%`
      params.push(kw, kw, kw, kw)
    }
    if (categoryId) { where.push('i.category_id=?'); params.push(categoryId) }
    if (status !== null && status !== '') { where.push('i.status=?'); params.push(status) }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const total = db.prepare(`SELECT COUNT(*) c ${ITEM_BASE} ${whereSql}`).get(...params).c
    const rows = db.prepare(`
      SELECT i.*, c.name AS category_name, IFNULL(b.stock,0) AS current_stock
      ${ITEM_BASE} ${whereSql}
      ORDER BY i.id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize)
    return { total, rows }
  })

  handle('item:options', () =>
    getDb().prepare(`SELECT id,code,barcode,name,spec,unit,manufacturer,min_stock,warn_days
      FROM items WHERE status=1 ORDER BY name`).all())

  handle('item:findByCode', ({ code }) => {
    if (!code) return null
    return getDb().prepare(
      `SELECT * FROM items WHERE barcode=? OR code=? LIMIT 1`).get(code.trim(), code.trim()) || null
  })

  handle('item:save', (p) => {
    const db = getDb()
    if (!p.name) throw new Error('物料名称不能为空')
    if (p.code) {
      const dup = db.prepare('SELECT id FROM items WHERE code=? AND id<>?').get(p.code, p.id || 0)
      if (dup) throw new Error('物料编码已存在')
    }
    const args = [
      p.code || '', p.barcode || '', p.name, p.category_id || null, p.spec || '',
      p.unit || '个', p.manufacturer || '', p.supplier || '',
      Number(p.min_stock) || 0, Number(p.warn_days) || 30,
      p.storage_condition || '', p.remark || '', p.status ?? 1
    ]
    if (p.id) {
      db.prepare(`UPDATE items SET code=?,barcode=?,name=?,category_id=?,spec=?,unit=?,manufacturer=?,
        supplier=?,min_stock=?,warn_days=?,storage_condition=?,remark=?,status=?,updated_at=? WHERE id=?`)
        .run(...args, now(), p.id)
      log('基础档案', '修改', '物料', p.name)
    } else {
      db.prepare(`INSERT INTO items (code,barcode,name,category_id,spec,unit,manufacturer,supplier,
        min_stock,warn_days,storage_condition,remark,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...args, now(), now())
      log('基础档案', '新增', '物料', p.name)
    }
    return true
  })

  handle('item:delete', ({ id }) => {
    const db = getDb()
    const row = db.prepare('SELECT name FROM items WHERE id=?').get(id)
    const used = db.prepare('SELECT COUNT(*) c FROM batches WHERE item_id=? AND remaining>0').get(id).c
    if (used) throw new Error('该物料仍有库存批次，无法删除，请先出库或作废')
    db.prepare('DELETE FROM items WHERE id=?').run(id)
    log('基础档案', '删除', '物料', row?.name || String(id))
    return true
  })

  /* ============================================================
   * 四、批次库存
   * ============================================================ */
  const BATCH_SELECT = `
    SELECT b.*, i.name AS item_name, i.code AS item_code, i.spec, i.unit,
           i.manufacturer, i.warn_days,
      CASE
        WHEN b.remaining <= 0 THEN 'used'
        WHEN b.expire_date IS NULL OR b.expire_date='' THEN 'normal'
        WHEN b.expire_date < date('now','localtime') THEN 'expired'
        WHEN b.expire_date <= date('now','localtime','+' || IFNULL(i.warn_days,30) || ' days') THEN 'expiring'
        ELSE 'normal'
      END AS status,
      CASE WHEN b.expire_date IS NULL OR b.expire_date='' THEN NULL
           ELSE CAST(julianday(b.expire_date) - julianday(date('now','localtime')) AS INTEGER)
      END AS days_left
    FROM batches b JOIN items i ON i.id = b.item_id
  `

  handle('batch:list', ({ keyword = '', itemId = null, status = '', page = 1, pageSize = 10 } = {}) => {
    const db = getDb()
    const where = ['1=1'], params = []
    if (keyword) {
      where.push('(i.name LIKE ? OR b.batch_no LIKE ? OR i.code LIKE ?)')
      const kw = `%${keyword}%`
      params.push(kw, kw, kw)
    }
    if (itemId) { where.push('b.item_id=?'); params.push(itemId) }
    if (status === 'used') where.push('b.remaining <= 0')
    if (status === 'expired') where.push(`b.remaining > 0 AND b.expire_date < date('now','localtime')`)
    if (status === 'expiring') where.push(`b.remaining > 0 AND b.expire_date >= date('now','localtime')
      AND b.expire_date <= date('now','localtime','+' || IFNULL(i.warn_days,30) || ' days')`)
    if (status === 'normal') where.push(`b.remaining > 0 AND (b.expire_date IS NULL OR b.expire_date=''
      OR b.expire_date > date('now','localtime','+' || IFNULL(i.warn_days,30) || ' days'))`)

    const whereSql = `WHERE ${where.join(' AND ')}`
    const total = db.prepare(`SELECT COUNT(*) c FROM batches b JOIN items i ON i.id=b.item_id ${whereSql}`)
      .get(...params).c
    const rows = db.prepare(`${BATCH_SELECT} ${whereSql} ORDER BY b.id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize)
    return { total, rows }
  })

  handle('batch:trace', ({ batchId }) => {
    const db = getDb()
    const batch = db.prepare(`${BATCH_SELECT} WHERE b.id=?`).get(batchId)
    const records = db.prepare(`SELECT * FROM stock_records WHERE batch_id=? ORDER BY id`).all(batchId)
    return { batch, records }
  })

  handle('batch:scrap', ({ batchId, quantity, remark }) => {
    const db = getDb()
    const u = session.get()
    const qty = Number(quantity)
    if (!qty || qty <= 0) throw new Error('报废数量必须大于 0')

    const tx = db.transaction(() => {
      const b = db.prepare('SELECT * FROM batches WHERE id=?').get(batchId)
      if (!b) throw new Error('批次不存在')
      if (b.remaining < qty) throw new Error(`该批次剩余仅 ${b.remaining}`)
      db.prepare('UPDATE batches SET remaining = remaining - ? WHERE id=?').run(qty, batchId)
      db.prepare(`INSERT INTO stock_records
        (type,item_id,batch_id,batch_no,quantity,unit,operator_id,operator_name,handler,purpose,remark,created_at)
        VALUES ('SCRAP',?,?,?,?,?,?,?,?,?,?,?)`)
        .run(b.item_id, batchId, b.batch_no, qty, '', u?.id ?? null,
             u?.real_name || u?.username || '', '', '报废', remark || '', now())
      return b
    })
    const b = tx()
    log('库存管理', '作废', `批号 ${b.batch_no}`, `报废 ${qty}`)
    return true
  })

  /* ============================================================
   * 五、入库
   * ============================================================ */
  handle('stock:in', ({ itemId, batchNo, quantity, productionDate, expireDate, location, price, supplier, handler, remark }) => {
    const db = getDb()
    const u = session.get()
    const qty = Number(quantity)
    if (!itemId) throw new Error('请选择物料')
    if (!batchNo) throw new Error('请填写批号')
    if (!qty || qty <= 0) throw new Error('入库数量必须大于 0')

    const tx = db.transaction(() => {
      const item = db.prepare('SELECT * FROM items WHERE id=?').get(itemId)
      if (!item) throw new Error('物料不存在')

      let batch = db.prepare('SELECT * FROM batches WHERE item_id=? AND batch_no=?').get(itemId, batchNo)
      let batchId
      if (batch) {
        db.prepare(`UPDATE batches SET quantity=quantity+?, remaining=remaining+?,
          expire_date=COALESCE(NULLIF(?,''),expire_date),
          production_date=COALESCE(NULLIF(?,''),production_date),
          location=COALESCE(NULLIF(?,''),location),
          price=CASE WHEN ?>0 THEN ? ELSE price END WHERE id=?`)
          .run(qty, qty, expireDate || '', productionDate || '', location || '',
               Number(price) || 0, Number(price) || 0, batch.id)
        batchId = batch.id
      } else {
        const r = db.prepare(`INSERT INTO batches
          (item_id,batch_no,quantity,remaining,production_date,expire_date,location,price,supplier,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(itemId, batchNo, qty, qty, productionDate || '', expireDate || '',
               location || '', Number(price) || 0, supplier || '', now())
        batchId = r.lastInsertRowid
      }

      db.prepare(`INSERT INTO stock_records
        (type,item_id,batch_id,batch_no,quantity,unit,operator_id,operator_name,handler,purpose,remark,created_at)
        VALUES ('IN',?,?,?,?,?,?,?,?,?,?,?)`)
        .run(itemId, batchId, batchNo, qty, item.unit, u?.id ?? null,
             u?.real_name || u?.username || '', handler || '', '采购入库', remark || '', now())

      return { batchId, itemName: item.name, unit: item.unit }
    })

    const res = tx()
    log('库存管理', '入库', `${res.itemName} / ${batchNo}`, `数量 ${qty} ${res.unit || ''}`)
    return res
  })

  /* ============================================================
   * 六、出库
   * ============================================================ */
  handle('stock:recommend', ({ itemId, quantity = 0 }) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT b.*,
        CASE WHEN b.expire_date IS NULL OR b.expire_date='' THEN 999999
             ELSE CAST(julianday(b.expire_date) - julianday(date('now','localtime')) AS INTEGER) END AS days_left
      FROM batches b
      WHERE b.item_id=? AND b.remaining > 0
      ORDER BY (b.expire_date IS NULL OR b.expire_date='') ASC, b.expire_date ASC, b.id ASC
    `).all(itemId)

    let need = Number(quantity) || 0
    return rows.map((b, idx) => {
      const take = need > 0 ? Math.min(need, b.remaining) : 0
      need -= take
      return {
        ...b,
        recommended: idx === 0,
        suggestQty: take > 0 ? take : 0,
        expired: b.days_left < 0
      }
    })
  })

  handle('stock:out', ({ itemId, batchId = null, quantity, handler, purpose, remark }) => {
    const db = getDb()
    const u = session.get()
    const qty = Number(quantity)
    if (!itemId) throw new Error('请选择物料')
    if (!qty || qty <= 0) throw new Error('出库数量必须大于 0')

    const tx = db.transaction(() => {
      const item = db.prepare('SELECT * FROM items WHERE id=?').get(itemId)
      if (!item) throw new Error('物料不存在')

      const totalStock = db.prepare('SELECT IFNULL(SUM(remaining),0) s FROM batches WHERE item_id=?')
        .get(itemId).s
      if (totalStock < qty) throw new Error(`库存不足，当前可用 ${totalStock} ${item.unit || ''}`)

      let remain = qty
      const details = []

      const deduct = (batch, take) => {
        db.prepare('UPDATE batches SET remaining = remaining - ? WHERE id=?').run(take, batch.id)
        db.prepare(`INSERT INTO stock_records
          (type,item_id,batch_id,batch_no,quantity,unit,operator_id,operator_name,handler,purpose,remark,created_at)
          VALUES ('OUT',?,?,?,?,?,?,?,?,?,?,?)`)
          .run(itemId, batch.id, batch.batch_no, take, item.unit, u?.id ?? null,
               u?.real_name || u?.username || '', handler || '', purpose || '', remark || '', now())
        details.push({ batchNo: batch.batch_no, qty: take, expireDate: batch.expire_date })
      }

      if (batchId) {
        const b = db.prepare('SELECT * FROM batches WHERE id=?').get(batchId)
        if (!b) throw new Error('批次不存在')
        if (b.remaining < remain) throw new Error(`该批次剩余不足，仅剩 ${b.remaining}`)
        deduct(b, remain)
        remain = 0
      } else {
        const batches = db.prepare(`
          SELECT * FROM batches WHERE item_id=? AND remaining > 0
          ORDER BY (expire_date IS NULL OR expire_date='') ASC, expire_date ASC, id ASC
        `).all(itemId)
        for (const b of batches) {
          if (remain <= 0) break
          const take = Math.min(remain, b.remaining)
          deduct(b, take)
          remain -= take
        }
      }
      if (remain > 0) throw new Error('库存不足，出库失败')
      return { itemName: item.name, unit: item.unit, details }
    })

    const res = tx()
    log('库存管理', '出库', res.itemName,
        `数量 ${qty} ${res.unit || ''}；批次：${res.details.map(d => `${d.batchNo}×${d.qty}`).join('、')}`)
    return res
  })

  /* ============================================================
   * 七、流水查询
   * ============================================================ */
  handle('record:list', ({ type = '', keyword = '', startDate = '', endDate = '', page = 1, pageSize = 15 } = {}) => {
    const db = getDb()
    const where = ['1=1'], params = []
    if (type) { where.push('r.type=?'); params.push(type) }
    if (keyword) {
      where.push('(i.name LIKE ? OR r.batch_no LIKE ? OR r.handler LIKE ? OR r.operator_name LIKE ?)')
      const kw = `%${keyword}%`
      params.push(kw, kw, kw, kw)
    }
    if (startDate) { where.push("date(r.created_at) >= date(?)"); params.push(startDate) }
    if (endDate) { where.push("date(r.created_at) <= date(?)"); params.push(endDate) }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const base = `FROM stock_records r LEFT JOIN items i ON i.id = r.item_id ${whereSql}`
    const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...params).c
    const rows = db.prepare(`
      SELECT r.*, i.name AS item_name, i.spec, i.code AS item_code
      ${base} ORDER BY r.id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize)
    return { total, rows }
  })

  /* ============================================================
   * 八、工作台
   * ============================================================ */
  handle('dashboard:stats', () => {
    const db = getDb()

    const itemCount = db.prepare('SELECT COUNT(*) c FROM items WHERE status=1').get().c
    const batchCount = db.prepare('SELECT COUNT(*) c FROM batches WHERE remaining>0').get().c
    const totalValue = db.prepare('SELECT IFNULL(SUM(remaining*price),0) v FROM batches WHERE remaining>0').get().v

    const lowStock = db.prepare(`
      SELECT i.id, i.code, i.name, i.spec, i.unit, i.manufacturer, i.min_stock,
             IFNULL(SUM(b.remaining),0) AS stock
      FROM items i
      LEFT JOIN batches b ON b.item_id = i.id AND b.remaining > 0
      WHERE i.status = 1
      GROUP BY i.id
      HAVING i.min_stock > 0 AND stock <= i.min_stock
      ORDER BY (stock * 1.0 / i.min_stock) ASC
    `).all()

    const expiring = db.prepare(`
      SELECT b.id, b.batch_no, b.remaining, b.expire_date, b.location,
             i.name AS item_name, i.spec, i.unit, i.manufacturer,
             CAST(julianday(b.expire_date) - julianday(date('now','localtime')) AS INTEGER) AS days_left
      FROM batches b JOIN items i ON i.id = b.item_id
      WHERE b.remaining > 0 AND b.expire_date IS NOT NULL AND b.expire_date <> ''
        AND b.expire_date >= date('now','localtime')
        AND b.expire_date <= date('now','localtime','+' || IFNULL(i.warn_days,30) || ' days')
      ORDER BY b.expire_date ASC
    `).all()

    const expired = db.prepare(`
      SELECT b.id, b.batch_no, b.remaining, b.expire_date, b.location,
             i.name AS item_name, i.spec, i.unit, i.manufacturer,
             CAST(julianday(date('now','localtime')) - julianday(b.expire_date) AS INTEGER) AS days_over
      FROM batches b JOIN items i ON i.id = b.item_id
      WHERE b.remaining > 0 AND b.expire_date IS NOT NULL AND b.expire_date <> ''
        AND b.expire_date < date('now','localtime')
      ORDER BY b.expire_date ASC
    `).all()

    const recentRecords = db.prepare(`
      SELECT r.*, i.name AS item_name, i.unit AS item_unit
      FROM stock_records r LEFT JOIN items i ON i.id = r.item_id
      ORDER BY r.id DESC LIMIT 12
    `).all()

    const trendRaw = db.prepare(`
      SELECT date(created_at) d,
        SUM(CASE WHEN type='IN' THEN quantity ELSE 0 END) inQty,
        SUM(CASE WHEN type='OUT' THEN quantity ELSE 0 END) outQty
      FROM stock_records
      WHERE date(created_at) >= date('now','localtime','-6 days')
      GROUP BY d ORDER BY d
    `).all()

    const trend = []
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000)
      const p = n => String(n).padStart(2, '0')
      const key = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
      const hit = trendRaw.find(x => x.d === key)
      trend.push({ date: key, inQty: hit?.inQty || 0, outQty: hit?.outQty || 0 })
    }

    const categoryDist = db.prepare(`
      SELECT IFNULL(c.name,'未分类') name, COUNT(DISTINCT i.id) itemCount,
             IFNULL(SUM(b.remaining),0) stock
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id
      LEFT JOIN batches b ON b.item_id = i.id AND b.remaining > 0
      GROUP BY c.id ORDER BY stock DESC
    `).all()

    return {
      itemCount, batchCount, totalValue,
      counts: { lowStock: lowStock.length, expiring: expiring.length, expired: expired.length },
      lowStock, expiring, expired, recentRecords, trend, categoryDist
    }
  })

  /* ============================================================
   * 九、报表
   * ============================================================ */
  handle('report:summary', ({ startDate = '', endDate = '' } = {}) => {
    const db = getDb()
    const where = ['1=1'], params = []
    if (startDate) { where.push("date(r.created_at) >= date(?)"); params.push(startDate) }
    if (endDate) { where.push("date(r.created_at) <= date(?)"); params.push(endDate) }
    const whereSql = `WHERE ${where.join(' AND ')}`

    const inOut = db.prepare(`
      SELECT i.id, i.code, i.name, i.spec, i.unit, i.manufacturer,
        IFNULL(SUM(CASE WHEN r.type='IN'    THEN r.quantity END),0) AS inQty,
        IFNULL(SUM(CASE WHEN r.type='OUT'   THEN r.quantity END),0) AS outQty,
        IFNULL(SUM(CASE WHEN r.type='SCRAP' THEN r.quantity END),0) AS scrapQty
      FROM items i
      LEFT JOIN stock_records r ON r.item_id = i.id ${startDate || endDate ? 'AND ' + where.slice(1).join(' AND ') : ''}
      GROUP BY i.id ORDER BY i.id
    `).all(...(startDate || endDate ? params : []))

    const byHandler = db.prepare(`
      SELECT IFNULL(NULLIF(handler,''),'未填写') handler,
             SUM(CASE WHEN type='OUT' THEN quantity ELSE 0 END) outQty,
             COUNT(*) times
      FROM stock_records r ${whereSql} AND type='OUT'
      GROUP BY handler ORDER BY outQty DESC
    `).all(...params)

    return { inOut, byHandler }
  })

  handle('report:export', async ({ filename = 'export.xlsx', sheets = [] }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出 Excel',
      defaultPath: filename,
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (canceled || !filePath) return { cancelled: true }

    const wb = new ExcelJS.Workbook()
    wb.creator = '胚胎实验室库存管理系统'
    wb.created = new Date()

    sheets.forEach(s => {
      const ws = wb.addWorksheet(s.name || 'Sheet1')
      ws.columns = (s.columns || []).map(c => ({
        header: c.header, key: c.key, width: c.width || 18
      }))
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
      ;(s.rows || []).forEach(r => ws.addRow(r))
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

    await wb.xlsx.writeFile(filePath)
    log('报表中心', '导出', 'Excel', path.basename(filePath))
    return { success: true, path: filePath }
  })

  /* ============================================================
   * 十、操作日志
   * ============================================================ */
  handle('log:list', ({ keyword = '', module = '', startDate = '', endDate = '', page = 1, pageSize = 15 } = {}) => {
    const db = getDb()
    const where = ['1=1'], params = []
    if (keyword) {
      where.push('(username LIKE ? OR target LIKE ? OR detail LIKE ? OR action LIKE ?)')
      const kw = `%${keyword}%`
      params.push(kw, kw, kw, kw)
    }
    if (module) { where.push('module=?'); params.push(module) }
    if (startDate) { where.push('date(created_at) >= date(?)'); params.push(startDate) }
    if (endDate) { where.push('date(created_at) <= date(?)'); params.push(endDate) }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const total = db.prepare(`SELECT COUNT(*) c FROM operation_logs ${whereSql}`).get(...params).c
    const rows = db.prepare(`SELECT * FROM operation_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize)
    return { total, rows }
  })

  /* ============================================================
   * 十一、系统
   * ============================================================ */
  handle('system:info', () => {
    const db = getDb()
    const stat = fs.existsSync(getDbPath()) ? fs.statSync(getDbPath()) : { size: 0 }
    return {
      dbPath: getDbPath(),
      dataDir: getDataDir(),
      dbSize: stat.size,
      version: require('../../package.json').version,
      electron: process.versions.electron,
      node: process.versions.node,
      counts: {
        items: db.prepare('SELECT COUNT(*) c FROM items').get().c,
        batches: db.prepare('SELECT COUNT(*) c FROM batches').get().c,
        records: db.prepare('SELECT COUNT(*) c FROM stock_records').get().c,
        logs: db.prepare('SELECT COUNT(*) c FROM operation_logs').get().c
      }
    }
  })

  handle('system:backup', async () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '备份数据库',
      defaultPath: `EmbryoInventory-backup-${stamp}.sqlite3`,
      filters: [{ name: 'SQLite 数据库', extensions: ['sqlite3'] }]
    })
    if (canceled || !filePath) return { cancelled: true }

    await getDb().backup(filePath)
    log('系统设置', '备份', '数据库', path.basename(filePath))
    return { success: true, path: filePath }
  })

  handle('system:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择备份文件恢复',
      filters: [{ name: 'SQLite 数据库', extensions: ['sqlite3', 'db', 'sqlite'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths?.length) return { cancelled: true }
    const src = filePaths[0]

    let probe
    try {
      probe = new Database(src, { readonly: true })
      const t = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='items'").get()
      if (!t) throw new Error('缺少 items 表')
    } catch (e) {
      probe?.close()
      throw new Error('所选文件不是有效的系统备份数据库')
    }
    probe.close()

    const target = getDbPath()
    closeDb()
    try {
      fs.copyFileSync(src, target)
      ;['-wal', '-shm'].forEach(suf => {
        const f = target + suf
        if (fs.existsSync(f)) fs.unlinkSync(f)
      })
    } finally {
      reopenDb()
    }
    log('系统设置', '恢复', '数据库', path.basename(src))
    return { success: true, path: src }
  })

  handle('system:openDataDir', async () => {
    await shell.openPath(getDataDir())
    return true
  })
}

module.exports = { registerIpc, log }
