const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const { SCHEMA } = require('./schema')

let db = null
let dbFilePath = ''

/** 数据目录：Windows -> %LOCALAPPDATA%\EmbryoInventory\data */
function resolveDataDir () {
  const base = process.env.LOCALAPPDATA
    || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.local', 'share'))
  return path.join(base, 'EmbryoInventory', 'data')
}

const getDb = () => {
  if (!db) throw new Error('数据库未初始化')
  return db
}
const getDbPath = () => dbFilePath
const getDataDir = () => path.dirname(dbFilePath)

const hashPassword = (pwd) =>
  crypto.createHash('sha256').update('embryo_lab$' + pwd).digest('hex')

function now () {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function initDatabase () {
  const dir = resolveDataDir()
  fs.mkdirSync(dir, { recursive: true })
  dbFilePath = path.join(dir, 'db.sqlite3')

  db = new Database(dbFilePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  seed()
  return db
}

function closeDb () {
  if (db) {
    try { db.close() } catch (e) {}
    db = null
  }
}

function reopenDb () {
  return initDatabase()
}

/* -------------------- 种子数据 -------------------- */
function seed () {
  const db = getDb()
  const nowStr = now()

  if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
    const stmt = db.prepare(
      `INSERT INTO users (username,password,real_name,role,status,created_at) VALUES (?,?,?,?,1,?)`
    )
    stmt.run('admin', hashPassword('admin123'), '系统管理员', 'admin', nowStr)
    stmt.run('operator', hashPassword('123456'), '张技师', 'operator', nowStr)
    stmt.run('viewer', hashPassword('123456'), '李观察', 'viewer', nowStr)
  }

  if (db.prepare('SELECT COUNT(*) c FROM categories').get().c === 0) {
    const cats = ['培养液', '耗材', '试剂', '冷冻耗材', '玻璃器皿', '消毒用品']
    const stmt = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)')
    cats.forEach((n, i) => stmt.run(n, i + 1))
  }

  if (db.prepare('SELECT COUNT(*) c FROM items').get().c === 0) {
    const catId = (name) => db.prepare('SELECT id FROM categories WHERE name=?').get(name)?.id || null
    const items = [
      ['ML-GIVF-100', '6901001', '受精培养液 G-IVF Plus', catId('培养液'), '100mL/瓶', '瓶', 'Vitrolife', '华信生物', 5, 30, '2~8℃ 避光'],
      ['ML-G1-100',   '6901002', '卵裂培养液 G-1 Plus',   catId('培养液'), '100mL/瓶', '瓶', 'Vitrolife', '华信生物', 5, 30, '2~8℃ 避光'],
      ['ML-G2-100',   '6901003', '囊胚培养液 G-2 Plus',   catId('培养液'), '100mL/瓶', '瓶', 'Vitrolife', '华信生物', 5, 30, '2~8℃ 避光'],
      ['ML-OIL-100',  '6901004', '矿物油 Ovoil',          catId('培养液'), '100mL/瓶', '瓶', 'Vitrolife', '华信生物', 8, 30, '室温避光'],
      ['CS-NEEDLE17', '6902001', '取卵针 17G',            catId('耗材'),   '17G/支',   '支', 'Cook',      '瑞康医疗', 20, 90, '室温干燥'],
      ['CS-DISH35',   '6902002', '培养皿 35mm',           catId('耗材'),   '35×10mm',  '个', 'Falcon',    '瑞康医疗', 200, 180, '室温干燥'],
      ['CS-PIPETTE',  '6902003', '巴斯德吸管',            catId('玻璃器皿'), '230mm',    '支', 'Sigma',     '瑞康医疗', 100, 180, '室温干燥'],
      ['CS-STRAW',    '6902004', '冷冻麦管 0.25mL',       catId('冷冻耗材'), '0.25mL',   '支', 'IMV',       '华信生物', 300, 180, '室温干燥'],
      ['RG-FREEZE',   '6903001', '胚胎冻存液',            catId('试剂'),   '10mL/瓶',  '瓶', 'Irvine',    '华信生物', 3, 30, '-20℃ 冷冻'],
      ['RG-ALCOHOL',  '6903002', '75% 医用酒精',          catId('消毒用品'), '500mL',    '瓶', '利尔康',    '瑞康医疗', 10, 60, '室温避光']
    ]
    const stmt = db.prepare(`INSERT INTO items
      (code,barcode,name,category_id,spec,unit,manufacturer,supplier,min_stock,warn_days,storage_condition,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
    items.forEach(it => stmt.run(...it, nowStr, nowStr))

    const today = new Date()
    const d = (offsetDays) => {
      const t = new Date(today.getTime() + offsetDays * 86400000)
      const p = n => String(n).padStart(2, '0')
      return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
    }
    const batchStmt = db.prepare(`INSERT INTO batches
      (item_id,batch_no,quantity,remaining,production_date,expire_date,location,price,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
    const all = db.prepare('SELECT id, code FROM items').all()
    const find = (code) => all.find(x => x.code === code)?.id

    batchStmt.run(find('ML-GIVF-100'), 'B240301', 10, 4,  d(-380), d(25),  '2号冰箱 A 层', 380, nowStr)
    batchStmt.run(find('ML-GIVF-100'), 'B240815', 10, 10, d(-200), d(160), '2号冰箱 A 层', 385, nowStr)
    batchStmt.run(find('ML-G1-100'),   'B240512', 8,  2,  d(-300), d(-5),  '2号冰箱 B 层', 360, nowStr)
    batchStmt.run(find('ML-G2-100'),   'B240720', 8,  6,  d(-260), d(100), '2号冰箱 B 层', 365, nowStr)
    batchStmt.run(find('ML-OIL-100'),  'OIL2406', 12, 3,  d(-280), d(20),  '常温柜 C 层',  260, nowStr)
    batchStmt.run(find('CS-NEEDLE17'), 'N2401',   60, 18, d(-200), d(70),  '耗材柜 1',     45,  nowStr)
    batchStmt.run(find('CS-DISH35'),   'D2402',   500, 420, d(-180), d(400), '耗材柜 2',     2.5, nowStr)
    batchStmt.run(find('CS-PIPETTE'),  'P2403',   200, 150, d(-160), d(300), '耗材柜 2',     3.2, nowStr)
    batchStmt.run(find('CS-STRAW'),    'S2404',   500, 120, d(-150), d(320), '液氮罐旁',     6,   nowStr)
    batchStmt.run(find('RG-FREEZE'),   'F2405',   5,   1,  d(-100), d(15),  '-20℃ 冰箱 D', 880, nowStr)
    batchStmt.run(find('RG-ALCOHOL'),  'A2406',   24,  26, d(-60),  d(200), '消毒柜',       18,  nowStr)

    const recStmt = db.prepare(`INSERT INTO stock_records
      (type,item_id,batch_id,batch_no,quantity,unit,operator_id,operator_name,handler,purpose,remark,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    const adminId = db.prepare("SELECT id FROM users WHERE username='admin'").get().id
    recStmt.run('IN',  find('ML-GIVF-100'), 1, 'B240301', 10, '瓶', adminId, '系统管理员', '张技师', '采购入库', '首次入库', d(-20) + ' 09:12:00')
    recStmt.run('OUT', find('ML-GIVF-100'), 1, 'B240301', 6,  '瓶', adminId, '系统管理员', '李医生', '取卵培养', '3 号操作台', d(-8) + ' 14:30:00')
    recStmt.run('OUT', find('CS-DISH35'),   7, 'D2402',   80, '个', adminId, '系统管理员', '李医生', '胚胎培养', '', d(-3) + ' 10:05:00')
  }

  if (db.prepare('SELECT COUNT(*) c FROM settings').get().c === 0) {
    const s = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
    s.run('lab_name', '胚胎实验室')
    s.run('default_warn_days', '30')
  }
}

module.exports = {
  initDatabase,
  getDb,
  getDbPath,
  getDataDir,
  closeDb,
  reopenDb,
  hashPassword,
  now
}
