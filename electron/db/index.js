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

/* -------------------- 种子数据 --------------------
 * 说明：仅在首次启动（数据库为空）时插入
 * - 3 个登录账号（管理员 / 录入员 / 只读用户）
 * - 6 个物料分类
 * - 2 个系统设置项
 * 不预置任何物料 / 批次 / 流水，保证概览与物料档案数据一致
 */
function seed () {
  const db = getDb()
  const nowStr = now()

  if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
    const stmt = db.prepare(
      `INSERT INTO users (username,password,real_name,role,status,created_at) VALUES (?,?,?,?,1,?)`
    )
    stmt.run('admin', hashPassword('admin123'), '系统管理员', 'admin', nowStr)
    
  }

  if (db.prepare('SELECT COUNT(*) c FROM categories').get().c === 0) {
    const cats = ['培养液', '耗材', '试剂', '冷冻耗材', '玻璃器皿', '消毒用品']
    const stmt = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)')
    cats.forEach((n, i) => stmt.run(n, i + 1))
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
