const path = require('path')

function createSqliteDbAdapter(db) {
  function buildExecutor(targetDb) {
    return {
      async get(sql, params = []) {
        return targetDb.prepare(sql).get(...params)
      },
      async all(sql, params = []) {
        return targetDb.prepare(sql).all(...params)
      },
      async run(sql, params = []) {
        return targetDb.prepare(sql).run(...params)
      },
      async exec(sql) {
        return targetDb.exec(sql)
      },
    }
  }

  const base = buildExecutor(db)

  return {
    engine: 'sqlite',
    _rawDb: db,
    ...base,
    async transaction(fn) {
      const txDb = buildExecutor(db)
      const tx = db.transaction(() => fn(txDb))
      return tx()
    },
  }
}

// ─── Placeholder conversion: ? → $1, $2, ... (for PostgreSQL) ───
function convertPgPlaceholders(sql) {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

// ─── MySQL / MariaDB Adapter ───
// MariaDB menggunakan protokol yang sama dengan MySQL — driver mysql2 bisa dipakai.
// Pakai conn.query() (text protocol) bukan execute() (prepared statements)
// agar kompatibel dengan semua versi MariaDB.
async function createMysqlDbAdapter(config) {
  const mysql = require('mysql2/promise')
  const conn = await mysql.createConnection({
    host:               config.host     || '127.0.0.1',
    port:               config.port     || 3306,
    user:               config.user     || '',
    password:           config.password || '',
    database:           config.database || 'aquameter',
    ssl:                config.ssl ? {} : undefined,
    multipleStatements: true,
  })

  function buildResult(r) {
    return { lastInsertRowid: r.insertId || null, changes: r.affectedRows }
  }

  // query() (text protocol) lebih kompatibel dengan MariaDB daripada execute()
  async function get(sql, params = []) {
    const [rows] = await conn.query(sql, params)
    return rows[0] || null
  }
  async function all(sql, params = []) {
    const [rows] = await conn.query(sql, params)
    return rows
  }
  async function run(sql, params = []) {
    const [r] = await conn.query(sql, params)
    return buildResult(r)
  }
  async function exec(sql) {
    await conn.query(sql)
  }
  async function transaction(fn) {
    await conn.beginTransaction()
    try {
      const tx = {
        get:  (s, p = []) => conn.query(s, p).then(([r]) => r[0] || null),
        all:  (s, p = []) => conn.query(s, p).then(([r]) => r),
        run:  (s, p = []) => conn.query(s, p).then(([r]) => buildResult(r)),
        exec: (s)         => conn.query(s).then(() => {}),
      }
      const result = await fn(tx)
      await conn.commit()
      return result
    } catch (e) {
      await conn.rollback()
      throw e
    }
  }

  return { engine: 'mysql', get, all, run, exec, transaction }
}

// ─── PostgreSQL Adapter ───
// Uses a Pool so concurrent requests each get their own connection.
// Transactions acquire a dedicated client from the pool for the duration.
async function createPostgresDbAdapter(config) {
  const { Pool } = require('pg')
  const pool = new Pool({
    host:     config.host     || '127.0.0.1',
    port:     config.port     || 5432,
    user:     config.user     || '',
    password: config.password || '',
    database: config.database || 'aquameter',
    ssl:      config.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
  })

  // Verify connection on startup
  const testClient = await pool.connect()
  testClient.release()

  function toPg(sql) { return convertPgPlaceholders(sql) }

  // INSERT gets RETURNING id appended so we can return lastInsertRowid
  async function pgRun(c, sql, params) {
    const pgSql = toPg(sql)
    if (/^\s*INSERT\s/i.test(pgSql)) {
      const withReturning = pgSql.replace(/;\s*$/, '') + ' RETURNING id'
      try {
        const r = await c.query(withReturning, params)
        return { lastInsertRowid: r.rows[0]?.id ?? null, changes: r.rowCount }
      } catch (e) {
        if (e.code === '42703') {
          // Table has no "id" column (e.g. settings, tariffs) — run without RETURNING
          const r = await c.query(pgSql, params)
          return { lastInsertRowid: null, changes: r.rowCount }
        }
        throw e
      }
    }
    const r = await c.query(pgSql, params)
    return { lastInsertRowid: null, changes: r.rowCount }
  }

  async function get(sql, params = []) {
    const r = await pool.query(toPg(sql), params)
    return r.rows[0] || null
  }
  async function all(sql, params = []) {
    const r = await pool.query(toPg(sql), params)
    return r.rows
  }
  async function run(sql, params = []) {
    return pgRun(pool, sql, params)
  }
  async function exec(sql) {
    await pool.query(sql)
  }
  async function transaction(fn) {
    // Acquire a single dedicated connection for the whole transaction
    const conn = await pool.connect()
    try {
      await conn.query('BEGIN')
      const tx = {
        get:  (s, p = []) => conn.query(toPg(s), p).then(r => r.rows[0] || null),
        all:  (s, p = []) => conn.query(toPg(s), p).then(r => r.rows),
        run:  (s, p = []) => pgRun(conn, s, p),
        exec: (s)         => conn.query(s).then(() => {}),
      }
      const result = await fn(tx)
      await conn.query('COMMIT')
      return result
    } catch (e) {
      await conn.query('ROLLBACK')
      throw e
    } finally {
      conn.release()
    }
  }

  return { engine: 'postgres', get, all, run, exec, transaction }
}

// ─── Factory: create adapter based on engine config ───
async function createDbAdapter(config) {
  if (!config) throw new Error('Konfigurasi database tidak ditemukan')
  const { engine } = config
  if (engine === 'sqlite') {
    const Database = require('better-sqlite3')
    const filename = config.filename || path.join(__dirname, 'aquameter.db')
    const db = new Database(filename)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    return createSqliteDbAdapter(db)
  }
  if (engine === 'mysql' || engine === 'mariadb') return createMysqlDbAdapter(config)
  if (engine === 'postgres' || engine === 'postgresql') return createPostgresDbAdapter(config)
  throw new Error(`Engine database tidak dikenal: ${engine}`)
}

module.exports = {
  createSqliteDbAdapter,
  createMysqlDbAdapter,
  createPostgresDbAdapter,
  createDbAdapter,
}
