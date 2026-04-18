const path = require('path')
const Database = require('better-sqlite3')
const { Client } = require('pg')
const mysql = require('mysql2/promise')

const TABLES = [
  'users',
  'sessions',
  'customers',
  'readings',
  'bills',
  'settings',
  'tariffs',
  'installations',
  'transaction_categories',
  'transactions',
  'ticket_statuses',
  'ticket_categories',
  'tickets',
  'ticket_updates',
]

const TABLE_COLUMNS = {
  users: ['id', 'username', 'password', 'full_name', 'role'],
  sessions: ['token', 'user_id', 'created_at'],
  customers: ['id', 'name', 'ktp', 'meter', 'grp', 'address', 'phone', 'last_stand', 'status', 'join_date', 'wa_jid'],
  readings: ['id', 'cust_id', 'last_stand', 'current_stand', 'usage', 'date', 'note', 'period', 'created_at', 'photo'],
  bills: ['id', 'cust_id', 'invoice_no', 'period', 'period_key', 'usage', 'water_cost', 'admin', 'ppj', 'total', 'due_date', 'status', 'paid_date', 'created_at'],
  settings: ['key', 'value'],
  tariffs: ['grp', 'blk_order', 'limit_m3', 'price'],
  installations: ['id', 'name', 'ktp', 'address', 'phone', 'email', 'grp', 'notes', 'status', 'install_fee', 'admin_fee', 'total_fee', 'invoice_no', 'invoice_date', 'paid_date', 'installed_date', 'meter_no', 'cust_id', 'created_at'],
  transaction_categories: ['id', 'type', 'name'],
  transactions: ['id', 'date', 'type', 'category', 'description', 'amount', 'ref_bill_id', 'created_at'],
  ticket_statuses: ['id', 'key', 'label', 'variant', 'next_keys', 'sort_order', 'is_default', 'is_active'],
  ticket_categories: ['id', 'name', 'is_active'],
  tickets: ['id', 'ticket_no', 'cust_id', 'reporter_name', 'reporter_phone', 'category', 'description', 'priority', 'status', 'assigned_to', 'notes', 'created_at', 'updated_at', 'resolved_at'],
  ticket_updates: ['id', 'ticket_id', 'status', 'note', 'created_by', 'created_at'],
}

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'petugas'
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ktp TEXT,
  meter TEXT NOT NULL UNIQUE,
  grp TEXT NOT NULL DEFAULT 'R1',
  address TEXT,
  phone TEXT,
  last_stand REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  join_date TEXT NOT NULL DEFAULT (date('now')),
  wa_jid TEXT
);
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cust_id INTEGER NOT NULL REFERENCES customers(id),
  last_stand REAL NOT NULL,
  current_stand REAL NOT NULL,
  usage REAL NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  period TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  photo TEXT
);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cust_id INTEGER NOT NULL REFERENCES customers(id),
  invoice_no TEXT NOT NULL UNIQUE,
  period TEXT NOT NULL,
  period_key TEXT NOT NULL,
  usage REAL NOT NULL,
  water_cost REAL NOT NULL,
  admin REAL NOT NULL DEFAULT 5000,
  ppj REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'unpaid',
  paid_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tariffs (
  grp TEXT NOT NULL,
  blk_order INTEGER NOT NULL,
  limit_m3 REAL,
  price REAL NOT NULL,
  PRIMARY KEY (grp, blk_order)
);
CREATE TABLE IF NOT EXISTS installations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ktp TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  grp TEXT NOT NULL DEFAULT 'R1',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  install_fee REAL,
  admin_fee REAL,
  total_fee REAL,
  invoice_no TEXT,
  invoice_date TEXT,
  paid_date TEXT,
  installed_date TEXT,
  meter_no TEXT,
  cust_id INTEGER REFERENCES customers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS transaction_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(type, name)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  ref_bill_id INTEGER REFERENCES bills(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ticket_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'gray',
  next_keys TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS ticket_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  cust_id INTEGER REFERENCES customers(id),
  reporter_name TEXT NOT NULL,
  reporter_phone TEXT,
  category TEXT NOT NULL DEFAULT 'Lain-lain',
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS ticket_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`

// MySQL 5.6 compatibility notes:
// - TIMESTAMP is used for created_at (DATETIME DEFAULT CURRENT_TIMESTAMP requires 5.6.5+)
// - tickets has two TIMESTAMP DEFAULT CURRENT_TIMESTAMP columns (requires MySQL 5.6.5+)
// - ENGINE=InnoDB + utf8mb4 + COLLATE are explicit so server defaults don't matter
// - join_date has DEFAULT '2000-01-01' as fallback; app always sets the real date
// - Reserved-word columns (key, date, usage) are backtick-quoted here and auto-escaped
//   by escapeMysql56() in the adapter for runtime queries
const MYSQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(191) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'petugas'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(191) PRIMARY KEY,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  ktp VARCHAR(100),
  meter VARCHAR(191) NOT NULL UNIQUE,
  grp VARCHAR(50) NOT NULL DEFAULT 'R1',
  address TEXT,
  phone VARCHAR(50),
  last_stand DOUBLE NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  join_date DATE NOT NULL DEFAULT '2000-01-01',
  wa_jid VARCHAR(191)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cust_id INT NOT NULL,
  last_stand DOUBLE NOT NULL,
  current_stand DOUBLE NOT NULL,
  \`usage\` DOUBLE NOT NULL,
  \`date\` DATE NOT NULL,
  note TEXT,
  period VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  photo MEDIUMTEXT,
  CONSTRAINT fk_readings_customer FOREIGN KEY (cust_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cust_id INT NOT NULL,
  invoice_no VARCHAR(191) NOT NULL UNIQUE,
  period VARCHAR(100) NOT NULL,
  period_key VARCHAR(20) NOT NULL,
  \`usage\` DOUBLE NOT NULL,
  water_cost DOUBLE NOT NULL,
  admin DOUBLE NOT NULL DEFAULT 5000,
  ppj DOUBLE NOT NULL DEFAULT 0,
  total DOUBLE NOT NULL,
  due_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'unpaid',
  paid_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bills_customer FOREIGN KEY (cust_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS settings (
  ` + '`key`' + ` VARCHAR(191) PRIMARY KEY,
  value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS tariffs (
  grp VARCHAR(50) NOT NULL,
  blk_order INT NOT NULL,
  limit_m3 DOUBLE NULL,
  price DOUBLE NOT NULL,
  PRIMARY KEY (grp, blk_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS installations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  ktp VARCHAR(100),
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(191),
  grp VARCHAR(50) NOT NULL DEFAULT 'R1',
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  install_fee DOUBLE,
  admin_fee DOUBLE,
  total_fee DOUBLE,
  invoice_no VARCHAR(191),
  invoice_date DATE,
  paid_date DATE,
  installed_date DATE,
  meter_no VARCHAR(191),
  cust_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_installations_customer FOREIGN KEY (cust_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS transaction_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  \`type\` VARCHAR(50) NOT NULL,
  name VARCHAR(191) NOT NULL,
  UNIQUE KEY uniq_transaction_category (\`type\`, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  \`date\` DATE NOT NULL,
  \`type\` VARCHAR(50) NOT NULL,
  category VARCHAR(191) NOT NULL,
  description TEXT NOT NULL,
  amount DOUBLE NOT NULL,
  ref_bill_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transactions_bill FOREIGN KEY (ref_bill_id) REFERENCES bills(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ticket_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ` + '`key`' + ` VARCHAR(191) NOT NULL UNIQUE,
  label VARCHAR(191) NOT NULL,
  variant VARCHAR(50) NOT NULL DEFAULT 'gray',
  next_keys TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ticket_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_no VARCHAR(191) NOT NULL UNIQUE,
  cust_id INT NULL,
  reporter_name VARCHAR(255) NOT NULL,
  reporter_phone VARCHAR(50),
  category VARCHAR(191) NOT NULL DEFAULT 'Lain-lain',
  description TEXT NOT NULL,
  priority VARCHAR(50) NOT NULL DEFAULT 'medium',
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  assigned_to VARCHAR(191),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  CONSTRAINT fk_tickets_customer FOREIGN KEY (cust_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ticket_updates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  note TEXT,
  created_by VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_updates_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`

const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  username VARCHAR(191) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'petugas'
);
CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(191) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  ktp VARCHAR(100),
  meter VARCHAR(191) NOT NULL UNIQUE,
  grp VARCHAR(50) NOT NULL DEFAULT 'R1',
  address TEXT,
  phone VARCHAR(50),
  last_stand DOUBLE PRECISION NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  join_date DATE NOT NULL,
  wa_jid VARCHAR(191)
);
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cust_id INTEGER NOT NULL REFERENCES customers(id),
  last_stand DOUBLE PRECISION NOT NULL,
  current_stand DOUBLE PRECISION NOT NULL,
  usage DOUBLE PRECISION NOT NULL,
  date DATE NOT NULL,
  note TEXT,
  period VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  photo TEXT
);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cust_id INTEGER NOT NULL REFERENCES customers(id),
  invoice_no VARCHAR(191) NOT NULL UNIQUE,
  period VARCHAR(100) NOT NULL,
  period_key VARCHAR(20) NOT NULL,
  usage DOUBLE PRECISION NOT NULL,
  water_cost DOUBLE PRECISION NOT NULL,
  admin DOUBLE PRECISION NOT NULL DEFAULT 5000,
  ppj DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL,
  due_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'unpaid',
  paid_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(191) PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tariffs (
  grp VARCHAR(50) NOT NULL,
  blk_order INTEGER NOT NULL,
  limit_m3 DOUBLE PRECISION NULL,
  price DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (grp, blk_order)
);
CREATE TABLE IF NOT EXISTS installations (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  ktp VARCHAR(100),
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(191),
  grp VARCHAR(50) NOT NULL DEFAULT 'R1',
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  install_fee DOUBLE PRECISION,
  admin_fee DOUBLE PRECISION,
  total_fee DOUBLE PRECISION,
  invoice_no VARCHAR(191),
  invoice_date DATE,
  paid_date DATE,
  installed_date DATE,
  meter_no VARCHAR(191),
  cust_id INTEGER REFERENCES customers(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transaction_categories (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  name VARCHAR(191) NOT NULL,
  UNIQUE(type, name)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  type VARCHAR(50) NOT NULL,
  category VARCHAR(191) NOT NULL,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  ref_bill_id INTEGER REFERENCES bills(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ticket_statuses (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  key VARCHAR(191) NOT NULL UNIQUE,
  label VARCHAR(191) NOT NULL,
  variant VARCHAR(50) NOT NULL DEFAULT 'gray',
  next_keys TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default SMALLINT NOT NULL DEFAULT 0,
  is_active SMALLINT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS ticket_categories (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name VARCHAR(191) NOT NULL UNIQUE,
  is_active SMALLINT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ticket_no VARCHAR(191) NOT NULL UNIQUE,
  cust_id INTEGER REFERENCES customers(id),
  reporter_name VARCHAR(255) NOT NULL,
  reporter_phone VARCHAR(50),
  category VARCHAR(191) NOT NULL DEFAULT 'Lain-lain',
  description TEXT NOT NULL,
  priority VARCHAR(50) NOT NULL DEFAULT 'medium',
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  assigned_to VARCHAR(191),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL
);
CREATE TABLE IF NOT EXISTS ticket_updates (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  note TEXT,
  created_by VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`

function normalizeConfig(config = {}) {
  const raw = config.engine || 'sqlite'
  // Normalize aliases: mariadb → mysql, postgresql → postgres
  const engine = raw === 'mariadb' ? 'mysql' : raw === 'postgresql' ? 'postgres' : raw
  if (engine === 'sqlite') {
    return {
      engine,
      filename: config.filename || path.join(__dirname, 'aquameter.db'),
    }
  }
  const defaultPort = engine === 'mysql' ? 3306 : 5432
  return {
    engine,
    host: config.host || '127.0.0.1',
    port: Number(config.port || defaultPort),
    user: config.user || '',
    password: config.password || '',
    database: config.database || 'aquameter',
    ssl: Boolean(config.ssl),
  }
}

async function createClient(config) {
  const cfg = normalizeConfig(config)
  if (cfg.engine === 'sqlite') {
    const db = new Database(cfg.filename)
    db.pragma('foreign_keys = ON')
    return {
      engine: 'sqlite',
      async test() {
        db.prepare('SELECT 1').get()
      },
      async exec(sql) {
        db.exec(sql)
      },
      async query(sql, params = []) {
        return db.prepare(sql).all(...params)
      },
      async run(sql, params = []) {
        return db.prepare(sql).run(...params)
      },
      async withTransaction(fn) {
        db.exec('BEGIN')
        try {
          await fn()
          db.exec('COMMIT')
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      },
      async close() {
        db.close()
      },
    }
  }

  if (cfg.engine === 'mysql') {
    const conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: cfg.ssl ? {} : undefined,
      multipleStatements: true,
      charset: 'utf8mb4',
    })
    return {
      engine: 'mysql',
      async test() {
        await conn.query('SELECT 1')
      },
      async exec(sql) {
        await conn.query(sql)
      },
      async query(sql, params = []) {
        const [rows] = await conn.query(sql, params)
        return rows
      },
      async run(sql, params = []) {
        const [result] = await conn.query(sql, params)
        return result
      },
      async withTransaction(fn) {
        await conn.beginTransaction()
        try {
          await fn()
          await conn.commit()
        } catch (error) {
          await conn.rollback()
          throw error
        }
      },
      async close() {
        await conn.end()
      },
    }
  }

  if (cfg.engine === 'postgres') {
    const client = new Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
    })
    await client.connect()
    return {
      engine: 'postgres',
      async test() {
        await client.query('SELECT 1')
      },
      async exec(sql) {
        await client.query(sql)
      },
      async query(sql, params = []) {
        const result = await client.query(sql, params)
        return result.rows
      },
      async run(sql, params = []) {
        const result = await client.query(sql, params)
        return result
      },
      async withTransaction(fn) {
        await client.query('BEGIN')
        try {
          await fn()
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
      },
      async close() {
        await client.end()
      },
    }
  }

  throw new Error('Engine database tidak dikenali')
}

function getCreateSchema(engine) {
  if (engine === 'sqlite') return SQLITE_SCHEMA
  if (engine === 'mysql' || engine === 'mariadb') return MYSQL_SCHEMA
  if (engine === 'postgres' || engine === 'postgresql') return POSTGRES_SCHEMA
  throw new Error('Engine database tidak valid: ' + engine)
}

async function ensureSchema(client) {
  await client.exec(getCreateSchema(client.engine))
}

async function clearTables(client) {
  if (client.engine === 'sqlite') {
    await client.exec('PRAGMA foreign_keys = OFF')
    for (const table of [...TABLES].reverse()) {
      await client.run(`DELETE FROM ${table}`)
    }
    await client.exec('PRAGMA foreign_keys = ON')
    return
  }

  if (client.engine === 'mysql' || client.engine === 'mariadb') {
    await client.exec('SET FOREIGN_KEY_CHECKS=0')
    for (const table of [...TABLES].reverse()) {
      await client.run(`TRUNCATE TABLE ${table}`)
    }
    await client.exec('SET FOREIGN_KEY_CHECKS=1')
    return
  }

  await client.exec(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)
}

// Reserved words in MySQL/MariaDB that need backtick-escaping when used as column names
const MYSQL_RESERVED = new Set(['key', 'usage', 'date', 'type', 'period', 'order', 'group', 'value'])

function mysqlEscapeCol(col) {
  return MYSQL_RESERVED.has(col) ? `\`${col}\`` : col
}

function buildInsertSql(engine, table, columns) {
  const isMysql = engine === 'mysql' || engine === 'mariadb'
  const cols = columns.map(col => isMysql ? mysqlEscapeCol(col) : col).join(', ')
  if (engine === 'postgres') {
    const values = columns.map((_, index) => `$${index + 1}`).join(', ')
    return `INSERT INTO ${table} (${cols}) VALUES (${values})`
  }
  const values = columns.map(() => '?').join(', ')
  return `INSERT INTO ${table} (${cols}) VALUES (${values})`
}

function mapValue(engine, value) {
  if (engine === 'postgres' && typeof value === 'boolean') return value
  return value
}

async function migrateDatabase({ source, target, resetTarget = true }) {
  const sourceClient = await createClient(source)
  const targetClient = await createClient(target)
  const stats = []

  try {
    await sourceClient.test()
    await targetClient.test()
    await ensureSchema(targetClient)

    await targetClient.withTransaction(async () => {
      if (resetTarget) await clearTables(targetClient)
      for (const table of TABLES) {
        const rows = await sourceClient.query(`SELECT * FROM ${table}`)
        const columns = TABLE_COLUMNS[table]
        const insertSql = buildInsertSql(targetClient.engine, table, columns)
        for (const row of rows) {
          const values = columns.map(column => mapValue(targetClient.engine, row[column]))
          await targetClient.run(insertSql, values)
        }
        stats.push({ table, rows: rows.length })
      }

      if (targetClient.engine === 'sqlite') {
        await targetClient.exec('PRAGMA foreign_keys = ON')
      }

      // Reset PostgreSQL identity sequences so next INSERT doesn't clash with migrated IDs
      if (targetClient.engine === 'postgres') {
        const tablesWithId = TABLES.filter(t => TABLE_COLUMNS[t].includes('id'))
        for (const table of tablesWithId) {
          await targetClient.exec(
            `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`
          )
        }
      }
    })

    return {
      sourceEngine: normalizeConfig(source).engine,
      targetEngine: normalizeConfig(target).engine,
      resetTarget,
      stats,
    }
  } finally {
    await Promise.allSettled([sourceClient.close(), targetClient.close()])
  }
}

async function testConnection(config) {
  const client = await createClient(config)
  try {
    await client.test()
    return { ok: true, engine: normalizeConfig(config).engine }
  } finally {
    await client.close()
  }
}

module.exports = {
  TABLES,
  normalizeConfig,
  testConnection,
  migrateDatabase,
  ensureSchema,
}
