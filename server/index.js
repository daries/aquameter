const express = require('express')
const cors = require('cors')
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const { createDbAdapter } = require('./dbAdapter')
const wa             = require('./whatsapp')
const { handleMessage } = require('./bot')
const { loadDbConfig, getSafeDbConfig, mergeDbConfig } = require('./dbConfig')
const { normalizeConfig, testConnection, migrateDatabase } = require('./dbMigration')
const { createSqliteDbAdapter } = require('./dbAdapter')  // kept for legacy SQLite path
const { listSettings, updateSettings } = require('./services/settingsService')
const { listUsers, createUser, getUserById, updateUser, deleteUser } = require('./services/userService')
const {
  listTransactionCategories,
  getTransactionCategoryById,
  createTransactionCategory,
  updateTransactionCategory,
  countTransactionsByCategory,
  deleteTransactionCategory,
} = require('./services/transactionCategoryService')
const {
  listTicketStatuses,
  getTicketStatusById,
  createTicketStatus,
  updateTicketStatus,
  deleteTicketStatus,
  listTicketCategories,
  listActiveTicketCategoryNames,
  getTicketCategoryById,
  createTicketCategory,
  updateTicketCategory,
  deleteTicketCategory,
} = require('./services/ticketMetaService')
const {
  listTickets,
  getTicketById,
  getTicketDetail,
  createTicket,
  updateTicket,
  updateTicketStatus: changeTicketStatus,
  deleteTicket,
} = require('./services/ticketService')
const {
  listTransactions,
  getTransactionSummary,
  createTransaction,
  getTransactionById,
  deleteTransaction,
} = require('./services/transactionService')
const {
  listInstallations,
  getInstallationById,
  getInstallationRowById,
  createInstallation,
  updateInstallation,
  createInstallationInvoice,
  markInstallationPaid,
  markInstallationInstalled,
  cancelInstallation,
} = require('./services/installationService')
const {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deactivateCustomer,
} = require('./services/customerService')
const {
  listReadings,
  getReadingRowById,
  getCustomerRowById: getMeterCustomerRowById,
  getBillByCustomerPeriod,
  createReadingWithBill,
  updateReadingAndBill,
  listBills,
  getBillDetailById,
  getBillRowWithCustomerById,
  markBillPaid,
  markBillUnpaid,
} = require('./services/meterBillingService')
const { getUserByUsername, createSession, deleteSession, getSessionUser } = require('./services/authService')
const { listTariffs, replaceTariffBlocks } = require('./services/tariffService')
const { getMonthlyReport, getSummaryReport } = require('./services/reportService')
const { initializeSqliteDatabase, initializeDatabaseAsync } = require('./bootstrap')

const app = express()
const PORT = process.env.PORT || 3001

// ─── Middleware ───
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json({ limit: '15mb' }))
app.use(express.urlencoded({ extended: true, limit: '15mb' }))

// ─── Database ─── (initialized async in startServer below)
let appDb
let _settingsCache = {}
let _tariffCache = null
let _runtimeInfo = { engine: 'sqlite', sqlitePath: null, note: 'Server sedang inisialisasi...' }

// ─── Helper functions ───
function hashPwd(pwd) {
  return crypto.createHash('sha256').update(pwd + ':aquameter2025').digest('hex')
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const session = await getSessionUser(appDb, token)
    if (!session) return res.status(401).json({ error: 'Sesi tidak valid, silakan login kembali' })
    req.user = session
    next()
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Hanya admin yang dapat melakukan tindakan ini' })
  next()
}

// ─── Auth Routes (no auth required) ───
const authRouter = express.Router()

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password)
    return res.status(400).json({ error: 'Username dan password wajib diisi' })
  try {
    const user = await getUserByUsername(appDb, username)
    if (!user || user.password !== hashPwd(password))
      return res.status(401).json({ error: 'Username atau password salah' })
    const token = crypto.randomBytes(32).toString('hex')
    await createSession(appDb, token, user.id)
    res.json({ token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role } })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

authRouter.post('/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  try {
    res.json(await deleteSession(appDb, token))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})

app.use('/api/auth', authRouter)

// ─── Protected API Routes ───
const router = express.Router()

// Customers
router.get('/customers', async (req, res) => {
  try {
    res.json(await listCustomers(appDb, req.query))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/customers/:id', async (req, res) => {
  try {
    const row = await getCustomerById(appDb, req.params.id)
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/customers', async (req, res) => {
  const { name, ktp, meter, group, address, phone, lastStand = 0 } = req.body
  if (!name || !meter) return res.status(400).json({ error: 'name and meter required' })
  try {
    res.status(201).json(await createCustomer(appDb, { name, ktp, meter, group, address, phone, lastStand }))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nomor meter sudah digunakan' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/customers/:id', async (req, res) => {
  const { name, ktp, meter, group, address, phone, lastStand, status } = req.body
  try {
    const row = await updateCustomer(appDb, req.params.id, { name, ktp, meter, group, address, phone, lastStand, status })
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nomor meter sudah digunakan' })
    res.status(500).json({ error: error.message })
  }
})

router.delete('/customers/:id', async (req, res) => {
  try {
    res.json(await deactivateCustomer(appDb, req.params.id))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Readings
router.get('/readings', async (req, res) => {
  try {
    res.json(await listReadings(appDb, req.query))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/readings/:id', async (req, res) => {
  const { currentStand, date, note } = req.body
  const reading = await getReadingRowById(appDb, req.params.id)
  if (!reading) return res.status(404).json({ error: 'Pembacaan tidak ditemukan' })

  // Check bill status
  const bill = await getBillByCustomerPeriod(appDb, reading.cust_id, reading.period)
  if (bill && bill.status === 'paid')
    return res.status(400).json({ error: 'Tagihan sudah lunas, pembacaan tidak bisa diedit' })

  const newStand = parseFloat(currentStand)
  if (isNaN(newStand) || newStand <= reading.last_stand)
    return res.status(400).json({ error: `Stand harus lebih dari stand lama (${reading.last_stand})` })

  const cust     = await getMeterCustomerRowById(appDb, reading.cust_id)
  const usage    = newStand - reading.last_stand
  const settings = getSettings()
  const { cost } = calcWaterCost(cust.grp, usage)
  const admin    = parseFloat(settings.adminFee) || 5000
  const ppjActive = settings.ppjEnabled !== 'false'
  const ppj      = ppjActive ? Math.round(cost * (parseFloat(settings.ppjRate) || 10) / 100) : 0
  const total    = cost + admin + ppj

  try {
    res.json(await updateReadingAndBill(appDb, { reading, bill, newStand, usage, date, note, cost, ppj, total }))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/readings', async (req, res) => {
  const { custId, currentStand, date, note, photo } = req.body
  const cust = await getMeterCustomerRowById(appDb, custId)
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
  const periodDate = new Date(date + 'T00:00:00')
  const periodName = periodDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

  // ── Kirim notifikasi WhatsApp (pembacaan meteran) ──
  try {
    const result = await createReadingWithBill(appDb, {
      custId,
      lastStand: cust.last_stand,
      currentStand,
      usage,
      date,
      note,
      period,
      photo,
      periodName,
      cost,
      admin,
      ppj,
      total,
      dueDate,
    })

    const sett = getSettings()
    if (sett.waEnabled === 'true' && cust.phone) {
      const bill  = result.rawBill
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

    res.status(201).json({ reading: result.reading, bill: result.bill })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Bills
router.get('/bills', async (req, res) => {
  try {
    res.json(await listBills(appDb, req.query))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/bills/:id', async (req, res) => {
  try {
    const row = await getBillDetailById(appDb, req.params.id)
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/bills/:id/pay', async (req, res) => {
  const bill = await getBillRowWithCustomerById(appDb, req.params.id)
  if (!bill) return res.status(404).json({ error: 'Tagihan tidak ditemukan' })
  if (bill.status === 'paid') return res.status(400).json({ error: 'Tagihan sudah lunas' })

  const today = new Date().toISOString().split('T')[0]
  try {
    const row = await markBillPaid(appDb, req.params.id, today)

    const custWA = await getMeterCustomerRowById(appDb, bill.cust_id)
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
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/bills/:id/unpay', async (req, res) => {
  try {
    const row = await markBillUnpaid(appDb, req.params.id)
    res.json(mapBill(row))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Tariffs
router.get('/tariffs', async (_req, res) => {
  try {
    res.json(await listTariffs(appDb))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/tariffs/:grp', async (req, res) => {
  const { grp } = req.params
  const { blocks } = req.body
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0)
    return res.status(400).json({ error: 'blocks wajib diisi' })

  const validGrps = ['R1', 'R2', 'R3', 'K1', 'K2', 'S1']
  if (!validGrps.includes(grp))
    return res.status(400).json({ error: 'Golongan tidak valid' })

  try {
    const updated = await replaceTariffBlocks(appDb, grp, blocks)
    setTariffCacheEntry(grp, updated)
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Settings
router.get('/settings', async (_req, res) => {
  try {
    res.json(await listSettings(appDb))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/settings', async (req, res) => {
  try {
    const result = await updateSettings(appDb, req.body)
    _settingsCache = { ..._settingsCache, ...Object.fromEntries(Object.entries(req.body).map(([k, v]) => [k, String(v)])) }
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/database/config', requireAdmin, (_req, res) => {
  res.json({ runtime: _runtimeInfo, config: getSafeDbConfig() })
})

router.put('/database/config', requireAdmin, (req, res) => {
  try {
    const config = mergeDbConfig(req.body || {})
    res.json({
      success: true,
      config: {
        activeEngine: config.activeEngine,
        profiles: {
          sqlite: { ...config.profiles.sqlite },
          mysql: { ...config.profiles.mysql, password: config.profiles.mysql.password ? '••••••••' : '' },
          postgres: { ...config.profiles.postgres, password: config.profiles.postgres.password ? '••••••••' : '' },
        },
      },
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/database/test', requireAdmin, async (req, res) => {
  try {
    const profile = normalizeConfig(req.body || {})
    const result = await testConnection(profile)
    res.json({
      success: true,
      ...result,
      message: `Koneksi ${profile.engine} berhasil`,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/database/migrate', requireAdmin, async (req, res) => {
  try {
    const config = loadDbConfig()
    const fromKey = req.body?.from || 'sqlite'
    const toKey = req.body?.to || config.activeEngine
    const resetTarget = req.body?.resetTarget !== false
    const source = req.body?.source || config.profiles[fromKey]
    const target = req.body?.target || config.profiles[toKey]

    if (!source) return res.status(400).json({ error: `Profil sumber "${fromKey}" tidak ditemukan` })
    if (!target) return res.status(400).json({ error: `Profil target "${toKey}" tidak ditemukan` })

    const result = await migrateDatabase({ source, target, resetTarget })
    res.json({
      success: true,
      message: `Migrasi ${result.sourceEngine} ke ${result.targetEngine} selesai`,
      result,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Reports
router.get('/reports/monthly', async (req, res) => {
  const { year = new Date().getFullYear() } = req.query
  try {
    res.json(await getMonthlyReport(appDb, year))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/reports/summary', async (_req, res) => {
  try {
    res.json(await getSummaryReport(appDb, new Date().toISOString().split('T')[0]))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── Users (admin only) ───
router.get('/users', requireAdmin, async (_req, res) => {
  try {
    res.json(await listUsers(appDb))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/users', requireAdmin, async (req, res) => {
  const { username, password, fullName, role } = req.body
  if (!username || !password || !fullName || !role)
    return res.status(400).json({ error: 'Semua field wajib diisi' })
  if (!['admin', 'petugas'].includes(role))
    return res.status(400).json({ error: 'Role tidak valid' })
  if (password.length < 6)
    return res.status(400).json({ error: 'Password minimal 6 karakter' })
  try {
    const user = await createUser(appDb, {
      username,
      passwordHash: hashPwd(password),
      fullName,
      role,
    })
    res.status(201).json(user)
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username sudah digunakan' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/users/:id', requireAdmin, async (req, res) => {
  const { fullName, role, password } = req.body
  if (!fullName || !role) return res.status(400).json({ error: 'Nama dan role wajib diisi' })
  if (!['admin', 'petugas'].includes(role))
    return res.status(400).json({ error: 'Role tidak valid' })
  // Cegah admin hapus role dirinya sendiri
  if (parseInt(req.params.id) === req.user.id && role !== 'admin')
    return res.status(400).json({ error: 'Tidak bisa mengubah role akun Anda sendiri' })
  if (password && password.length < 6)
    return res.status(400).json({ error: 'Password minimal 6 karakter' })

  try {
    const row = await updateUser(appDb, req.params.id, {
      fullName,
      role,
      passwordHash: password ? hashPwd(password) : null,
    })
    if (!row) return res.status(404).json({ error: 'User tidak ditemukan' })
    res.json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/users/:id', requireAdmin, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Tidak bisa menghapus akun Anda sendiri' })
  const row = await getUserById(appDb, req.params.id)
  if (!row) return res.status(404).json({ error: 'User tidak ditemukan' })
  try {
    res.json(await deleteUser(appDb, req.params.id))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── Transaction Categories ───
router.get('/transaction-categories', async (_req, res) => {
  try {
    res.json(await listTransactionCategories(appDb))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/transaction-categories', requireAdmin, async (req, res) => {
  const { type, name } = req.body
  if (!type || !name || !name.trim())
    return res.status(400).json({ error: 'Tipe dan nama wajib diisi' })
  if (!['income', 'expense'].includes(type))
    return res.status(400).json({ error: 'Tipe tidak valid' })
  try {
    const row = await createTransactionCategory(appDb, { type, name: name.trim() })
    res.status(201).json(row)
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Kategori sudah ada' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/transaction-categories/:id', requireAdmin, async (req, res) => {
  const { name } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama wajib diisi' })
  const existing = await getTransactionCategoryById(appDb, req.params.id)
  if (!existing) return res.status(404).json({ error: 'Kategori tidak ditemukan' })
  try {
    res.json(await updateTransactionCategory(appDb, req.params.id, { name: name.trim() }))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nama kategori sudah ada' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/transaction-categories/:id', requireAdmin, async (req, res) => {
  const existing = await getTransactionCategoryById(appDb, req.params.id)
  if (!existing) return res.status(404).json({ error: 'Kategori tidak ditemukan' })
  // Cek apakah kategori digunakan di transaksi
  const inUse = await countTransactionsByCategory(appDb, existing.name)
  if (inUse > 0) return res.status(400).json({ error: `Kategori digunakan oleh ${inUse} transaksi, tidak bisa dihapus` })
  try {
    res.json(await deleteTransactionCategory(appDb, req.params.id))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── Installations (Pasang Baru) ───
router.get('/installations', requireAuth, async (req, res) => {
  try {
    res.json(await listInstallations(appDb, req.query))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/installations/:id', requireAuth, async (req, res) => {
  try {
    const row = await getInstallationById(appDb, req.params.id)
    if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' })
    res.json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/installations', requireAuth, async (req, res) => {
  const { name, ktp, address, phone, email, group = 'R1', notes } = req.body
  if (!name) return res.status(400).json({ error: 'Nama wajib diisi' })
  try {
    const row = await createInstallation(appDb, { name, ktp, address, phone, email, group, notes })
    const sett = getSettings()
    if (sett.waEnabled === 'true' && phone) {
      const msg = (sett.waTemplateInstallPending || '')
        .replace('{nama}', name)
        .replace('{no_daftar}', `PB-${String(row.id).padStart(4, '0')}`)
        .replace('{tanggal}', new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
        .replace('{nama_perusahaan}', sett.companyName || 'PAMSIMAS')
      wa.sendMessage(phone, msg).catch(e => console.error('WA install pending error:', e.message))
    }
    res.status(201).json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/installations/:id', requireAdmin, async (req, res) => {
  const { name, ktp, address, phone, email, group, notes } = req.body
  try {
    const row = await updateInstallation(appDb, req.params.id, { name, ktp, address, phone, email, group, notes })
    if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' })
    res.json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Buat invoice biaya pasang baru (admin)
router.patch('/installations/:id/invoice', requireAdmin, async (req, res) => {
  const inst = await getInstallationRowById(appDb, req.params.id)
  if (!inst) return res.status(404).json({ error: 'Data tidak ditemukan' })
  if (inst.status !== 'pending') return res.status(400).json({ error: 'Hanya bisa buat invoice untuk status pending' })
  const sett = getSettings()
  const installFee = parseFloat(req.body.installFee ?? sett.installFee ?? 500000)
  const adminFee   = parseFloat(req.body.adminFee   ?? sett.installAdminFee ?? 50000)
  const totalFee   = installFee + adminFee
  const today      = new Date().toISOString().split('T')[0]
  const invoiceNo  = `PB-${new Date().getFullYear()}-${String(inst.id).padStart(4, '0')}`
  try {
    const updated = await createInstallationInvoice(appDb, req.params.id, { installFee, adminFee, totalFee, invoiceNo, today })
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
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Tandai lunas (admin) — otomatis buat customer
router.patch('/installations/:id/pay', requireAdmin, async (req, res) => {
  const inst = await getInstallationRowById(appDb, req.params.id)
  if (!inst) return res.status(404).json({ error: 'Data tidak ditemukan' })
  if (inst.status !== 'invoiced') return res.status(400).json({ error: 'Hanya bisa bayar untuk status invoiced' })
  const today = new Date().toISOString().split('T')[0]
  const sett = getSettings()
  try {
    const updated = await markInstallationPaid(appDb, req.params.id, { today })
    if (sett.waEnabled === 'true' && inst.phone) {
      const msg = (sett.waTemplateInstallPaid || '')
        .replace('{nama}', inst.name)
        .replace('{invoice}', inst.invoice_no)
        .replace('{total}', Number(inst.total_fee).toLocaleString('id-ID'))
        .replace('{tgl_bayar}', new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
        .replace('{nama_perusahaan}', sett.companyName || 'PAMSIMAS')
      wa.sendMessage(inst.phone, msg).catch(e => console.error('WA install paid error:', e.message))
    }
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Tandai terpasang → otomatis daftarkan sebagai pelanggan (admin)
router.patch('/installations/:id/install', requireAdmin, async (req, res) => {
  const inst = await getInstallationRowById(appDb, req.params.id)
  if (!inst) return res.status(404).json({ error: 'Data tidak ditemukan' })
  if (inst.status !== 'paid') return res.status(400).json({ error: 'Hanya bisa install untuk status paid' })
  const { meterNo, lastStand = 0 } = req.body
  if (!meterNo) return res.status(400).json({ error: 'Nomor meter wajib diisi' })
  const today = new Date().toISOString().split('T')[0]
  const sett   = getSettings()
  try {
    const updated = await markInstallationInstalled(appDb, req.params.id, { meterNo, lastStand, today })
    if (sett.waEnabled === 'true' && inst.phone) {
      const msg = (sett.waTemplateInstallDone || '')
        .replace('{nama}', inst.name)
        .replace('{meter}', meterNo)
        .replace('{tgl_pasang}', new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
        .replace('{nama_perusahaan}', sett.companyName || 'PAMSIMAS')
      wa.sendMessage(inst.phone, msg).catch(e => console.error('WA install done error:', e.message))
    }
    res.json(updated)
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nomor meter sudah digunakan' })
    res.status(500).json({ error: error.message })
  }
})

// Batalkan pendaftaran (admin)
router.patch('/installations/:id/cancel', requireAdmin, async (req, res) => {
  const inst = await getInstallationRowById(appDb, req.params.id)
  if (!inst) return res.status(404).json({ error: 'Data tidak ditemukan' })
  if (inst.status === 'installed') return res.status(400).json({ error: 'Tidak bisa batalkan yang sudah terpasang' })
  try {
    res.json(await cancelInstallation(appDb, req.params.id))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── Transactions (Buku Kas) ───
router.get('/transactions', async (req, res) => {
  try {
    res.json(await listTransactions(appDb, req.query))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/transactions/summary', async (req, res) => {
  try {
    res.json(await getTransactionSummary(appDb, req.query))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/transactions', async (req, res) => {
  const { date, type, category, description, amount, refBillId } = req.body
  if (!date || !type || !category || !description || !amount)
    return res.status(400).json({ error: 'Semua field wajib diisi' })
  if (!['income', 'expense'].includes(type))
    return res.status(400).json({ error: 'Tipe harus income atau expense' })
  if (parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'Jumlah harus lebih dari 0' })

  try {
    res.status(201).json(await createTransaction(appDb, { date, type, category, description, amount, refBillId }))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/transactions/:id', async (req, res) => {
  const row = await getTransactionById(appDb, req.params.id)
  if (!row) return res.status(404).json({ error: 'Transaksi tidak ditemukan' })
  try {
    res.json(await deleteTransaction(appDb, req.params.id))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── WhatsApp Bot Routes (protected) ───
app.get('/api/whatsapp/status', requireAuth, (_req, res) => {
  res.json(wa.getStatus())
})

// ─── Ticket Statuses ───
router.get('/ticket-statuses', requireAuth, async (_req, res) => {
  try {
    res.json(await listTicketStatuses(appDb))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/ticket-statuses', requireAuth, requireAdmin, async (req, res) => {
  const { key, label, variant = 'gray', next_keys = [], sort_order = 99 } = req.body
  if (!key?.trim() || !label?.trim()) return res.status(400).json({ error: 'Key dan label wajib diisi' })
  const slug = key.trim().toLowerCase().replace(/\s+/g, '_')
  try {
    res.status(201).json(await createTicketStatus(appDb, {
      key: slug,
      label: label.trim(),
      variant,
      next_keys,
      sort_order,
    }))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Key status sudah ada' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/ticket-statuses/:id', requireAuth, requireAdmin, async (req, res) => {
  const { label, variant, next_keys, sort_order, is_active } = req.body
  const row = await getTicketStatusById(appDb, req.params.id)
  if (!row) return res.status(404).json({ error: 'Status tidak ditemukan' })
  try {
    res.json(await updateTicketStatus(appDb, row.id, { label, variant, next_keys, sort_order, is_active }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/ticket-statuses/:id', requireAuth, requireAdmin, async (req, res) => {
  const row = await getTicketStatusById(appDb, req.params.id)
  if (!row) return res.status(404).json({ error: 'Status tidak ditemukan' })
  if (row.is_default) return res.status(400).json({ error: 'Status default tidak dapat dihapus' })
  try {
    res.json(await deleteTicketStatus(appDb, row.id))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── Ticket Categories ───
router.get('/ticket-categories', requireAuth, async (_req, res) => {
  try {
    res.json(await listTicketCategories(appDb))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/ticket-categories', requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nama kategori wajib diisi' })
  try {
    res.status(201).json(await createTicketCategory(appDb, { name: name.trim() }))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Kategori sudah ada' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/ticket-categories/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, is_active } = req.body
  const row = await getTicketCategoryById(appDb, req.params.id)
  if (!row) return res.status(404).json({ error: 'Kategori tidak ditemukan' })
  try {
    res.json(await updateTicketCategory(appDb, row.id, { name, is_active }))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nama sudah digunakan' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/ticket-categories/:id', requireAuth, requireAdmin, async (req, res) => {
  const row = await getTicketCategoryById(appDb, req.params.id)
  if (!row) return res.status(404).json({ error: 'Kategori tidak ditemukan' })
  try {
    res.json(await deleteTicketCategory(appDb, row.id))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── Tickets ───
router.get('/tickets', requireAuth, async (req, res) => {
  try {
    res.json(await listTickets(appDb, req.query))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/tickets/:id', requireAuth, async (req, res) => {
  try {
    const row = await getTicketDetail(appDb, req.params.id)
    if (!row) return res.status(404).json({ error: 'Tiket tidak ditemukan' })
    res.json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/tickets', requireAuth, async (req, res) => {
  const { custId, reporterName, reporterPhone, category, description, priority = 'medium' } = req.body
  if (!reporterName || !description) return res.status(400).json({ error: 'Nama pelapor dan deskripsi wajib diisi' })
  try {
    const row = await createTicket(appDb, {
      custId,
      reporterName,
      reporterPhone,
      category,
      description,
      priority,
      createdBy: req.user.fullName,
      now: new Date().toISOString().replace('T', ' ').slice(0, 19),
    })
    res.status(201).json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/tickets/:id', requireAuth, async (req, res) => {
  const { reporterName, reporterPhone, category, description, priority, assignedTo, notes } = req.body
  try {
    const row = await updateTicket(appDb, req.params.id, {
      reporterName,
      reporterPhone,
      category,
      description,
      priority,
      assignedTo,
      notes,
      now: new Date().toISOString().replace('T', ' ').slice(0, 19),
    })
    if (!row) return res.status(404).json({ error: 'Tiket tidak ditemukan' })
    res.json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/tickets/:id/status', requireAuth, async (req, res) => {
  const { status, note } = req.body
  const validStatuses = ['open', 'in_progress', 'resolved', 'closed']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status tidak valid' })
  try {
    const row = await changeTicketStatus(appDb, req.params.id, {
      status,
      note,
      createdBy: req.user.fullName,
      now: new Date().toISOString().replace('T', ' ').slice(0, 19),
    })
    if (!row) return res.status(404).json({ error: 'Tiket tidak ditemukan' })
    res.json(row)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/tickets/:id', requireAuth, requireAdmin, async (req, res) => {
  const row = await getTicketById(appDb, req.params.id)
  if (!row) return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  try {
    res.json(await deleteTicket(appDb, req.params.id))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/tickets/meta/categories', requireAuth, async (_req, res) => {
  try {
    res.json(await listActiveTicketCategoryNames(appDb))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/tickets/meta/statuses', requireAuth, async (_req, res) => {
  try {
    res.json(await listTicketStatuses(appDb, { activeOnly: true }))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
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
}

// ─── Health check ───
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

// ─── Async startup ───────────────────────────────────────────────────────────
async function startServer() {
  const dbConf = loadDbConfig()
  const activeEngine  = dbConf.activeEngine || 'sqlite'
  const activeProfile = dbConf.profiles?.[activeEngine]
  if (!activeProfile) throw new Error(`Profil database "${activeEngine}" tidak ditemukan di db-config.json`)

  if (activeEngine === 'sqlite') {
    // SQLite: keep using synchronous better-sqlite3 init (handles schema migrations)
    const DB_PATH = activeProfile.filename || path.join(__dirname, 'aquameter.db')
    const rawDb = new Database(DB_PATH)
    rawDb.pragma('journal_mode = WAL')
    rawDb.pragma('foreign_keys = ON')
    appDb = createSqliteDbAdapter(rawDb)
    const { settingsCache } = initializeSqliteDatabase(rawDb, { hashPwd })
    _settingsCache = settingsCache
    _runtimeInfo = { engine: 'sqlite', sqlitePath: DB_PATH, note: `SQLite aktif: ${DB_PATH}` }
    console.log(`\n🚰 AquaMeter Server — SQLite: ${DB_PATH}`)
  } else {
    // MySQL / PostgreSQL: async adapter + async init
    appDb = await createDbAdapter(activeProfile)
    const { settingsCache } = await initializeDatabaseAsync(appDb, { hashPwd })
    _settingsCache = settingsCache
    _runtimeInfo = {
      engine: activeEngine,
      sqlitePath: null,
      note: `${activeEngine.toUpperCase()} aktif: ${activeProfile.host}:${activeProfile.port}/${activeProfile.database}`,
    }
    console.log(`\n🚰 AquaMeter Server — ${activeEngine.toUpperCase()}: ${activeProfile.host}:${activeProfile.port}/${activeProfile.database}`)
  }

  // Pre-seed tariff cache
  const tariffRows = await appDb.all('SELECT * FROM tariffs ORDER BY grp, blk_order')
  _tariffCache = {}
  for (const row of tariffRows) {
    if (!_tariffCache[row.grp]) _tariffCache[row.grp] = []
    _tariffCache[row.grp].push({ limit: row.limit_m3, price: row.price })
  }

  // Register WhatsApp bot handler
  wa.onMessage((jid, phone, text) =>
    handleMessage(jid, phone, text, { db: appDb, wa, calcWaterCost, getSettings, calcDueDate })
  )

  app.listen(PORT, () => {
    console.log(`🚀 http://localhost:${PORT}  [${activeEngine}]`)
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`)
    if (getSettings().waEnabled === 'true') {
      console.log('📲 Menghubungkan WhatsApp...')
      wa.connect().catch(e => console.error('WA auto-connect error:', e.message))
    }
  })
}

startServer().catch(err => {
  console.error('❌ Fatal startup error:', err.message)
  process.exit(1)
})

// ─── Helper functions ───
function getSettings() {
  return { ..._settingsCache }
}

// Tariff cache — pre-loaded at startup, updated via setTariffCacheEntry when changed
function getTariffBlocks(group) {
  return _tariffCache?.[group] || []
}
function invalidateTariffCache() { _tariffCache = null }
function setTariffCacheEntry(group, blocks) {
  if (!_tariffCache) _tariffCache = {}
  _tariffCache[group] = blocks.map(block => ({ limit: block.limit ?? null, price: block.price }))
}

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

module.exports = app
