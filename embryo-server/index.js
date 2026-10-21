const { pool } = require('./db')
const crypto = require('crypto')

const hashPassword = (pwd) => crypto.createHash('sha256').update('embryo_lab$' + pwd).digest('hex')
const now = () => new Date()

// 简易日志记录
async function log (conn, module, action, target = '', detail = '') {
  try {
    await conn.query(`INSERT INTO operation_logs (username, module, action, target, detail, created_at) VALUES (?,?,?,?,?,?)`, 
      ['admin', module, action, target, detail, now()])
  } catch (e) { console.error('日志写入失败', e) }
}

const services = {
  // ================= 认证 & 用户 =================
  'auth:login': async ({ username, password }) => {
    const [rows] = await pool.query('SELECT * FROM users WHERE username=?', [username])
    const user = rows[0]
    if (!user) throw new Error('用户名不存在')
    if (user.status !== 1) throw new Error('账号已禁用')
    if (user.password !== hashPassword(password)) throw new Error('密码错误')
    return { id: user.id, username: user.username, real_name: user.real_name, role: user.role }
  },

  'auth:changePwd': async ({ oldPwd, newPwd }) => {
    const [rows] = await pool.query('SELECT * FROM users WHERE username="admin"')
    if (rows[0].password !== hashPassword(oldPwd)) throw new Error('原密码错误')
    await pool.query('UPDATE users SET password=? WHERE username="admin"', [hashPassword(newPwd)])
    return true
  },

  'user:list': async ({ keyword = '' }) => {
    const kw = `%${keyword}%`
    const [rows] = await pool.query('SELECT id,username,real_name,role,phone,status,created_at FROM users WHERE username LIKE ? OR real_name LIKE ? ORDER BY id', [kw, kw])
    return rows
  },

  'user:save': async ({ id, username, password, real_name, role, phone, status }) => {
    if (id) {
      if (password) {
        await pool.query('UPDATE users SET username=?,password=?,real_name=?,role=?,phone=?,status=? WHERE id=?', [username, hashPassword(password), real_name, role, phone, status??1, id])
      } else {
        await pool.query('UPDATE users SET username=?,real_name=?,role=?,phone=?,status=? WHERE id=?', [username, real_name, role, phone, status??1, id])
      }
    } else {
      await pool.query('INSERT INTO users (username,password,real_name,role,phone,status,created_at) VALUES (?,?,?,?,?,?,?)', [username, hashPassword(password), real_name, role, phone, status??1, now()])
    }
    return true
  },

  'user:delete': async ({ id }) => {
    await pool.query('DELETE FROM users WHERE id=?', [id])
    return true
  },

  // ================= 分类 =================
  'category:list': async () => {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY sort,id')
    return rows
  },

  'category:save': async ({ id, name, sort }) => {
    if (id) await pool.query('UPDATE categories SET name=?,sort=? WHERE id=?', [name, sort??0, id])
    else await pool.query('INSERT INTO categories (name,sort) VALUES (?,?)', [name, sort??0])
    return true
  },

  'category:delete': async ({ id }) => {
    const [items] = await pool.query('SELECT id FROM items WHERE category_id=?', [id])
    if (items.length) throw new Error('该分类下存在物料，无法删除')
    await pool.query('DELETE FROM categories WHERE id=?', [id])
    return true
  },

  // ================= 物料 =================
  'item:list': async ({ keyword = '', categoryId = null, status = null, page = 1, pageSize = 10 }) => {
    let sql = `SELECT i.*, cat.name AS category_name, IFNULL(bt.stock, 0) AS current_stock 
               FROM items i 
               LEFT JOIN categories cat ON cat.id = i.category_id 
               LEFT JOIN (SELECT item_id, SUM(remaining) AS stock FROM batches WHERE remaining > 0 GROUP BY item_id) bt ON bt.item_id = i.id 
               WHERE 1=1`
    let countSql = `SELECT COUNT(*) AS total FROM items i WHERE 1=1`
    const params = [], countParams = []

    if (keyword) {
      const kw = `%${keyword}%`
      sql += ` AND (i.name LIKE ? OR i.code LIKE ? OR i.barcode LIKE ?)`
      countSql += ` AND (i.name LIKE ? OR i.code LIKE ? OR i.barcode LIKE ?)`
      params.push(kw, kw, kw); countParams.push(kw, kw, kw)
    }
    if (categoryId) { sql += ` AND i.category_id=?`; countSql += ` AND i.category_id=?`; params.push(categoryId); countParams.push(categoryId) }
    if (status !== null && status !== '') { sql += ` AND i.status=?`; countSql += ` AND i.status=?`; params.push(status); countParams.push(status) }

    const [countRes] = await pool.query(countSql, countParams)
    sql += ` ORDER BY i.id DESC LIMIT ? OFFSET ?`
    params.push(Number(pageSize), Number((page - 1) * pageSize))
    const [rows] = await pool.query(sql, params)
    return { total: countRes[0].total, rows }
  },

  'item:options': async () => {
    const [rows] = await pool.query('SELECT id,code,barcode,name,spec,unit,manufacturer,min_stock,warn_days FROM items WHERE status=1 ORDER BY name')
    return rows
  },

  'item:findByCode': async ({ code }) => {
    if (!code) return null
    const [rows] = await pool.query('SELECT * FROM items WHERE barcode=? OR code=? LIMIT 1', [code.trim(), code.trim()])
    return rows[0] || null
  },

  'item:save': async (p) => {
    if (!p.name) throw new Error('名称不能为空')
    const date = now()
    if (p.id) {
      await pool.query(`UPDATE items SET code=?,name=?,category_id=?,spec=?,unit=?,manufacturer=?,min_stock=?,warn_days=?,status=?,updated_at=? WHERE id=?`, 
        [p.code||'', p.name, p.category_id||null, p.spec||'', p.unit, p.manufacturer||'', p.min_stock||0, p.warn_days||30, p.status??1, date, p.id])
      return true
    } else {
      const [res] = await pool.query(`INSERT INTO items (code,name,category_id,spec,unit,manufacturer,min_stock,warn_days,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [p.code||'', p.name, p.category_id||null, p.spec||'', p.unit, p.manufacturer||'', p.min_stock||0, p.warn_days||30, p.status??1, date])
      return { id: res.insertId }
    }
  },

  'item:delete': async ({ id, force = false }) => {
    const [batches] = await pool.query('SELECT id FROM batches WHERE item_id=?', [id])
    if (batches.length > 0 && !force) throw new Error('该物料存在批次，请使用强制删除')
    
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('DELETE FROM stock_records WHERE item_id=?', [id])
      await conn.query('DELETE FROM batches WHERE item_id=?', [id])
      await conn.query('DELETE FROM items WHERE id=?', [id])
      await conn.commit()
      return true
    } catch (e) { await conn.rollback(); throw e } finally { conn.release() }
  },

  // ================= 批次 =================
  'batch:list': async ({ keyword = '', itemId = null, status = '', page = 1, pageSize = 10 }) => {
    let sql = `SELECT b.*, i.name AS item_name, i.unit, i.manufacturer,
      CASE 
        WHEN b.remaining <= 0 THEN 'used'
        WHEN b.expire_date < CURDATE() THEN 'expired'
        WHEN DATEDIFF(b.expire_date, CURDATE()) <= i.warn_days THEN 'expiring'
        ELSE 'normal' 
      END AS status,
      DATEDIFF(b.expire_date, CURDATE()) AS days_left
      FROM batches b JOIN items i ON i.id = b.item_id WHERE 1=1`
    let countSql = `SELECT COUNT(*) AS total FROM batches b JOIN items i ON i.id=b.item_id WHERE 1=1`
    const params = [], countParams = []

    if (keyword) { 
      sql += ` AND (i.name LIKE ? OR b.batch_no LIKE ?)`; countSql += ` AND (i.name LIKE ? OR b.batch_no LIKE ?)`
      params.push(`%${keyword}%`, `%${keyword}%`); countParams.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (itemId) { sql += ` AND b.item_id=?`; countSql += ` AND b.item_id=?`; params.push(itemId); countParams.push(itemId) }
    if (status === 'expired') { sql += ` AND b.expire_date < CURDATE()`; countSql += ` AND b.expire_date < CURDATE()`; }
    if (status === 'expiring') { sql += ` AND b.expire_date >= CURDATE() AND DATEDIFF(b.expire_date, CURDATE()) <= i.warn_days`; countSql += ` AND b.expire_date >= CURDATE() AND DATEDIFF(b.expire_date, CURDATE()) <= i.warn_days`; }

    const [countRes] = await pool.query(countSql, countParams)
    sql += ` ORDER BY b.id DESC LIMIT ? OFFSET ?`
    params.push(Number(pageSize), Number((page - 1) * pageSize))
    const [rows] = await pool.query(sql, params)
    return { total: countRes[0].total, rows }
  },

  'batch:trace': async ({ batchId }) => {
    const [batchRows] = await pool.query(`SELECT b.*, i.name AS item_name FROM batches b JOIN items i ON i.id=b.item_id WHERE b.id=?`, [batchId])
    const [records] = await pool.query(`SELECT * FROM stock_records WHERE batch_id=? ORDER BY id`, [batchId])
    return { batch: batchRows[0], records }
  },

  'batch:scrap': async ({ batchId, quantity, remark }) => {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [batches] = await conn.query('SELECT * FROM batches WHERE id=? FOR UPDATE', [batchId])
      const b = batches[0]
      if (!b || b.remaining < quantity) throw new Error('库存不足')
      
      await conn.query('UPDATE batches SET remaining = remaining - ? WHERE id=?', [quantity, batchId])
      await conn.query(`INSERT INTO stock_records (type,item_id,batch_id,batch_no,quantity,handler,purpose,remark,created_at) VALUES ('SCRAP',?,?,?,?,?,?,?,?)`, 
        [b.item_id, batchId, b.batch_no, quantity, '管理员', '报废', remark||'', now()])
      await conn.commit()
      return true
    } catch (e) { await conn.rollback(); throw e } finally { conn.release() }
  },

  'batch:delete': async ({ batchId }) => {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('DELETE FROM stock_records WHERE batch_id=?', [batchId])
      await conn.query('DELETE FROM batches WHERE id=?', [batchId])
      await conn.commit()
      return true
    } catch (e) { await conn.rollback(); throw e } finally { conn.release() }
  },

  // ================= 出入库 =================
  'stock:in': async ({ itemId, batchNo, quantity, productionDate, expireDate, location, price, supplier, handler, remark }) => {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [items] = await conn.query('SELECT name, unit FROM items WHERE id=?', [itemId])
      if (!items.length) throw new Error('物料不存在')
      
      const [batches] = await conn.query('SELECT id FROM batches WHERE item_id=? AND batch_no=?', [itemId, batchNo])
      let batchId
      if (batches.length) {
        batchId = batches[0].id
        await conn.query('UPDATE batches SET quantity=quantity+?, remaining=remaining+? WHERE id=?', [quantity, quantity, batchId])
      } else {
        const [res] = await conn.query(`INSERT INTO batches (item_id,batch_no,quantity,remaining,production_date,expire_date,location,price,supplier,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, 
          [itemId, batchNo, quantity, quantity, productionDate||'', expireDate||'', location||'', price||0, supplier||'', now()])
        batchId = res.insertId
      }
      await conn.query(`INSERT INTO stock_records (type,item_id,batch_id,batch_no,quantity,unit,handler,purpose,remark,created_at) VALUES ('IN',?,?,?,?,?,?,?,?,?)`, 
        [itemId, batchId, batchNo, quantity, items[0].unit, handler||'', '采购入库', remark||'', now()])
      
      await conn.commit()
      return { itemName: items[0].name, unit: items[0].unit }
    } catch (e) { await conn.rollback(); throw e } finally { conn.release() }
  },

  'stock:recommend': async ({ itemId }) => {
    const [rows] = await pool.query(`SELECT b.*, DATEDIFF(b.expire_date, CURDATE()) AS days_left FROM batches b WHERE b.item_id=? AND b.remaining > 0 ORDER BY (b.expire_date IS NULL) ASC, b.expire_date ASC, b.id ASC`, [itemId])
    return rows
  },

  'stock:out': async ({ itemId, batchId = null, quantity, handler, purpose, remark }) => {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [items] = await conn.query('SELECT name, unit FROM items WHERE id=?', [itemId])
      
      let remain = Number(quantity)
      let details = []
      let sql = 'SELECT * FROM batches WHERE item_id=? AND remaining > 0 ORDER BY expire_date ASC, id ASC FOR UPDATE'
      if (batchId) sql = 'SELECT * FROM batches WHERE id=? AND remaining > 0 FOR UPDATE'
      
      const [batches] = await conn.query(sql, [batchId || itemId])
      
      for (const b of batches) {
        if (remain <= 0) break
        const take = Math.min(remain, b.remaining)
        await conn.query('UPDATE batches SET remaining=remaining-? WHERE id=?', [take, b.id])
        await conn.query(`INSERT INTO stock_records (type,item_id,batch_id,batch_no,quantity,unit,handler,purpose,remark,created_at) VALUES ('OUT',?,?,?,?,?,?,?,?,?)`, 
          [itemId, b.id, b.batch_no, take, items[0].unit, handler||'', purpose||'', remark||'', now()])
        details.push({ batchNo: b.batch_no, qty: take })
        remain -= take
      }
      if (remain > 0) throw new Error('库存不足')
      await conn.commit()
      return { itemName: items[0].name, unit: items[0].unit, details }
    } catch (e) { await conn.rollback(); throw e } finally { conn.release() }
  },

  // ================= 流水与工作台 =================
  'record:list': async ({ type = '', keyword = '', page = 1, pageSize = 15 }) => {
    let sql = `FROM stock_records r LEFT JOIN items i ON i.id = r.item_id WHERE 1=1`
    const params = []
    if (type) { sql += ` AND r.type=?`; params.push(type) }
    if (keyword) { sql += ` AND (i.name LIKE ? OR r.batch_no LIKE ?)`; params.push(`%${keyword}%`, `%${keyword}%`) }
    
    const [countRes] = await pool.query(`SELECT COUNT(*) as total ${sql}`, params)
    const [rows] = await pool.query(`SELECT r.*, i.name AS item_name, i.spec, i.code AS item_code ${sql} ORDER BY r.id DESC LIMIT ? OFFSET ?`, [...params, Number(pageSize), Number((page-1)*pageSize)])
    return { total: countRes[0].total, rows }
  },

  'dashboard:stats': async () => {
    const [itemCount] = await pool.query('SELECT COUNT(*) AS c FROM items WHERE status=1')
    const [batchCount] = await pool.query('SELECT COUNT(*) AS c FROM batches WHERE remaining>0')
    const [totalValue] = await pool.query('SELECT IFNULL(SUM(remaining*price),0) AS v FROM batches WHERE remaining>0')
    
    const [lowStock] = await pool.query(`SELECT i.id, i.name, i.spec, i.unit, i.min_stock, IFNULL(SUM(b.remaining),0) as stock FROM items i LEFT JOIN batches b ON b.item_id=i.id WHERE i.status=1 GROUP BY i.id HAVING stock <= i.min_stock AND i.min_stock > 0`)
    const [expiring] = await pool.query(`SELECT b.id, b.batch_no, b.remaining, b.expire_date, i.name AS item_name, DATEDIFF(b.expire_date, CURDATE()) AS days_left FROM batches b JOIN items i ON i.id=b.item_id WHERE b.remaining>0 AND b.expire_date >= CURDATE() AND DATEDIFF(b.expire_date, CURDATE()) <= i.warn_days`)
    const [expired] = await pool.query(`SELECT b.id, b.batch_no, b.remaining, b.expire_date, i.name AS item_name, DATEDIFF(CURDATE(), b.expire_date) AS days_over FROM batches b JOIN items i ON i.id=b.item_id WHERE b.remaining>0 AND b.expire_date < CURDATE()`)
    const [recentRecords] = await pool.query(`SELECT r.*, i.name AS item_name, i.unit AS item_unit FROM stock_records r LEFT JOIN items i ON i.id=r.item_id ORDER BY r.id DESC LIMIT 12`)
    
    // 近7日趋势
    const [trendRaw] = await pool.query(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as d, SUM(CASE WHEN type='IN' THEN quantity ELSE 0 END) as inQty, SUM(CASE WHEN type='OUT' THEN quantity ELSE 0 END) as outQty FROM stock_records WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY d`)
    const trend = []
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000)
      const p = n => String(n).padStart(2, '0')
      const key = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
      const hit = trendRaw.find(x => x.d === key)
      trend.push({ date: key, inQty: hit?.inQty || 0, outQty: hit?.outQty || 0 })
    }

    const [categoryDist] = await pool.query(`SELECT IFNULL(cat.name,'未分类') name, COUNT(DISTINCT i.id) itemCount, IFNULL(SUM(b.remaining),0) stock FROM items i LEFT JOIN categories cat ON cat.id=i.category_id LEFT JOIN batches b ON b.item_id=i.id AND b.remaining>0 GROUP BY cat.id`)

    return {
      itemCount: itemCount[0].c, batchCount: batchCount[0].c, totalValue: totalValue[0].v,
      counts: { lowStock: lowStock.length, expiring: expiring.length, expired: expired.length },
      lowStock, expiring, expired, recentRecords, trend, categoryDist
    }
  },

  // ================= 报表 =================
  'report:summary': async () => {
    const [inOut] = await pool.query(`SELECT i.id, i.code, i.name, i.spec, i.unit, IFNULL(SUM(CASE WHEN r.type='IN' THEN r.quantity END),0) AS inQty, IFNULL(SUM(CASE WHEN r.type='OUT' THEN r.quantity END),0) AS outQty FROM items i LEFT JOIN stock_records r ON r.item_id=i.id GROUP BY i.id`)
    const [byHandler] = await pool.query(`SELECT IFNULL(NULLIF(handler,''),'未填写') handler, SUM(quantity) outQty, COUNT(*) times FROM stock_records WHERE type='OUT' GROUP BY handler ORDER BY outQty DESC`)
    return { inOut, byHandler }
  },

  // ================= 日志 & 系统 =================
  'log:list': async ({ keyword = '', module = '', page = 1, pageSize = 15 }) => {
    let sql = `FROM operation_logs WHERE 1=1`
    const params = []
    if (keyword) { sql += ` AND (username LIKE ? OR target LIKE ? OR detail LIKE ?)`; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`) }
    if (module) { sql += ` AND module=?`; params.push(module) }
    const [countRes] = await pool.query(`SELECT COUNT(*) as total ${sql}`, params)
    const [rows] = await pool.query(`SELECT * ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, Number(pageSize), Number((page-1)*pageSize)])
    return { total: countRes[0].total, rows }
  },

  'system:info': async () => {
    return {
      dbPath: 'MySQL 局域网数据库',
      dataDir: '主机后台',
      dbSize: 1024 * 1024 * 5,
      version: '1.0.0-进阶版',
      electron: process.versions.electron || 'N/A',
      node: process.versions.node,
      counts: { items: 0, batches: 0, records: 0, logs: 0 }
    }
  }
}

module.exports = services