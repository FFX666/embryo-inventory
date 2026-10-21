const mysql = require('mysql2/promise')
require('dotenv').config()

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

async function initDatabase() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(100) NOT NULL, real_name VARCHAR(50), role VARCHAR(20) NOT NULL DEFAULT 'operator',
      phone VARCHAR(20), status INT NOT NULL DEFAULT 1, created_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL UNIQUE, sort INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS items (
      id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(50) UNIQUE, barcode VARCHAR(50), name VARCHAR(100) NOT NULL,
      category_id INT, spec VARCHAR(100), unit VARCHAR(20) DEFAULT '个', manufacturer VARCHAR(100), supplier VARCHAR(100),
      min_stock DOUBLE DEFAULT 0, warn_days INT DEFAULT 30, storage_condition VARCHAR(100), remark TEXT,
      status INT DEFAULT 1, created_at DATETIME, updated_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS batches (
      id INT AUTO_INCREMENT PRIMARY KEY, item_id INT NOT NULL, batch_no VARCHAR(50) NOT NULL,
      quantity DOUBLE NOT NULL DEFAULT 0, remaining DOUBLE NOT NULL DEFAULT 0,
      production_date VARCHAR(20), expire_date VARCHAR(20), location VARCHAR(100),
      price DOUBLE DEFAULT 0, supplier VARCHAR(100), created_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS stock_records (
      id INT AUTO_INCREMENT PRIMARY KEY, type VARCHAR(20) NOT NULL, item_id INT NOT NULL, batch_id INT,
      batch_no VARCHAR(50), quantity DOUBLE NOT NULL, unit VARCHAR(20), operator_id INT, operator_name VARCHAR(50),
      handler VARCHAR(50), purpose VARCHAR(100), remark TEXT, created_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS operation_logs (
      id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, username VARCHAR(50), module VARCHAR(50),
      action VARCHAR(50), target VARCHAR(100), detail TEXT, created_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(50) PRIMARY KEY, value TEXT
    )`
  ]
  for (const q of queries) await pool.query(q)
  console.log('✅ MySQL 表结构初始化完成')

  // 初始化默认管理员 admin / admin123
  const [rows] = await pool.query('SELECT * FROM users WHERE username = "admin"')
  if (rows.length === 0) {
    const crypto = require('crypto')
    const hash = crypto.createHash('sha256').update('embryo_lab$admin123').digest('hex')
    await pool.query('INSERT INTO users (username, password, real_name, role, status) VALUES (?, ?, ?, ?, 1)', 
      ['admin', hash, '系统管理员', 'admin'])
    console.log('✅ 默认管理员创建成功 (admin / admin123)')
  }
}

module.exports = { pool, initDatabase }