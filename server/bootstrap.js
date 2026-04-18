const DEFAULT_TARIFFS = {
  R1: [{ l: 10, p: 1600 }, { l: 20, p: 2000 }, { l: 30, p: 2500 }, { l: null, p: 3000 }],
  R2: [{ l: 10, p: 2100 }, { l: 20, p: 2625 }, { l: 30, p: 3000 }, { l: null, p: 3500 }],
  R3: [{ l: 10, p: 2700 }, { l: 20, p: 3375 }, { l: 30, p: 3750 }, { l: null, p: 4200 }],
  K1: [{ l: 10, p: 3000 }, { l: 20, p: 3750 }, { l: 30, p: 4200 }, { l: null, p: 4800 }],
  K2: [{ l: 10, p: 4500 }, { l: 20, p: 5625 }, { l: 30, p: 6000 }, { l: null, p: 7200 }],
  S1: [{ l: 10, p: 800 }, { l: 20, p: 1000 }, { l: null, p: 1500 }],
}

function initializeSqliteDatabase(db, { hashPwd }) {
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

  const catCount = db.prepare('SELECT COUNT(*) as n FROM transaction_categories').get()
  if (catCount.n === 0) {
    const insC = db.prepare('INSERT OR IGNORE INTO transaction_categories (type, name) VALUES (?, ?)')
    const defaults = [
      ['income', 'Pembayaran Tagihan Air'],
      ['income', 'Biaya Sambung Baru'],
      ['income', 'Denda Terlambat'],
      ['income', 'Iuran Anggota'],
      ['income', 'Hibah / Bantuan'],
      ['income', 'Lain-lain Pemasukan'],
      ['expense', 'Token / Rekening Listrik'],
      ['expense', 'Pemeliharaan Sumur / Pompa'],
      ['expense', 'Pembelian Pipa & Material'],
      ['expense', 'Gaji / Honor Petugas'],
      ['expense', 'Biaya Administrasi'],
      ['expense', 'Perbaikan Instalasi'],
      ['expense', 'Biaya Operasional'],
      ['expense', 'Lain-lain Pengeluaran'],
    ]
    defaults.forEach(([type, name]) => insC.run(type, name))
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

  const tsCount = db.prepare('SELECT COUNT(*) as n FROM ticket_statuses').get()
  if (tsCount.n === 0) {
    const insTS = db.prepare('INSERT OR IGNORE INTO ticket_statuses (key,label,variant,next_keys,sort_order,is_default) VALUES (?,?,?,?,?,1)')
    insTS.run('open', 'Baru', 'warning', JSON.stringify(['in_progress', 'closed']), 0)
    insTS.run('in_progress', 'Dikerjakan', 'info', JSON.stringify(['resolved', 'open']), 1)
    insTS.run('resolved', 'Selesai', 'success', JSON.stringify(['closed', 'in_progress']), 2)
    insTS.run('closed', 'Ditutup', 'gray', JSON.stringify([]), 3)
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

  const tcCount = db.prepare('SELECT COUNT(*) as n FROM ticket_categories').get()
  if (tcCount.n === 0) {
    const insTC = db.prepare('INSERT OR IGNORE INTO ticket_categories (name) VALUES (?)')
    ;['Kebocoran Pipa', 'Tekanan Air Lemah', 'Air Keruh/Berbau',
      'Meteran Bermasalah', 'Tagihan Bermasalah', 'Tidak Ada Aliran Air', 'Lain-lain'
    ].forEach(name => insTC.run(name))
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

  try {
    const ticketTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tickets'").get()
    if (ticketTableSql?.sql?.includes('CHECK(status IN')) {
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
  } catch (error) {
    console.error('Migration tickets CHECK constraint:', error.message)
  }

  ;[
    ['adminFee', '5000'],
    ['ppjEnabled', 'true'],
    ['ppjRate', '10'],
    ['dueDays', '20'],
    ['lateFee', '2'],
    ['readDate', '1'],
    ['installFee', '500000'],
    ['installAdminFee', '50000'],
    ['thermalPaperWidth', '58'],
    ['timezone', 'Asia/Jakarta'],
    ['waEnabled', 'false'],
    ['waTemplateReading', 'Yth. {nama},\n\nPembacaan meteran bulan {bulan} telah dicatat:\n• No. Meter  : {nomor_meter}\n• Tgl Baca   : {tanggal_baca}\n• Meter Awal : {meter_awal} m³\n• Meter Akhir: {meter_akhir} m³\n• Pemakaian  : {pemakaian} m³\n• Tagihan    : Rp {tagihan}\n• Jatuh Tempo: {jatuh_tempo}\n\nMohon segera lunasi sebelum jatuh tempo.\n\n_{nama_perusahaan}_'],
    ['waTemplatePayment', 'Yth. {nama},\n\nPembayaran tagihan telah diterima ✅\n• No. Meter  : {nomor_meter}\n• No. Invoice: {invoice}\n• Periode    : {bulan}\n• Jumlah     : Rp {jumlah}\n• Tgl Bayar  : {tgl_bayar}\n\nTerima kasih atas pembayaran Anda.\n\n_{nama_perusahaan}_'],
    ['waTemplateInstallPending', 'Yth. {nama},\n\nPendaftaran pasang baru Anda telah kami terima 📋\n• No. Daftar : {no_daftar}\n• Tanggal    : {tanggal}\n\nTim kami akan memproses dan mengirimkan invoice biaya pemasangan segera.\n\nHubungi kami jika ada pertanyaan.\n\n_{nama_perusahaan}_'],
    ['waTemplateInstallInvoice', 'Yth. {nama},\n\nInvoice biaya pasang baru telah diterbitkan 🧾\n• No. Invoice : {invoice}\n• Biaya Pasang: Rp {biaya_pasang}\n• Biaya Admin : Rp {biaya_admin}\n• Total       : Rp {total}\n\nSilakan lakukan pembayaran untuk melanjutkan proses pemasangan.\n\n_{nama_perusahaan}_'],
    ['waTemplateInstallPaid', 'Yth. {nama},\n\nPembayaran pasang baru telah kami terima ✅\n• No. Invoice : {invoice}\n• Jumlah      : Rp {total}\n• Tgl Bayar   : {tgl_bayar}\n\nTim teknis kami akan menghubungi Anda untuk penjadwalan pemasangan.\n\n_{nama_perusahaan}_'],
    ['waTemplateInstallDone', 'Yth. {nama},\n\nSelamat! Pemasangan telah selesai 🎉\n• No. Meter   : {meter}\n• Tgl Pasang  : {tgl_pasang}\n\nAnda kini resmi menjadi pelanggan *{nama_perusahaan}*.\nKetik *bantuan* di WhatsApp ini untuk menggunakan layanan bot catat meter mandiri.\n\nTerima kasih telah mempercayakan kami! 🙏\n\n_{nama_perusahaan}_'],
  ].forEach(([key, value]) => {
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

  const tariffCount = db.prepare('SELECT COUNT(*) as n FROM tariffs').get()
  if (tariffCount.n === 0) {
    const insTariff = db.prepare('INSERT INTO tariffs (grp, blk_order, limit_m3, price) VALUES (?, ?, ?, ?)')
    for (const [grp, blocks] of Object.entries(DEFAULT_TARIFFS)) {
      blocks.forEach((block, index) => insTariff.run(grp, index + 1, block.l, block.p))
    }
    console.log('✅ Default tariffs seeded to database')
  }

  const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get()
  if (userCount.n === 0) {
    const ins = db.prepare('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)')
    ins.run('admin', hashPwd('admin123'), 'Administrator', 'admin')
    ins.run('petugas1', hashPwd('petugas123'), 'Petugas Lapangan', 'petugas')
    console.log('✅ Default users created: admin/admin123, petugas1/petugas123')
  }

  const custCount = db.prepare('SELECT COUNT(*) as n FROM customers').get()
  if (custCount.n === 0) {
    const insertCust = db.prepare(`
      INSERT INTO customers (name, ktp, meter, grp, address, phone, last_stand, join_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const customers = [
      ['Budi Santoso', '3573010101800001', 'MET-0001', 'R1', 'Jl. Melati No. 12, Sukun', '081234567890', 245, '2020-01-15'],
      ['Siti Rahayu', '3573010101800002', 'MET-0002', 'R2', 'Jl. Mawar No. 7, Lowokwaru', '082345678901', 1823, '2019-05-20'],
      ['Hendra Wijaya', '3573010101800003', 'MET-0003', 'R3', 'Jl. Anggrek No. 15, Klojen', '083456789012', 3241, '2018-11-10'],
      ['Dewi Kusuma', '3573010101800004', 'MET-0004', 'R1', 'Jl. Dahlia No. 3, Blimbing', '084567890123', 512, '2021-03-08'],
      ['Toko Maju Jaya', '3573010101800005', 'MET-0005', 'K1', 'Jl. Pasar Besar No. 22, Klojen', '085678901234', 4200, '2017-07-12'],
      ['Ahmad Fauzi', '3573010101800006', 'MET-0006', 'R1', 'Jl. Kenanga No. 9, Sukun', '086789012345', 189, '2022-02-14'],
      ['Rina Permata', '3573010101800007', 'MET-0007', 'R2', 'Jl. Flamboyan No. 4, Kedungkandang', '087890123456', 2100, '2020-09-30'],
      ['CV Berkah Abadi', '3573010101800008', 'MET-0008', 'K2', 'Jl. Industri No. 5, Lowokwaru', '088901234567', 8500, '2016-04-22'],
    ]
    customers.forEach(customer => insertCust.run(...customer))
    console.log('✅ Demo customers seeded')
  }

  return {
    settingsCache: Object.fromEntries(
      db.prepare('SELECT key, value FROM settings').all().map(row => [row.key, row.value])
    ),
    defaultTariffs: DEFAULT_TARIFFS,
  }
}

// ─── Async database initializer for MySQL / PostgreSQL ───────────────────────
// Uses the dbAdapter interface (get/all/run/exec/transaction) so it works with
// any engine. For SQLite, use initializeSqliteDatabase (above) instead.

const DEFAULT_SETTINGS_LIST = [
  ['companyName',    'PDAM Tirta Sejahtera'],
  ['companyAddress', 'Jl. Sudirman No. 45, Kota'],
  ['companyPhone',   '0341-123456'],
  ['companyEmail',   'info@pdamtirsej.go.id'],
  ['companyNpwp',    '01.234.567.8-901.000'],
  ['readDate',       '1'],
  ['dueDays',        '20'],
  ['lateFee',        '2'],
  ['adminFee',       '5000'],
  ['ppjEnabled',     'true'],
  ['ppjRate',        '10'],
  ['installFee',     '500000'],
  ['installAdminFee','50000'],
  ['thermalPaperWidth','58'],
  ['timezone',       'Asia/Jakarta'],
  ['waEnabled',      'false'],
  ['waTemplateReading',       'Yth. {nama},\n\nPembacaan meteran bulan {bulan} telah dicatat:\n• No. Meter  : {nomor_meter}\n• Tgl Baca   : {tanggal_baca}\n• Meter Awal : {meter_awal} m³\n• Meter Akhir: {meter_akhir} m³\n• Pemakaian  : {pemakaian} m³\n• Tagihan    : Rp {tagihan}\n• Jatuh Tempo: {jatuh_tempo}\n\nMohon segera lunasi sebelum jatuh tempo.\n\n_{nama_perusahaan}_'],
  ['waTemplatePayment',       'Yth. {nama},\n\nPembayaran tagihan telah diterima ✅\n• No. Meter  : {nomor_meter}\n• No. Invoice: {invoice}\n• Periode    : {bulan}\n• Jumlah     : Rp {jumlah}\n• Tgl Bayar  : {tgl_bayar}\n\nTerima kasih atas pembayaran Anda.\n\n_{nama_perusahaan}_'],
  ['waTemplateInstallPending','Yth. {nama},\n\nPendaftaran pasang baru Anda telah kami terima 📋\n• No. Daftar : {no_daftar}\n• Tanggal    : {tanggal}\n\nTim kami akan memproses dan mengirimkan invoice biaya pemasangan segera.\n\nHubungi kami jika ada pertanyaan.\n\n_{nama_perusahaan}_'],
  ['waTemplateInstallInvoice','Yth. {nama},\n\nInvoice biaya pasang baru telah diterbitkan 🧾\n• No. Invoice : {invoice}\n• Biaya Pasang: Rp {biaya_pasang}\n• Biaya Admin : Rp {biaya_admin}\n• Total       : Rp {total}\n\nSilakan lakukan pembayaran untuk melanjutkan proses pemasangan.\n\n_{nama_perusahaan}_'],
  ['waTemplateInstallPaid',   'Yth. {nama},\n\nPembayaran pasang baru telah kami terima ✅\n• No. Invoice : {invoice}\n• Jumlah      : Rp {total}\n• Tgl Bayar   : {tgl_bayar}\n\nTim teknis kami akan menghubungi Anda untuk penjadwalan pemasangan.\n\n_{nama_perusahaan}_'],
  ['waTemplateInstallDone',   'Yth. {nama},\n\nSelamat! Pemasangan telah selesai 🎉\n• No. Meter   : {meter}\n• Tgl Pasang  : {tgl_pasang}\n\nAnda kini resmi menjadi pelanggan *{nama_perusahaan}*.\nKetik *bantuan* di WhatsApp ini untuk menggunakan layanan bot catat meter mandiri.\n\nTerima kasih telah mempercayakan kami! 🙏\n\n_{nama_perusahaan}_'],
]

async function initializeDatabaseAsync(adapter, { hashPwd }) {
  const { ensureSchema } = require('./dbMigration')

  // 1. Create all tables (engine-specific schema)
  await ensureSchema(adapter)
  console.log(`✅ Schema siap [${adapter.engine}]`)

  // 2. Seed settings (insert if not exists)
  for (const [key, value] of DEFAULT_SETTINGS_LIST) {
    const exists = await adapter.get('SELECT key FROM settings WHERE key = ?', [key])
    if (!exists) await adapter.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value])
  }

  // 3. Seed transaction categories
  const catCount = await adapter.get('SELECT COUNT(*) as n FROM transaction_categories')
  if (Number(catCount.n) === 0) {
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
    for (const [type, name] of defaults) {
      await adapter.run('INSERT INTO transaction_categories (type, name) VALUES (?, ?)', [type, name])
    }
  }

  // 4. Seed ticket statuses
  const tsCount = await adapter.get('SELECT COUNT(*) as n FROM ticket_statuses')
  if (Number(tsCount.n) === 0) {
    const statuses = [
      ['open',        'Baru',       'warning', JSON.stringify(['in_progress','closed']),    0, 1],
      ['in_progress', 'Dikerjakan', 'info',    JSON.stringify(['resolved','open']),          1, 0],
      ['resolved',    'Selesai',    'success', JSON.stringify(['closed','in_progress']),     2, 0],
      ['closed',      'Ditutup',    'gray',    JSON.stringify([]),                           3, 0],
    ]
    for (const [key, label, variant, next_keys, sort_order, is_default] of statuses) {
      await adapter.run(
        'INSERT INTO ticket_statuses (key,label,variant,next_keys,sort_order,is_default) VALUES (?,?,?,?,?,?)',
        [key, label, variant, next_keys, sort_order, is_default]
      )
    }
  }

  // 5. Seed ticket categories
  const tcCount = await adapter.get('SELECT COUNT(*) as n FROM ticket_categories')
  if (Number(tcCount.n) === 0) {
    for (const name of ['Kebocoran Pipa','Tekanan Air Lemah','Air Keruh/Berbau',
      'Meteran Bermasalah','Tagihan Bermasalah','Tidak Ada Aliran Air','Lain-lain']) {
      await adapter.run('INSERT INTO ticket_categories (name) VALUES (?)', [name])
    }
  }

  // 6. Seed tariffs
  const tariffCount = await adapter.get('SELECT COUNT(*) as n FROM tariffs')
  if (Number(tariffCount.n) === 0) {
    for (const [grp, blocks] of Object.entries(DEFAULT_TARIFFS)) {
      for (const [index, block] of blocks.entries()) {
        await adapter.run(
          'INSERT INTO tariffs (grp, blk_order, limit_m3, price) VALUES (?, ?, ?, ?)',
          [grp, index + 1, block.l, block.p]
        )
      }
    }
    console.log('✅ Default tariffs seeded to database')
  }

  // 7. Seed default admin user
  const userCount = await adapter.get('SELECT COUNT(*) as n FROM users')
  if (Number(userCount.n) === 0) {
    await adapter.run(
      'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
      ['admin', hashPwd('admin123'), 'Administrator', 'admin']
    )
    await adapter.run(
      'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
      ['petugas1', hashPwd('petugas123'), 'Petugas Lapangan', 'petugas']
    )
    console.log('✅ Default users created: admin/admin123, petugas1/petugas123')
  }

  // Return settings cache
  const rows = await adapter.all('SELECT key, value FROM settings')
  return {
    settingsCache: Object.fromEntries(rows.map(r => [r.key, r.value])),
  }
}

module.exports = {
  DEFAULT_TARIFFS,
  initializeSqliteDatabase,
  initializeDatabaseAsync,
}
