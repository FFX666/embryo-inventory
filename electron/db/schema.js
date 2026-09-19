exports.SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  real_name TEXT,
  role TEXT NOT NULL DEFAULT 'operator',
  phone TEXT,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  barcode TEXT,
  name TEXT NOT NULL,
  category_id INTEGER,
  spec TEXT,
  unit TEXT DEFAULT '个',
  manufacturer TEXT,
  supplier TEXT,
  min_stock REAL DEFAULT 0,
  warn_days INTEGER DEFAULT 30,
  storage_condition TEXT,
  remark TEXT,
  status INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  batch_no TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  remaining REAL NOT NULL DEFAULT 0,
  production_date TEXT,
  expire_date TEXT,
  location TEXT,
  price REAL DEFAULT 0,
  supplier TEXT,
  created_at TEXT,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_batches_item ON batches(item_id);
CREATE INDEX IF NOT EXISTS idx_batches_expire ON batches(expire_date);

CREATE TABLE IF NOT EXISTS stock_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  batch_id INTEGER,
  batch_no TEXT,
  quantity REAL NOT NULL,
  unit TEXT,
  operator_id INTEGER,
  operator_name TEXT,
  handler TEXT,
  purpose TEXT,
  remark TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_item ON stock_records(item_id);
CREATE INDEX IF NOT EXISTS idx_records_time ON stock_records(created_at);

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  module TEXT,
  action TEXT,
  target TEXT,
  detail TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`
