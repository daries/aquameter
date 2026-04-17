const express = require('express')
const cors = require('cors')
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const wa             = require('./whatsapp')
const { handleMessage } = require('./bot')

const app = express()
const PORT = process.env.PORT || 3001

// ─── Middleware ───
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json({ limit: '15mb' }))
app.use(express.urlencoded({ extended: true, limit: '15mb' }))

// ─── Database ───
const DB_PATH = path.join(__dirname, 'aquameter.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ─── Init Database Schema ───
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    full_name  TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'petugas'
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    ktp         TEXT,
    meter       TEXT    NOT NULL UNIQUE,
    grp         TEXT    NOT NULL DEFAULT 'R1',
    address     TEXT,
    phone       TEXT,
    last_stand  REAL    NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'active',
    join_date   TEXT    NOT NULL DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS readings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    cust_id        INTEGER NOT NULL REFERENCES customers(id),
    last_stand     REAL    NOT NULL,
    current_stand  REAL    NOT NULL,
    usage          REAL    NOT NULL,
    date           TEXT    NOT NULL,
    note           TEXT,
    period         TEXT    NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bills (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cust_id     INTEGER NOT NULL REFERENCES customers(id),
    invoice_no  TEXT    NOT NULL UNIQUE,
    period      TEXT    NOT NULL,
    period_key  TEXT    NOT NULL,
    usage       REAL    NOT NULL,
    water_cost  REAL    NOT NULL,
    admin       REAL    NOT NULL DEFAULT 5000,
    ppj         REAL    NOT NULL DEFAULT 0,
    total       REAL    NOT NULL,
    due_date    TEXT,
    status      TEXT    NOT NULL DEFAULT 'unpaid',
    paid_date   TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tariffs (
    grp       TEXT    NOT NULL,
    blk_order INTEGER NOT NULL,
    limit_m3  REAL,
    price     REAL    NOT NULL,
    PRIMARY KEY (grp, blk_order)
  );

  INSERT OR IGNORE INTO settings VALUES
    ('companyName',    'PDAM Tirta Sejahtera'),
    ('companyAddress', 'Jl. Sudirman No. 45, Kota'),
    ('companyPhone',   '0341-123456'),
    ('companyEmail',   'info@pdamtirsej.go.id'),
    ('companyNpwp',    '01.234.567.8-901.000'),
    ('readDate',       '1'),
    ('dueDays',        '20'),
    ('lateFee',        '2'),
    ('adminFee',       '5000'),
    ('ppjEnabled',     'true'),
    ('ppjRate',        '10');
`)

// Migrations
try { db.exec('ALTER TABLE readings ADD COLUMN photo TEXT') } catch (e) {}
try { db.exec('ALTER TABLE customers ADD COLUMN wa_jid TEXT') } catch (e) {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS installations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      ktp            TEXT,
      address        TEXT,
      phone          TEXT,
      email          TEXT,
      grp            TEXT    NOT NULL DEFAULT 'R1',
      notes          TEXT,
      status         TEXT    NOT NULL DEFAULT 'pending'
                     CHECK(status IN ('pending','invoiced','paid','installed','cancelled')),
      install_fee    REAL,
      admin_fee      REAL,
      total_fee      REAL,
      invoice_no     TEXT,
      invoice_date   TEXT,
      paid_date      TEXT,
      installed_date TEXT,
      meter_no       TEXT,
      cust_id        INTEGER REFERENCES customers(id),
      created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `)
} catch (e) {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_categories (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      type    TEXT NOT NULL CHECK(type IN ('income','expense')),
      name    TEXT NOT NULL,
      UNIQUE(type, name)
    )
  `)
} catch (e) {}

// Seed default categories jika kosong
const catCount = db.prepare('SELECT COUNT(*) as n FROM transaction_categories').get()
if (catCount.n === 0) {
  const insC = db.prepare('INSERT OR IGNORE INTO transaction_categories (type, name) VALUES (?, ?)')
  const defaults = [
    ['income',  'Pembayaran Tagihan Air'],
    ['income',  'Biaya Sambung Baru'],
    ['income',  'Denda Terlambat'],
    ['income',  'Iuran Anggota'],
    ['income',  'Hibah / Bantuan'],
    ['income',  'Lain-lain Pemasukan'],
    ['expense', 'Token / Rekening Listrik'],
    ['expense', 'Pemeliharaan Sumur / Pompa'],
    ['expense', 'Pembelian Pipa & Material'],
    ['expense', 'Gaji / Honor Petugas'],
    ['expense', 'Biaya Administrasi'],
    ['expense', 'Perbaikan Instalasi'],
    ['expense', 'Biaya Operasional'],
    ['expense', 'Lain-lain Pengeluaran'],
  ]
  defaults.forEach(([t, n]) => insC.run(t, n))
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      type        TEXT    NOT NULL CHECK(type IN ('income','expense')),
      category    TEXT    NOT NULL,
      description TEXT    NOT NULL,
      amount      REAL    NOT NULL CHECK(amount > 0),
      ref_bill_id INTEGER REFERENCES bills(id),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)
} catch (e) {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_statuses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      key        TEXT    NOT NULL UNIQUE,
      label      TEXT    NOT NULL,
      variant    TEXT    NOT NULL DEFAULT 'gray',
      next_keys  TEXT    NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active  INTEGER NOT NULL DEFAULT 1
    )
  `)
} catch (e) {}

// Seed default ticket statuses jika kosong
const tsCount = db.prepare('SELECT COUNT(*) as n FROM ticket_statuses').get()
if (tsCount.n === 0) {
  const insTS = db.prepare('INSERT OR IGNORE INTO ticket_statuses (key,label,variant,next_keys,sort_order,is_default) VALUES (?,?,?,?,?,1)')
  insTS.run('open',        'Baru',       'warning', JSON.stringify(['in_progress','closed']),        0)
  insTS.run('in_progress', 'Dikerjakan', 'info',    JSON.stringify(['resolved','open']),             1)
  insTS.run('resolved',    'Selesai',    'success', JSON.stringify(['closed','in_progress']),        2)
  insTS.run('closed',      'Ditutup',    'gray',    JSON.stringify([]),                              3)
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `)
} catch (e) {}

// Seed default ticket categories jika kosong
const tcCount = db.prepare('SELECT COUNT(*) as n FROM ticket_categories').get()
if (tcCount.n === 0) {
  const insTC = db.prepare('INSERT OR IGNORE INTO ticket_categories (name) VALUES (?)')
  ;['Kebocoran Pipa','Tekanan Air Lemah','Air Keruh/Berbau',
    'Meteran Bermasalah','Tagihan Bermasalah','Tidak Ada Aliran Air','Lain-lain'
  ].forEach(n => insTC.run(n))
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_no     TEXT    NOT NULL UNIQUE,
      cust_id       INTEGER REFERENCES customers(id),
      reporter_name TEXT    NOT NULL,
      reporter_phone TEXT,
      category      TEXT    NOT NULL DEFAULT 'Lain-lain',
      description   TEXT    NOT NULL,
      priority      TEXT    NOT NULL DEFAULT 'medium'
                    CHECK(priority IN ('low','medium','high','critical')),
      status        TEXT    NOT NULL DEFAULT 'open',
      assigned_to   TEXT,
      notes         TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      resolved_at   TEXT
    );
    CREATE TABLE IF NOT EXISTS ticket_updates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      status     TEXT    NOT NULL,
      note       TEXT,
      created_by TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `)
} catch (e) {}

// Migration: hapus CHECK constraint status di tabel tickets agar status bisa dinamis
try {
  const ticketTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tickets'").get()
  if (ticketTableSql?.sql?.includes("CHECK(status IN")) {
    db.exec(`
      PRAGMA foreign_keys=OFF;
      BEGIN;
      CREATE TABLE tickets_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_no     TEXT    NOT NULL UNIQUE,
        cust_id       INTEGER REFERENCES customers(id),
        reporter_name TEXT    NOT NULL,
        reporter_phone TEXT,
        category      TEXT    NOT NULL DEFAULT 'Lain-lain',
        description   TEXT    NOT NULL,
        priority      TEXT    NOT NULL DEFAULT 'medium'
                      CHECK(priority IN ('low','medium','high','critical')),
        status        TEXT    NOT NULL DEFAULT 'open',
        assigned_to   TEXT,
        notes         TEXT,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        resolved_at   TEXT
      );
      INSERT INTO tickets_new SELECT
        id,ticket_no,cust_id,reporter_name,reporter_phone,category,
        description,priority,status,assigned_to,notes,created_at,updated_at,resolved_at
      FROM tickets;
      DROP TABLE tickets;
      ALTER TABLE tickets_new RENAME TO tickets;
      COMMIT;
      PRAGMA foreign_keys=ON;
    `)
  }
} catch(e) { console.error('Migration tickets CHECK constraint:', e.message) }

// Ensure all required settings exist (safe for existing DBs)
;[
  ['adminFee',   '5000'],
  ['ppjEnabled', 'true'],
  ['ppjRate',    '10'],
  ['dueDays',    '20'],
  ['lateFee',    '2'],
  ['readDate',   '1'],
  // Pasang baru
  ['installFee',  '500000'],
  ['installAdminFee', '50000'],
  ['thermalPaperWidth', '58'],
  // WhatsApp notification settings
  ['waEnabled',          'false'],
  ['waTemplateReading',  'Yth. {nama},\n\nPembacaan meteran bulan {bulan} telah dicatat:\n• Meter Awal : {meter_awal} m³\n• Meter Akhir: {meter_akhir} m³\n• Pemakaian  : {pemakaian} m³\n• Tagihan    : Rp {tagihan}\n• Jatuh Tempo: {jatuh_tempo}\n\nMohon segera lunasi sebelum jatuh tempo.\n\n_{nama_perusahaan}_'],
  ['waTemplatePayment',  'Yth. {nama},\n\nPembayaran tagihan telah diterima ✅\n• No. Invoice: {invoice}\n• Periode    : {bulan}\n• Jumlah     : Rp {jumlah}\n• Tgl Bayar  : {tgl_bayar}\n\nTerima kasih atas pembayaran Anda.\n\n_{nama_perusahaan}_'],
  // Notifikasi pasang baru
  ['waTemplateInstallPending', 'Yth. {nama},\n\nPendaftaran pasang baru Anda telah kami terima 📋\n• No. Daftar : {no_daftar}\n• Tanggal    : {tanggal}\n\nTim kami akan memproses dan mengirimkan invoice biaya pemasangan segera.\n\nHubungi kami jika ada pertanyaan.\n\n_{nama_perusahaan}_'],
  ['waTemplateInstallInvoice', 'Yth. {nama},\n\nInvoice biaya pasang baru telah diterbitkan 🧾\n• No. Invoice : {invoice}\n• Biaya Pasang: Rp {biaya_pasang}\n• Biaya Admin : Rp {biaya_admin}\n• Total       : Rp {total}\n\nSilakan lakukan pembayaran untuk melanjutkan proses pemasangan.\n\n_{nama_perusahaan}_'],
  ['waTemplateInstallPaid',   'Yth. {nama},\n\nPembayaran pasang baru telah kami terima ✅\n• No. Invoice : {invoice}\n• Jumlah      : Rp {total}\n• Tgl Bayar   : {tgl_bayar}\n\nTim teknis kami akan menghubungi Anda untuk penjadwalan pemasangan.\n\n_{nama_perusahaan}_'],
  ['waTemplateInstallDone',   'Yth. {nama},\n\nSelamat! Pemasangan telah selesai 🎉\n• No. Meter   : {meter}\n• Tgl Pasang  : {tgl_pasang}\n\nAnda kini resmi menjadi pelanggan *{nama_perusahaan}*.\nKetik *bantuan* di WhatsApp ini untuk menggunakan layanan bot catat meter mandiri.\n\nTerima kasih telah mempercayakan kami! 🙏\n\n_{nama_perusahaan}_'],
].forEach(([k, v]) => {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v)
})

// ─── Default tariff data (used only for seeding) ───
const DEFAULT_TARIFFS = {
  R1: [{ l: 10, p: 1600 }, { l: 20, p: 2000 }, { l: 30, p: 2500 }, { l: null, p: 3000 }],
  R2: [{ l: 10, p: 2100 }, { l: 20, p: 2625 }, { l: 30, p: 3000 }, { l: null, p: 3500 }],
  R3: [{ l: 10, p: 2700 }, { l: 20, p: 3375 }, { l: 30, p: 3750 }, { l: null, p: 4200 }],
  K1: [{ l: 10, p: 3000 }, { l: 20, p: 3750 }, { l: 30, p: 4200 }, { l: null, p: 4800 }],
  K2: [{ l: 10, p: 4500 }, { l: 20, p: 5625 }, { l: 30, p: 6000 }, { l: null, p: 7200 }],
  S1: [{ l: 10, p: 800  }, { l: 20, p: 1000  }, { l: null, p: 1500 }],
}

// Seed tariff table if empty
const tariffCount = db.prepare('SELECT COUNT(*) as n FROM tariffs').get()
if (tariffCount.n === 0) {
  const insTariff = db.prepare('INSERT INTO tariffs (grp, blk_order, limit_m3, price) VALUES (?, ?, ?, ?)')
  for (const [grp, blocks] of Object.entries(DEFAULT_TARIFFS)) {
    blocks.forEach((b, i) => insTariff.run(grp, i + 1, b.l, b.p))
  }
  console.log('✅ Default tariffs seeded to database')
}

// ─── Helper functions ───
function hashPwd(pwd) {
  return crypto.createHash('sha256').update(pwd + ':aquameter2025').digest('hex')
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const session = db.prepare(`
    SELECT s.user_id, u.username, u.full_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token)
  if (!session) return res.status(401).json({ error: 'Sesi tidak valid, silakan login kembali' })
  req.user = { id: session.user_id, username: session.username, fullName: session.full_name, role: session.role }
  next()
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Hanya admin yang dapat melakukan tindakan ini' })
  next()
}

// ─── Seed default users ───
const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get()
if (userCount.n === 0) {
  const ins = db.prepare('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)')
  ins.run('admin', hashPwd('admin123'), 'Administrator', 'admin')
  ins.run('petugas1', hashPwd('petugas123'), 'Petugas Lapangan', 'petugas')
  console.log('✅ Default users created: admin/admin123, petugas1/petugas123')
}

// ─── Seed demo customers ───
const custCount = db.prepare('SELECT COUNT(*) as n FROM customers').get()
if (custCount.n === 0) {
  const insertCust = db.prepare(`
    INSERT INTO customers (name, ktp, meter, grp, address, phone, last_stand, join_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const customers = [
    ['Budi Santoso',    '3573010101800001', 'MET-0001', 'R1', 'Jl. Melati No. 12, Sukun',          '081234567890', 245,  '2020-01-15'],
    ['Siti Rahayu',     '3573010101800002', 'MET-0002', 'R2', 'Jl. Mawar No. 7, Lowokwaru',         '082345678901', 1823, '2019-05-20'],
    ['Hendra Wijaya',   '3573010101800003', 'MET-0003', 'R3', 'Jl. Anggrek No. 15, Klojen',         '083456789012', 3241, '2018-11-10'],
    ['Dewi Kusuma',     '3573010101800004', 'MET-0004', 'R1', 'Jl. Dahlia No. 3, Blimbing',         '084567890123', 512,  '2021-03-08'],
    ['Toko Maju Jaya',  '3573010101800005', 'MET-0005', 'K1', 'Jl. Pasar Besar No. 22, Klojen',     '085678901234', 4200, '2017-07-12'],
    ['Ahmad Fauzi',     '3573010101800006', 'MET-0006', 'R1', 'Jl. Kenanga No. 9, Sukun',           '086789012345', 189,  '2022-02-14'],
    ['Rina Permata',    '3573010101800007', 'MET-0007', 'R2', 'Jl. Flamboyan No. 4, Kedungkandang', '087890123456', 2100, '2020-09-30'],
    ['CV Berkah Abadi', '3573010101800008', 'MET-0008', 'K2', 'Jl. Industri No. 5, Lowokwaru',      '088901234567', 8500, '2016-04-22'],
  ]
  customers.forEach(c => insertCust.run(...c))
  console.log('✅ Demo customers seeded')
}

// ─── Auth Routes (no auth required) ───
const authRouter = express.Router()

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password)
    return res.status(400).json({ error: 'Username dan password wajib diisi' })
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || user.password !== hashPwd(password))
    return res.status(401).json({ error: 'Username atau password salah' })
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id)
  res.json({ token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role } })
})

authRouter.post('/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  res.json({ success: true })
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})

app.use('/api/auth', authRouter)

// ─── Protected API Routes ───
const router = express.Router()

// Customers
router.get('/customers', (req, res) => {
  const { status = 'active', search = '' } = req.query
  let q = 'SELECT * FROM customers WHERE status = ?'
  const params = [status]
  if (search) {
    q += ' AND (name LIKE ? OR meter LIKE ? OR address LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  q += ' ORDER BY name'
  const rows = db.prepare(q).all(...params)
  res.json(rows.map(mapCustomer))
})

router.get('/customers/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(mapCustomer(row))
})

router.post('/customers', (req, res) => {
  const { name, ktp, meter, group, address, phone, lastStand = 0 } = req.body
  if (!name || !meter) return res.status(400).json({ error: 'name and meter required' })
  try {
    const result = db.prepare(`
      INSERT INTO customers (name, ktp, meter, grp, address, phone, last_stand)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, ktp, meter, group || 'R1', address, phone, lastStand)
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(mapCustomer(row))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nomor meter sudah digunakan' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/customers/:id', (req, res) => {
  const { name, ktp, meter, group, address, phone, lastStand, status } = req.body
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  db.prepare(`
    UPDATE customers SET name=?, ktp=?, meter=?, grp=?, address=?, phone=?, last_stand=?, status=?
    WHERE id=?
  `).run(name, ktp, meter, group || existing.grp, address, phone, lastStand ?? existing.last_stand, status ?? existing.status, req.params.id)
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id)
  res.json(mapCustomer(row))
})

router.delete('/customers/:id', (req, res) => {
  db.prepare("UPDATE customers SET status='inactive' WHERE id=?").run(req.params.id)
  res.json({ success: true })
})

// Readings
router.get('/readings', (req, res) => {
  const { custId, period, limit = 50 } = req.query
  let q = `SELECT r.*, c.name as cust_name, c.meter,
           b.id as bill_id, b.status as bill_status, b.total as bill_total
           FROM readings r
           JOIN customers c ON c.id = r.cust_id
           LEFT JOIN bills b ON b.cust_id = r.cust_id AND b.period_key = r.period
           WHERE 1=1`
  const params = []
  if (custId) { q += ' AND r.cust_id = ?'; params.push(custId) }
  if (period) { q += ' AND r.period = ?';  params.push(period) }
  q += ' ORDER BY r.id DESC LIMIT ?'
  params.push(parseInt(limit))
  const rows = db.prepare(q).all(...params)
  res.json(rows.map(mapReading))
})

router.patch('/readings/:id', (req, res) => {
  const { currentStand, date, note } = req.body
  const reading = db.prepare('SELECT * FROM readings WHERE id = ?').get(req.params.id)
  if (!reading) return res.status(404).json({ error: 'Pembacaan tidak ditemukan' })

  // Check bill status
  const bill = db.prepare('SELECT * FROM bills WHERE cust_id = ? AND period_key = ?')
    .get(reading.cust_id, reading.period)
  if (bill && bill.status === 'paid')
    return res.status(400).json({ error: 'Tagihan sudah lunas, pembacaan tidak bisa diedit' })

  const newStand = parseFloat(currentStand)
  if (isNaN(newStand) || newStand <= reading.last_stand)
    return res.status(400).json({ error: `Stand harus lebih dari stand lama (${reading.last_stand})` })

  const cust     = db.prepare('SELECT * FROM customers WHERE id = ?').get(reading.cust_id)
  const usage    = newStand - reading.last_stand
  const settings = getSettings()
  const { cost } = calcWaterCost(cust.grp, usage)
  const admin    = parseFloat(settings.adminFee) || 5000
  const ppjActive = settings.ppjEnabled !== 'false'
  const ppj      = ppjActive ? Math.round(cost * (parseFloat(settings.ppjRate) || 10) / 100) : 0
  const total    = cost + admin + ppj

  const tx = db.transaction(() => {
    db.prepare('UPDATE readings SET current_stand=?, usage=?, date=?, note=? WHERE id=?')
      .run(newStand, usage, date || reading.date, note ?? reading.note, reading.id)
    if (bill) {
      db.prepare('UPDATE bills SET usage=?, water_cost=?, ppj=?, total=? WHERE id=?')
        .run(usage, cost, ppj, total, bill.id)
    }
    // Update customer's last_stand if this is their most recent reading
    const latest = db.prepare('SELECT id FROM readings WHERE cust_id = ? ORDER BY id DESC LIMIT 1').get(reading.cust_id)
    if (latest.id === reading.id) {
      db.prepare('UPDATE customers SET last_stand=? WHERE id=?').run(newStand, reading.cust_id)
    }
  })
  tx()

  const updated = db.prepare(`
    SELECT r.*, c.name as cust_name, c.meter,
           b.id as bill_id, b.status as bill_status, b.total as bill_total
    FROM readings r
    JOIN customers c ON c.id = r.cust_id
    LEFT JOIN bills b ON b.cust_id = r.cust_id AND b.period_key = r.period
    WHERE r.id = ?`).get(reading.id)
  res.json(mapReading(updated))
})

router.post('/readings', (req, res) => {
  const { custId, currentStand, date, note, photo } = req.body
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(custId)
  if (!cust) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' })
  if (currentStand <= cust.last_stand)
    return res.status(400).json({ error: `Stand harus lebih dari stand lama (${cust.last_stand})` })

  const usage  = currentStand - cust.last_stand
  const period = date.substring(0, 7)

  const settings  = getSettings()
  const { cost }  = calcWaterCost(cust.grp, usage)
  const admin     = parseFloat(settings.adminFee) || 5000
  const ppjActive = settings.ppjEnabled !== 'false'
  const ppj       = ppjActive ? Math.round(cost * (parseFloat(settings.ppjRate) || 10) / 100) : 0
  const total     = cost + admin + ppj
  const dueDate   = calcDueDate(date, parseInt(settings.dueDays) || 20)

  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO readings (cust_id, last_stand, current_stand, usage, date, note, period, photo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(custId, cust.last_stand, currentStand, usage, date, note || '', period, photo || null)

    const periodDate = new Date(date + 'T00:00:00')
    const periodName = periodDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

    // Insert bill with temp placeholder, lalu update invoice_no pakai ID asli (autoincrement)
    // agar tidak pernah UNIQUE constraint failed
    const b = db.prepare(`
      INSERT INTO bills (cust_id, invoice_no, period, period_key, usage, water_cost, admin, ppj, total, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(custId, `_TMP_${Date.now()}`, periodName, period, usage, cost, admin, ppj, total, dueDate)

    const billId    = b.lastInsertRowid
    const invoiceNo = `INV-${new Date().getFullYear()}-${String(billId).padStart(4, '0')}`
    db.prepare('UPDATE bills SET invoice_no = ? WHERE id = ?').run(invoiceNo, billId)

    db.prepare('UPDATE customers SET last_stand = ? WHERE id = ?').run(currentStand, custId)

    return {
      readingId: r.lastInsertRowid,
      bill:      db.prepare('SELECT * FROM bills WHERE id = ?').get(billId),
    }
  })

  const result = tx()
  // Use full JOIN query so response includes custName, meter, billStatus — same shape as GET /readings
  const fullReading = db.prepare(`
    SELECT r.*, c.name as cust_name, c.meter,
           b.id as bill_id, b.status as bill_status, b.total as bill_total
    FROM readings r
    JOIN customers c ON c.id = r.cust_id
    LEFT JOIN bills b ON b.cust_id = r.cust_id AND b.period_key = r.period
    WHERE r.id = ?`).get(result.readingId)

  // ── Kirim notifikasi WhatsApp (pembacaan meteran) ──
  const sett = getSettings()
  if (sett.waEnabled === 'true' && cust.phone) {
    const bill  = result.bill
    const bulan = new Date(date + 'T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    const msg   = (sett.waTemplateReading || '')
      .replace('{nama}',          cust.name)
      .replace('{bulan}',         bulan)
      .replace('{meter_awal}',    cust.last_stand)
      .replace('{meter_akhir}',   currentStand)
      .replace('{pemakaian}',     usage)
      .replace('{tagihan}',       bill ? Number(bill.total).toLocaleString('id-ID') : '—')
      .replace('{jatuh_tempo}',   bill ? bill.due_date : '—')
      .replace('{nama_perusahaan}', sett.companyName || 'PAMSIMAS')
    wa.sendMessage(cust.phone, msg).catch(e => console.error('WA reading notif error:', e.message))
  }

  res.status(201).json({ reading: mapReading(fullReading), bill: mapBill(result.bill) })
})

// Bills
router.get('/bills', (req, res) => {
  const { status, periodKey, custId, limit = 100 } = req.query
  let q = `SELECT b.*, c.name as cust_name, c.meter, c.grp,
           r.photo as reading_photo
           FROM bills b
           JOIN customers c ON c.id = b.cust_id
           LEFT JOIN readings r ON r.cust_id = b.cust_id AND r.period = b.period_key
           WHERE 1=1`
  const params = []
  if (status)    { q += ' AND b.status = ?';     params.push(status) }
  if (periodKey) { q += ' AND b.period_key = ?'; params.push(periodKey) }
  if (custId)    { q += ' AND b.cust_id = ?';    params.push(custId) }
  q += ' ORDER BY b.id DESC LIMIT ?'
  params.push(parseInt(limit))
  res.json(db.prepare(q).all(...params).map(mapBill))
})

router.get('/bills/:id', (req, res) => {
  const row = db.prepare(`SELECT b.*, c.name as cust_name, c.meter, c.grp, c.address
    FROM bills b JOIN customers c ON c.id = b.cust_id WHERE b.id = ?`).get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(mapBill(row))
})

router.patch('/bills/:id/pay', (req, res) => {
  const bill = db.prepare(`
    SELECT b.*, c.name as cust_name, c.meter
    FROM bills b JOIN customers c ON c.id = b.cust_id
    WHERE b.id = ?
  `).get(req.params.id)
  if (!bill) return res.status(404).json({ error: 'Tagihan tidak ditemukan' })
  if (bill.status === 'paid') return res.status(400).json({ error: 'Tagihan sudah lunas' })

  const today = new Date().toISOString().split('T')[0]
  const tx = db.transaction(() => {
    db.prepare("UPDATE bills SET status='paid', paid_date=? WHERE id=?").run(today, bill.id)
    // Cek belum ada entri kas untuk tagihan ini
    const existing = db.prepare(
      "SELECT id FROM transactions WHERE ref_bill_id = ? AND type = 'income'"
    ).get(bill.id)
    if (!existing) {
      db.prepare(`
        INSERT INTO transactions (date, type, category, description, amount, ref_bill_id)
        VALUES (?, 'income', 'Pembayaran Tagihan Air', ?, ?, ?)
      `).run(
        today,
        `Pembayaran ${bill.period} - ${bill.cust_name} (${bill.meter})`,
        bill.total,
        bill.id
      )
    }
  })
  tx()
  const row = db.prepare('SELECT * FROM bills WHERE id=?').get(bill.id)

  // ── Kirim notifikasi WhatsApp (pelunasan tagihan) ──
  const custWA = db.prepare('SELECT * FROM customers WHERE id=?').get(bill.cust_id)
  const settWA = getSettings()
  if (settWA.waEnabled === 'true' && custWA?.phone) {
    const bulan  = bill.period
    const msg    = (settWA.waTemplatePayment || '')
      .replace('{nama}',            custWA.name)
      .replace('{invoice}',         bill.invoice_no)
      .replace('{bulan}',           bulan)
      .replace('{jumlah}',          Number(bill.total).toLocaleString('id-ID'))
      .replace('{tgl_bayar}',       new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
      .replace('{nama_perusahaan}', settWA.companyName || 'PAMSIMAS')
    wa.sendMessage(custWA.phone, msg).catch(e => console.error('WA payment notif error:', e.message))
  }

  res.json(mapBill(row))
})

router.patch('/bills/:id/unpay', (req, res) => {
  const tx = db.transaction(() => {
    db.prepare("UPDATE bills SET status='unpaid', paid_date=NULL WHERE id=?").run(req.params.id)
    // Hapus entri kas yang otomatis dibuat saat pembayaran
    db.prepare("DELETE FROM transactions WHERE ref_bill_id = ? AND type = 'income'").run(req.params.id)
  })
  tx()
  const row = db.prepare('SELECT * FROM bills WHERE id=?').get(req.params.id)
  res.json(mapBill(row))
})

// Tariffs
router.get('/tariffs', (req, res) => {
  const rows = db.prepare('SELECT * FROM tariffs ORDER BY grp, blk_order').all()
  const result = {}
  for (const r of rows) {
    if (!result[r.grp]) result[r.grp] = []
    result[r.grp].push({ limit: r.limit_m3, price: r.price })
  }
  res.json(result)
})

router.put('/tariffs/:grp', (req, res) => {
  const { grp } = req.params
  const { blocks } = req.body
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0)
    return res.status(400).json({ error: 'blocks wajib diisi' })

  const validGrps = ['R1', 'R2', 'R3', 'K1', 'K2', 'S1']
  if (!validGrps.includes(grp))
    return res.status(400).json({ error: 'Golongan tidak valid' })

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM tariffs WHERE grp = ?').run(grp)
    const ins = db.prepare('INSERT INTO tariffs (grp, blk_order, limit_m3, price) VALUES (?, ?, ?, ?)')
    blocks.forEach((b, i) => ins.run(grp, i + 1, b.limit === undefined ? null : b.limit, b.price))
  })
  tx()
  invalidateTariffCache()

  const updated = db.prepare('SELECT * FROM tariffs WHERE grp = ? ORDER BY blk_order').all(grp)
  res.json(updated.map(r => ({ limit: r.limit_m3, price: r.price })))
})

// Settings
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const obj = {}
  rows.forEach(r => { obj[r.key] = r.value })
  res.json(obj)
})

router.put('/settings', (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  const tx = db.transaction((data) => {
    Object.entries(data).forEach(([k, v]) => upsert.run(k, String(v)))
  })
  tx(req.body)
  res.json({ success: true })
})

// Reports
router.get('/reports/monthly', (req, res) => {
  const { year = new Date().getFullYear() } = req.query
  const rows = db.prepare(`
    SELECT
      period_key,
      COUNT(*) as bill_count,
      SUM(usage) as total_volume,
      SUM(total) as total_billed,
      SUM(CASE WHEN status='paid' THEN total ELSE 0 END) as total_paid,
      SUM(CASE WHEN status!='paid' THEN total ELSE 0 END) as total_unpaid,
      ROUND(SUM(CASE WHEN status='paid' THEN total ELSE 0 END) * 100.0 / SUM(total), 1) as pay_rate
    FROM bills
    WHERE period_key LIKE ?
    GROUP BY period_key
    ORDER BY period_key
  `).all(`${year}-%`)
  res.json(rows)
})

router.get('/reports/summary', (req, res) => {
  const summary = db.prepare(`
    SELECT
      COUNT(DISTINCT cust_id) as active_customers,
      SUM(usage) as total_volume,
      SUM(total) as total_billed,
      SUM(CASE WHEN status='paid' THEN total ELSE 0 END) as total_paid,
      SUM(CASE WHEN status='overdue' OR (status='unpaid' AND due_date < date('now')) THEN total ELSE 0 END) as overdue_amount,
      COUNT(CASE WHEN status!='paid' THEN 1 END) as unpaid_count
    FROM bills
  `).get()
  res.json(summary)
})

// ─── Users (admin only) ───
router.get('/users', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT id, username, full_name, role FROM users ORDER BY id').all()
  res.json(rows.map(r => ({ id: r.id, username: r.username, fullName: r.full_name, role: r.role })))
})

router.post('/users', requireAdmin, (req, res) => {
  const { username, password, fullName, role } = req.body
  if (!username || !password || !fullName || !role)
    return res.status(400).json({ error: 'Semua field wajib diisi' })
  if (!['admin', 'petugas'].includes(role))
    return res.status(400).json({ error: 'Role tidak valid' })
  if (password.length < 6)
    return res.status(400).json({ error: 'Password minimal 6 karakter' })
  try {
    const result = db.prepare(
      'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)'
    ).run(username, hashPwd(password), fullName, role)
    res.status(201).json({ id: result.lastInsertRowid, username, fullName, role })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username sudah digunakan' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/users/:id', requireAdmin, (req, res) => {
  const { fullName, role, password } = req.body
  if (!fullName || !role) return res.status(400).json({ error: 'Nama dan role wajib diisi' })
  if (!['admin', 'petugas'].includes(role))
    return res.status(400).json({ error: 'Role tidak valid' })
  // Cegah admin hapus role dirinya sendiri
  if (parseInt(req.params.id) === req.user.id && role !== 'admin')
    return res.status(400).json({ error: 'Tidak bisa mengubah role akun Anda sendiri' })

  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' })
    db.prepare('UPDATE users SET full_name=?, role=?, password=? WHERE id=?')
      .run(fullName, role, hashPwd(password), req.params.id)
  } else {
    db.prepare('UPDATE users SET full_name=?, role=? WHERE id=?')
      .run(fullName, role, req.params.id)
  }
  const row = db.prepare('SELECT id, username, full_name, role FROM users WHERE id=?').get(req.params.id)
  res.json({ id: row.id, username: row.username, fullName: row.full_name, role: row.role })
})

router.delete('/users/:id', requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Tidak bisa menghapus akun Anda sendiri' })
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'User tidak ditemukan' })
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id)
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id)
  res.json({ success: true })
})

// ─── Transaction Categories ───
router.get('/transaction-categories', (_req, res) => {
  const rows = db.prepare('SELECT * FROM transaction_categories ORDER BY type, name').all()
  res.json(rows)
})

router.post('/transaction-categories', requireAdmin, (req, res) => {
  const { type, name } = req.body
  if (!type || !name || !name.trim())
    return res.status(400).json({ error: 'Tipe dan nama wajib diisi' })
  if (!['income', 'expense'].includes(type))
    return res.status(400).json({ error: 'Tipe tidak valid' })
  try {
    const result = db.prepare('INSERT INTO transaction_categories (type, name) VALUES (?, ?)').run(type, name.trim())
    res.status(201).json({ id: result.lastInsertRowid, type, name: name.trim() })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Kategori sudah ada' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/transaction-categories/:id', requireAdmin, (req, res) => {
  const { name } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama wajib diisi' })
  const existing = db.prepare('SELECT * FROM transaction_categories WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Kategori tidak ditemukan' })
  try {
    db.prepare('UPDATE transaction_categories SET name = ? WHERE id = ?').run(name.trim(), req.params.id)
    res.json({ id: existing.id, type: existing.type, name: name.trim() })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nama kategori sudah ada' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/transaction-categories/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM transaction_categories WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Kategori tidak ditemukan' })
  // Cek apakah kategori digunakan di transaksi
  const inUse = db.prepare('SELECT COUNT(*) as n FROM transactions WHERE category = ?').get(existing.name)
  if (inUse.n > 0) return res.status(400).json({ error: `Kategori digunakan oleh ${inUse.n} transaksi, tidak bisa dihapus` })
  db.prepare('DELETE FROM transaction_categories WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ─── Installations (Pasang Baru) ───
function mapInstallation(r) {
  if (!r) return null
  return {
    id: r.id, name: r.name, ktp: r.ktp, address: r.address,
    phone: r.phone, email: r.email, group: r.grp, notes: r.notes,
    status: r.status, installFee: r.install_fee, adminFee: r.admin_fee,
    totalFee: r.total_fee, invoiceNo: r.invoice_no, invoiceDate: r.invoice_date,
    paidDate: r.paid_date, installedDate: r.installed_date,
    meterNo: r.meter_no, custId: r.cust_id, createdAt: r.created_at,
  }
}

router.get('/installations', requireAuth, (req, res) => {
  const { status } = req.query
  let q = 'SELECT * FROM installations WHERE 1=1'
  const params = []
  if (status) { q += ' AND status = ?'; params.push(status) }
  q += ' ORDER BY id DESC'
  res.json(db.prepare(q).all(...params).map(mapInstallation))
})

router.get('/installations/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM installations WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' })
  res.json(mapInstallation(row))
})

router.post('/installations', requireAuth, (req, res) => {
  const { name, ktp, address, phone, email, group = 'R1', notes } = req.body
  if (!name) return res.status(400).json({ error: 'Nama wajib diisi' })
  const r = db.prepare(`
    INSERT INTO installations (name, ktp, address, phone, email, grp, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, ktp, address, phone, email, group, notes)
  const row = db.prepare('SELECT * FROM installations WHERE id = ?').get(r.lastInsertRowid)
  // Notif WA
  const sett = getSettings()
  if (sett.waEnabled === 'true' && phone) {
    const msg = (sett.waTemplateInstallPending || '')
      .replace('{nama}', name)
      .replace('{no_daftar}', `PB-${String(row.id).padStart(4, '0')}`)
      .replace('{tanggal}', new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
      .replace('{nama_perusahaan}', sett.companyName || 'PAMSIMAS')
    wa.sendMessage(phone, msg).catch(e => console.error('WA install pending error:', e.message))
  }
  res.status(201).json(mapInstallation(row))
})

router.put('/installations/:id', requireAdmin, (req, res) => {
  const { name, ktp, address, phone, email, group, notes } = req.body
  const existing = db.prepare('SELECT * FROM installations WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Data tidak ditemukan' })
  db.prepare(`
    UPDATE installations SET name=?, ktp=?, address=?, phone=?, email=?, grp=?, notes=? WHERE id=?
  `).run(name ?? existing.name, ktp ?? existing.ktp, address ?? existing.address,
         phone ?? existing.phone, email ?? existing.email, group ?? existing.grp,
         notes ?? existing.notes, req.params.id)
  res.json(mapInstallation(db.prepare('SELECT * FROM installations WHERE id = ?').get(req.params.id)))
})

// Buat invoice biaya pasang baru (admin)
router.patch('/installations/:id/invoice', requireAdmin, (req, res) => {
  const inst = db.prepare('SELECT * FROM installations WHERE id = ?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'Data tidak ditemukan' })
  if (inst.status !== 'pending') return res.status(400).json({ error: 'Hanya bisa buat invoice untuk status pending' })
  const sett = getSettings()
  const installFee = parseFloat(req.body.installFee ?? sett.installFee ?? 500000)
  const adminFee   = parseFloat(req.body.adminFee   ?? sett.installAdminFee ?? 50000)
  const totalFee   = installFee + adminFee
  const today      = new Date().toISOString().split('T')[0]
  const invoiceNo  = `PB-${new Date().getFullYear()}-${String(inst.id).padStart(4, '0')}`
  db.prepare(`
    UPDATE installations SET status='invoiced', install_fee=?, admin_fee=?, total_fee=?,
    invoice_no=?, invoice_date=? WHERE id=?
  `).run(installFee, adminFee, totalFee, invoiceNo, today, inst.id)
  const updated = db.prepare('SELECT * FROM installations WHERE id = ?').get(inst.id)
  // Notif WA
  if (sett.waEnabled === 'true' && inst.phone) {
    const msg = (sett.waTemplateInstallInvoice || '')
      .replace('{nama}', inst.name)
      .replace('{invoice}', invoiceNo)
      .replace('{biaya_pasang}', Number(installFee).toLocaleString('id-ID'))
      .replace('{biaya_admin}', Number(adminFee).toLocaleString('id-ID'))
      .replace('{total}', Number(totalFee).toLocaleString('id-ID'))
      .replace('{nama_perusahaan}', sett.companyName || 'PAMSIMAS')
    wa.sendMessage(inst.phone, msg).catch(e => console.error('WA install invoice error:', e.message))
  }
  res.json(mapInstallation(updated))
})

// Tandai lunas (admin) — otomatis buat customer
router.patch('/installations/:id/pay', requireAdmin, (req, res) => {
  const inst = db.prepare('SELECT * FROM installations WHERE id = ?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'Data tidak ditemukan' })
  if (inst.status !== 'invoiced') return res.status(400).json({ error: 'Hanya bisa bayar untuk status invoiced' })
  const today = new Date().toISOString().split('T')[0]
  const tx = db.transaction(() => {
    db.prepare("UPDATE installations SET status='paid', paid_date=? WHERE id=?").run(today, inst.id)
    // Otomatis catat ke buku kas sebagai pemasukan
    const existing = db.prepare(
      "SELECT id FROM transactions WHERE ref_bill_id IS NULL AND description LIKE ? AND date = ?"
    ).get(`%${inst.invoice_no}%`, today)
    if (!existing) {
      db.prepare(`
        INSERT INTO transactions (date, type, category, description, amount)
        VALUES (?, 'income', 'Biaya Sambung Baru', ?, ?)
      `).run(today, `Biaya Pasang Baru - ${inst.name} (${inst.invoice_no})`, inst.total_fee)
    }
  })
  tx()
  const updated = db.prepare('SELECT * FROM installations WHERE id = ?').get(inst.id)
  const sett = getSettings()
  if (sett.waEnabled === 'true' && inst.phone) {
    const msg = (sett.waTemplateInstallPaid || '')
      .replace('{nama}', inst.name)
      .replace('{invoice}', inst.invoice_no)
      .replace('{total}', Number(inst.total_fee).toLocaleString('id-ID'))
      .replace('{tgl_bayar}', new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
      .replace('{nama_perusahaan}', sett.companyName || 'PAMSIMAS')
    wa.sendMessage(inst.phone, msg).catch(e => console.error('WA install paid error:', e.message))
  }
  res.json(mapInstallation(updated))
})

// Tandai terpasang → otomatis daftarkan sebagai pelanggan (admin)
router.patch('/installations/:id/install', requireAdmin, (req, res) => {
  const inst = db.prepare('SELECT * FROM installations WHERE id = ?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'Data tidak ditemukan' })
  if (inst.status !== 'paid') return res.status(400).json({ error: 'Hanya bisa install untuk status paid' })
  const { meterNo, lastStand = 0 } = req.body
  if (!meterNo) return res.status(400).json({ error: 'Nomor meter wajib diisi' })
  const today = new Date().toISOString().split('T')[0]
  const tx = db.transaction(() => {
    const c = db.prepare(`
      INSERT INTO customers (name, ktp, meter, grp, address, phone, last_stand, join_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(inst.name, inst.ktp, meterNo, inst.grp, inst.address, inst.phone, lastStand, today)
    db.prepare(`
      UPDATE installations SET status='installed', installed_date=?, meter_no=?, cust_id=? WHERE id=?
    `).run(today, meterNo, c.lastInsertRowid, inst.id)
    return c.lastInsertRowid
  })
  tx()
  const sett   = getSettings()
  if (sett.waEnabled === 'true' && inst.phone) {
    const msg = (sett.waTemplateInstallDone || '')
      .replace('{nama}', inst.name)
      .replace('{meter}', meterNo)
      .replace('{tgl_pasang}', new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
      .replace('{nama_perusahaan}', sett.companyName || 'PAMSIMAS')
    wa.sendMessage(inst.phone, msg).catch(e => console.error('WA install done error:', e.message))
  }
  res.json(mapInstallation(db.prepare('SELECT * FROM installations WHERE id = ?').get(inst.id)))
})

// Batalkan pendaftaran (admin)
router.patch('/installations/:id/cancel', requireAdmin, (req, res) => {
  const inst = db.prepare('SELECT * FROM installations WHERE id = ?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'Data tidak ditemukan' })
  if (inst.status === 'installed') return res.status(400).json({ error: 'Tidak bisa batalkan yang sudah terpasang' })
  db.prepare("UPDATE installations SET status='cancelled' WHERE id=?").run(inst.id)
  res.json(mapInstallation(db.prepare('SELECT * FROM installations WHERE id = ?').get(inst.id)))
})

// ─── Transactions (Buku Kas) ───
router.get('/transactions', (req, res) => {
  const { type, month, limit = 200 } = req.query
  let q = 'SELECT * FROM transactions WHERE 1=1'
  const params = []
  if (type)  { q += ' AND type = ?';              params.push(type) }
  if (month) { q += ' AND date LIKE ?';           params.push(`${month}%`) }
  q += ' ORDER BY date DESC, id DESC LIMIT ?'
  params.push(parseInt(limit))
  res.json(db.prepare(q).all(...params).map(mapTransaction))
})

router.get('/transactions/summary', (req, res) => {
  const { month } = req.query
  let where = '1=1'
  const params = []
  if (month) { where += ' AND date LIKE ?'; params.push(`${month}%`) }
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as total_expense,
      COUNT(CASE WHEN type='income'  THEN 1 END) as count_income,
      COUNT(CASE WHEN type='expense' THEN 1 END) as count_expense
    FROM transactions WHERE ${where}
  `).get(...params)
  res.json(row)
})

router.post('/transactions', (req, res) => {
  const { date, type, category, description, amount, refBillId } = req.body
  if (!date || !type || !category || !description || !amount)
    return res.status(400).json({ error: 'Semua field wajib diisi' })
  if (!['income', 'expense'].includes(type))
    return res.status(400).json({ error: 'Tipe harus income atau expense' })
  if (parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'Jumlah harus lebih dari 0' })

  const result = db.prepare(`
    INSERT INTO transactions (date, type, category, description, amount, ref_bill_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(date, type, category, description, parseFloat(amount), refBillId || null)
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(mapTransaction(row))
})

router.delete('/transactions/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Transaksi tidak ditemukan' })
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ─── WhatsApp Bot Routes (protected) ───
app.get('/api/whatsapp/status', requireAuth, (_req, res) => {
  res.json(wa.getStatus())
})

// ─── Ticket Statuses ───
router.get('/ticket-statuses', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM ticket_statuses ORDER BY sort_order, id').all()
  res.json(rows.map(r => ({ ...r, next_keys: JSON.parse(r.next_keys || '[]') })))
})

router.post('/ticket-statuses', requireAuth, requireAdmin, (req, res) => {
  const { key, label, variant = 'gray', next_keys = [], sort_order = 99 } = req.body
  if (!key?.trim() || !label?.trim()) return res.status(400).json({ error: 'Key dan label wajib diisi' })
  const slug = key.trim().toLowerCase().replace(/\s+/g, '_')
  try {
    const r = db.prepare(
      'INSERT INTO ticket_statuses (key,label,variant,next_keys,sort_order) VALUES (?,?,?,?,?)'
    ).run(slug, label.trim(), variant, JSON.stringify(next_keys), sort_order)
    const row = db.prepare('SELECT * FROM ticket_statuses WHERE id=?').get(r.lastInsertRowid)
    res.status(201).json({ ...row, next_keys: JSON.parse(row.next_keys) })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Key status sudah ada' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/ticket-statuses/:id', requireAuth, requireAdmin, (req, res) => {
  const { label, variant, next_keys, sort_order, is_active } = req.body
  const row = db.prepare('SELECT * FROM ticket_statuses WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Status tidak ditemukan' })
  try {
    db.prepare(`UPDATE ticket_statuses SET label=?,variant=?,next_keys=?,sort_order=?,is_active=? WHERE id=?`).run(
      label ?? row.label,
      variant ?? row.variant,
      next_keys !== undefined ? JSON.stringify(next_keys) : row.next_keys,
      sort_order ?? row.sort_order,
      is_active ?? row.is_active,
      row.id
    )
    const updated = db.prepare('SELECT * FROM ticket_statuses WHERE id=?').get(row.id)
    res.json({ ...updated, next_keys: JSON.parse(updated.next_keys) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/ticket-statuses/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM ticket_statuses WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Status tidak ditemukan' })
  if (row.is_default) return res.status(400).json({ error: 'Status default tidak dapat dihapus' })
  db.prepare('DELETE FROM ticket_statuses WHERE id=?').run(row.id)
  res.json({ success: true })
})

// ─── Ticket Categories ───
router.get('/ticket-categories', requireAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM ticket_categories ORDER BY id').all())
})

router.post('/ticket-categories', requireAuth, requireAdmin, (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nama kategori wajib diisi' })
  try {
    const r = db.prepare('INSERT INTO ticket_categories (name) VALUES (?)').run(name.trim())
    res.status(201).json(db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(r.lastInsertRowid))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Kategori sudah ada' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/ticket-categories/:id', requireAuth, requireAdmin, (req, res) => {
  const { name, is_active } = req.body
  const row = db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Kategori tidak ditemukan' })
  try {
    db.prepare('UPDATE ticket_categories SET name=?, is_active=? WHERE id=?')
      .run(name ?? row.name, is_active ?? row.is_active, row.id)
    res.json(db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(row.id))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nama sudah digunakan' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/ticket-categories/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM ticket_categories WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Kategori tidak ditemukan' })
  db.prepare('DELETE FROM ticket_categories WHERE id = ?').run(row.id)
  res.json({ success: true })
})

// ─── Tickets ───
function nextTicketNo() {
  const last = db.prepare("SELECT ticket_no FROM tickets ORDER BY id DESC LIMIT 1").get()
  let seq = 1
  if (last) {
    const m = last.ticket_no.match(/TKT-(\d+)/)
    if (m) seq = parseInt(m[1]) + 1
  }
  return `TKT-${String(seq).padStart(4, '0')}`
}

router.get('/tickets', requireAuth, (req, res) => {
  const { status = '', search = '', priority = '' } = req.query
  let q = `
    SELECT t.*, c.name as cust_name, c.meter as cust_meter
    FROM tickets t
    LEFT JOIN customers c ON c.id = t.cust_id
    WHERE 1=1
  `
  const params = []
  if (status)   { q += ' AND t.status = ?';   params.push(status) }
  if (priority) { q += ' AND t.priority = ?'; params.push(priority) }
  if (search) {
    q += ` AND (t.ticket_no LIKE ? OR t.reporter_name LIKE ? OR t.description LIKE ? OR c.name LIKE ?)`
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  q += ' ORDER BY t.id DESC'
  res.json(db.prepare(q).all(...params).map(mapTicket))
})

router.get('/tickets/:id', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT t.*, c.name as cust_name, c.meter as cust_meter
    FROM tickets t LEFT JOIN customers c ON c.id = t.cust_id
    WHERE t.id = ?
  `).get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  const updates = db.prepare('SELECT * FROM ticket_updates WHERE ticket_id = ? ORDER BY id ASC').all(row.id)
  res.json({ ...mapTicket(row), updates: updates.map(mapTicketUpdate) })
})

router.post('/tickets', requireAuth, (req, res) => {
  const { custId, reporterName, reporterPhone, category, description, priority = 'medium' } = req.body
  if (!reporterName || !description) return res.status(400).json({ error: 'Nama pelapor dan deskripsi wajib diisi' })
  const ticketNo = nextTicketNo()
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const result = db.prepare(`
    INSERT INTO tickets (ticket_no, cust_id, reporter_name, reporter_phone, category, description, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ticketNo, custId || null, reporterName, reporterPhone || null,
    category || 'Lain-lain', description, priority, now, now)
  db.prepare(`
    INSERT INTO ticket_updates (ticket_id, status, note, created_by, created_at)
    VALUES (?, 'open', 'Tiket dibuat', ?, ?)
  `).run(result.lastInsertRowid, req.user.fullName, now)
  const row = db.prepare(`
    SELECT t.*, c.name as cust_name, c.meter as cust_meter
    FROM tickets t LEFT JOIN customers c ON c.id = t.cust_id WHERE t.id = ?
  `).get(result.lastInsertRowid)
  res.status(201).json(mapTicket(row))
})

router.put('/tickets/:id', requireAuth, (req, res) => {
  const { reporterName, reporterPhone, category, description, priority, assignedTo, notes } = req.body
  const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  db.prepare(`
    UPDATE tickets SET reporter_name=?, reporter_phone=?, category=?, description=?,
    priority=?, assigned_to=?, notes=?, updated_at=? WHERE id=?
  `).run(
    reporterName || row.reporter_name, reporterPhone ?? row.reporter_phone,
    category || row.category, description || row.description,
    priority || row.priority, assignedTo ?? row.assigned_to,
    notes ?? row.notes, now, row.id
  )
  const updated = db.prepare(`
    SELECT t.*, c.name as cust_name, c.meter as cust_meter
    FROM tickets t LEFT JOIN customers c ON c.id = t.cust_id WHERE t.id = ?
  `).get(row.id)
  res.json(mapTicket(updated))
})

router.patch('/tickets/:id/status', requireAuth, (req, res) => {
  const { status, note } = req.body
  const validStatuses = ['open', 'in_progress', 'resolved', 'closed']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status tidak valid' })
  const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const resolvedAt = (status === 'resolved' || status === 'closed') && !row.resolved_at ? now : row.resolved_at
  db.prepare(`
    UPDATE tickets SET status=?, resolved_at=?, updated_at=? WHERE id=?
  `).run(status, resolvedAt, now, row.id)
  db.prepare(`
    INSERT INTO ticket_updates (ticket_id, status, note, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(row.id, status, note || null, req.user.fullName, now)
  const updated = db.prepare(`
    SELECT t.*, c.name as cust_name, c.meter as cust_meter
    FROM tickets t LEFT JOIN customers c ON c.id = t.cust_id WHERE t.id = ?
  `).get(row.id)
  res.json(mapTicket(updated))
})

router.delete('/tickets/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM tickets WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  db.prepare('DELETE FROM ticket_updates WHERE ticket_id = ?').run(row.id)
  db.prepare('DELETE FROM tickets WHERE id = ?').run(row.id)
  res.json({ success: true })
})

router.get('/tickets/meta/categories', requireAuth, (_req, res) => {
  const rows = db.prepare("SELECT name FROM ticket_categories WHERE is_active=1 ORDER BY id").all()
  res.json(rows.map(r => r.name))
})

router.get('/tickets/meta/statuses', requireAuth, (_req, res) => {
  const rows = db.prepare("SELECT * FROM ticket_statuses WHERE is_active=1 ORDER BY sort_order, id").all()
  res.json(rows.map(r => ({ ...r, next_keys: JSON.parse(r.next_keys || '[]') })))
})

app.post('/api/whatsapp/connect', requireAuth, requireAdmin, async (_req, res) => {
  try {
    await wa.connect()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/whatsapp/disconnect', requireAuth, requireAdmin, async (_req, res) => {
  try {
    await wa.disconnect()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Mount protected routes ───
app.use('/api', requireAuth, router)

// ─── Serve frontend in production ───
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  })
}else{
  app.use(express.static(path.join(__dirname, '../dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  })
    
}

// ─── Health check ───
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

// ─── Daftarkan bot handler (dipasang sekali, aktif setelah WA connect) ───
wa.onMessage((jid, phone, text) =>
  handleMessage(jid, phone, text, { db, wa, calcWaterCost, getSettings, calcDueDate })
)

app.listen(PORT, () => {
  console.log(`\n🚰 AquaMeter Server running on http://localhost:${PORT}`)
  console.log(`📦 Database: ${DB_PATH}`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`)

  // Auto-connect WhatsApp if enabled in settings
  const sWA = db.prepare("SELECT value FROM settings WHERE key='waEnabled'").get()
  if (sWA?.value === 'true') {
    console.log('📲 Menghubungkan WhatsApp...')
    wa.connect().catch(e => console.error('WA auto-connect error:', e.message))
  }
})

// ─── Helper functions ───
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const obj = {}
  rows.forEach(r => { obj[r.key] = r.value })
  return obj
}

// Tariff cache — cleared when tariffs are updated via API
let _tariffCache = null
function getTariffBlocks(group) {
  if (!_tariffCache) {
    const rows = db.prepare('SELECT * FROM tariffs ORDER BY grp, blk_order').all()
    _tariffCache = {}
    for (const r of rows) {
      if (!_tariffCache[r.grp]) _tariffCache[r.grp] = []
      _tariffCache[r.grp].push({ limit: r.limit_m3, price: r.price })
    }
  }
  return _tariffCache[group] || []
}
function invalidateTariffCache() { _tariffCache = null }

function calcWaterCost(group, usage) {
  const blocks = getTariffBlocks(group)
  let cost = 0, prev = 0, result = []
  for (const b of blocks) {
    if (usage <= prev) break
    const lim = b.limit === null ? usage : b.limit
    const vol = Math.min(usage - prev, lim - prev)
    if (vol > 0) { cost += vol * b.price; result.push({ vol, price: b.price, sub: vol * b.price }) }
    prev = lim
    if (b.limit === null) break
  }
  return { cost, blocks: result }
}

function calcDueDate(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ─── Mapper functions (snake_case DB → camelCase JSON) ───
function mapCustomer(r) {
  return {
    id: r.id, name: r.name, ktp: r.ktp, meter: r.meter,
    group: r.grp, address: r.address, phone: r.phone,
    lastStand: r.last_stand, status: r.status, joinDate: r.join_date,
  }
}

function mapReading(r) {
  return {
    id: r.id, custId: r.cust_id, lastStand: r.last_stand,
    currentStand: r.current_stand, usage: r.usage, date: r.date,
    note: r.note, period: r.period, photo: r.photo,
    custName: r.cust_name, meter: r.meter,
    billId: r.bill_id, billStatus: r.bill_status, billTotal: r.bill_total,
  }
}

function mapBill(r) {
  return {
    id: r.id, custId: r.cust_id, invoiceNo: r.invoice_no,
    period: r.period, periodKey: r.period_key,
    usage: r.usage, waterCost: r.water_cost, admin: r.admin,
    ppj: r.ppj, total: r.total, dueDate: r.due_date,
    status: r.status, paidDate: r.paid_date,
    custName: r.cust_name, meter: r.meter, group: r.grp,
    photo: r.reading_photo || null,
  }
}

function mapTransaction(r) {
  return {
    id: r.id, date: r.date, type: r.type,
    category: r.category, description: r.description,
    amount: r.amount, refBillId: r.ref_bill_id,
    createdAt: r.created_at,
  }
}

function mapTicket(r) {
  return {
    id: r.id, ticketNo: r.ticket_no,
    custId: r.cust_id, custName: r.cust_name || null, custMeter: r.cust_meter || null,
    reporterName: r.reporter_name, reporterPhone: r.reporter_phone,
    category: r.category, description: r.description,
    priority: r.priority, status: r.status,
    assignedTo: r.assigned_to, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at, resolvedAt: r.resolved_at,
  }
}

function mapTicketUpdate(r) {
  return {
    id: r.id, ticketId: r.ticket_id,
    status: r.status, note: r.note,
    createdBy: r.created_by, createdAt: r.created_at,
  }
}

module.exports = app
