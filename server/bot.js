/**
 * bot.js — WhatsApp bot catat meter mandiri
 *
 * Karena WhatsApp baru pakai LID (bukan nomor HP) sebagai JID,
 * pelanggan perlu registrasi sekali dengan kirim nomor meter mereka.
 * Setelah terdaftar, JID disimpan di kolom customers.wa_jid.
 *
 * State machine per JID:
 *   idle → wait_register → idle
 *   idle → wait_reading → wait_confirm → idle
 */

const sessions = new Map()
const SESSION_TIMEOUT_MS = 10 * 60 * 1000 // 10 menit

setInterval(() => {
  const now = Date.now()
  for (const [jid, s] of sessions) {
    if (now - s.updatedAt > SESSION_TIMEOUT_MS) sessions.delete(jid)
  }
}, 60_000)

function getSession(jid)              { return sessions.get(jid) || null }
function setSession(jid, state, data) { sessions.set(jid, { state, data: data || {}, updatedAt: Date.now() }) }
function clearSession(jid)            { sessions.delete(jid) }

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// Cari pelanggan by wa_jid (prioritas) — tidak lagi by phone karena WA pakai LID
function findCustomerByJid(db, jid) {
  return db.prepare("SELECT * FROM customers WHERE wa_jid = ? AND status = 'active'").get(jid) || null
}

// Simpan JID ke pelanggan setelah registrasi
function linkJid(db, custId, jid) {
  db.prepare('UPDATE customers SET wa_jid = ? WHERE id = ?').run(jid, custId)
}

// ─── Entry point ───
async function handleMessage(jid, _phone, rawText, deps) {
  const { db, wa, getSettings } = deps
  const text  = rawText.trim()
  const lower = text.toLowerCase()
  if (!text) return

  const sett        = getSettings()
  const companyName = sett.companyName || 'PAMSIMAS'

  // ── Perintah global ──
  if (['batal', 'cancel', 'keluar', 'stop', 'quit'].includes(lower)) {
    clearSession(jid)
    await wa.sendMessage(jid, `❌ Sesi dibatalkan.\n\nKetik *catat* untuk mulai lagi.`)
    return
  }

  if (['bantuan', 'help', '?', 'menu'].includes(lower)) {
    await wa.sendMessage(jid,
      `📋 *Menu Layanan ${companyName}*\n\n` +
      `• *catat* — Catat pembacaan meter mandiri\n` +
      `• *tagihan* — Cek tagihan bulan ini\n` +
      `• *aduan* — Laporkan keluhan/gangguan\n` +
      `• *tiket* — Cek status pengaduan\n` +
      `• *bantuan* — Tampilkan menu ini\n` +
      `• *batal* — Batalkan proses yang sedang berjalan`
    )
    return
  }

  // ── Cek status tiket — bisa dari perintah atau nomor tiket langsung ──
  if (['tiket', 'cek tiket', 'status tiket', 'pengaduan'].includes(lower)) {
    clearSession(jid)
    setSession(jid, 'wait_ticket_no', {})
    await wa.sendMessage(jid,
      `🎫 *Cek Status Pengaduan*\n\n` +
      `Kirimkan *nomor tiket* Anda.\n` +
      `Contoh: \`TKT-0001\`\n\n` +
      `_Ketik *batal* untuk membatalkan._`
    )
    return
  }

  // Nomor tiket langsung (format TKT-xxxx)
  if (/^tkt-\d+$/i.test(lower)) {
    const ticket = db.prepare(`
      SELECT t.*, c.name as cust_name
      FROM tickets t LEFT JOIN customers c ON c.id = t.cust_id
      WHERE LOWER(t.ticket_no) = LOWER(?)
    `).get(text.trim())
    await sendTicketStatus(jid, ticket, wa)
    return
  }

  // ── Routing berdasarkan state sesi ──
  const sess = getSession(jid)
  if (sess?.state === 'wait_register')          return handleWaitRegister(jid, text, sess, deps)
  if (sess?.state === 'wait_reading')           return handleWaitReading(jid, text, sess, deps)
  if (sess?.state === 'wait_confirm')           return handleWaitConfirm(jid, lower, sess, deps)
  if (sess?.state === 'wait_complaint_cat')     return handleWaitComplaintCat(jid, text, lower, sess, deps)
  if (sess?.state === 'wait_complaint_desc')    return handleWaitComplaintDesc(jid, text, sess, deps)
  if (sess?.state === 'wait_complaint_confirm') return handleWaitComplaintConfirm(jid, lower, sess, deps)
  if (sess?.state === 'wait_ticket_no')         return handleWaitTicketNo(jid, text, deps)

  // ── Cari pelanggan by JID ──
  const cust = findCustomerByJid(db, jid)

  if (!cust) {
    // Belum terdaftar — minta registrasi dengan nomor meter
    setSession(jid, 'wait_register', {})
    await wa.sendMessage(jid,
      `Halo! 👋 Selamat datang di *${companyName}*.\n\n` +
      `Untuk menggunakan layanan bot ini, silakan kirim *nomor meter* Anda.\n` +
      `Contoh: \`MET-0001\`\n\n` +
      `_Nomor meter tertera di kartu pelanggan atau struk tagihan Anda._`
    )
    return
  }

  return handleIdle(jid, lower, cust, deps)
}

// ─── STATE: wait_register ───
async function handleWaitRegister(jid, text, _sess, { db, wa, getSettings }) {
  const sett        = getSettings()
  const companyName = sett.companyName || 'PAMSIMAS'

  // Cari pelanggan dengan nomor meter yang dikirim (case-insensitive)
  const cust = db.prepare(
    "SELECT * FROM customers WHERE LOWER(meter) = LOWER(?) AND status = 'active'"
  ).get(text.trim())

  if (!cust) {
    await wa.sendMessage(jid,
      `⚠️ Nomor meter *${text}* tidak ditemukan.\n\n` +
      `Pastikan nomor meter sesuai dengan yang tertera di kartu pelanggan.\n` +
      `Coba lagi atau hubungi kantor *${companyName}* untuk bantuan.`
    )
    return
  }

  // Cek apakah meter sudah ditautkan ke JID lain
  if (cust.wa_jid && cust.wa_jid !== jid) {
    await wa.sendMessage(jid,
      `⚠️ Nomor meter ini sudah terdaftar di akun WhatsApp lain.\n` +
      `Hubungi kantor *${companyName}* untuk bantuan.`
    )
    return
  }

  // Simpan JID
  linkJid(db, cust.id, jid)
  clearSession(jid)

  await wa.sendMessage(jid,
    `✅ *Registrasi Berhasil!*\n\n` +
    `Akun WhatsApp Anda berhasil ditautkan ke:\n` +
    `👤 *${cust.name}*\n` +
    `🔢 No. Meter: *${cust.meter}*\n\n` +
    `Sekarang Anda bisa menggunakan layanan bot ini.\n` +
    `Ketik *catat* untuk catat meter atau *bantuan* untuk daftar perintah.`
  )
}

// ─── STATE: idle (pelanggan sudah terdaftar) ───
async function handleIdle(jid, lower, cust, { db, wa }) {
  const isTagihan = ['tagihan', 'cek', 'bayar', 'info', 'status', 'bill'].includes(lower)
  const isCatat   = ['catat', 'baca', 'meter', 'mulai', 'start', 'halo', 'hai', 'hi', '1'].includes(lower)
  const isAduan   = ['aduan', 'keluhan', 'lapor', 'gangguan', 'komplain', 'complaint'].includes(lower)

  if (isTagihan) {
    const period = new Date().toISOString().substring(0, 7)
    const bill   = db.prepare('SELECT * FROM bills WHERE cust_id = ? AND period_key = ?').get(cust.id, period)

    if (!bill) {
      await wa.sendMessage(jid,
        `📋 *Tagihan ${cust.name}*\n\n` +
        `Belum ada tagihan untuk bulan ini.\n\n` +
        `Ketik *catat* untuk catat meter mandiri.`
      )
    } else {
      const statusLabel = bill.status === 'paid' ? '✅ LUNAS' : '⏳ BELUM LUNAS'
      const paidLine    = bill.paid_date ? `\n• Tgl Bayar   : ${formatDate(bill.paid_date)}` : ''
      await wa.sendMessage(jid,
        `📋 *Tagihan ${cust.name}*\n\n` +
        `• No. Invoice : ${bill.invoice_no}\n` +
        `• Periode     : ${bill.period}\n` +
        `• Pemakaian   : ${bill.usage} m³\n` +
        `• Total       : Rp ${Number(bill.total).toLocaleString('id-ID')}\n` +
        `• Jatuh Tempo : ${formatDate(bill.due_date)}` +
        paidLine + `\n` +
        `• Status      : ${statusLabel}`
      )
    }
    return
  }

  if (isCatat) {
    const period   = new Date().toISOString().substring(0, 7)
    const existing = db.prepare('SELECT * FROM readings WHERE cust_id = ? AND period = ?').get(cust.id, period)

    if (existing) {
      await wa.sendMessage(jid,
        `ℹ️ Halo *${cust.name}*,\n\n` +
        `Meteran Anda sudah dicatat untuk bulan ini.\n` +
        `• Stand Tercatat : ${existing.current_stand} m³\n` +
        `• Pemakaian      : ${existing.usage} m³\n\n` +
        `Ketik *tagihan* untuk cek tagihan Anda.`
      )
      return
    }

    setSession(jid, 'wait_reading', { custId: cust.id })
    await wa.sendMessage(jid,
      `👋 Halo *${cust.name}*!\n\n` +
      `📍 No. Meter  : *${cust.meter}*\n` +
      `📊 Stand Lama : *${cust.last_stand} m³*\n\n` +
      `Silakan kirim *angka stand meter saat ini*.\n` +
      `Contoh: \`${cust.last_stand + 10}\`\n\n` +
      `_Ketik *batal* untuk membatalkan._`
    )
    return
  }

  if (isAduan) {
    const cats = db.prepare("SELECT name FROM ticket_categories WHERE is_active=1 ORDER BY id").all()
    const list = cats.map((c, i) => `${i + 1}. ${c.name}`).join('\n')
    setSession(jid, 'wait_complaint_cat', { custId: cust.id, custName: cust.name, cats: cats.map(c => c.name) })
    await wa.sendMessage(jid,
      `📢 *Laporan Keluhan / Gangguan*\n\n` +
      `Pilih kategori keluhan dengan mengetik nomornya:\n\n` +
      list + `\n\n_Ketik *batal* untuk membatalkan._`
    )
    return
  }

  // Pesan tidak dikenal
  await wa.sendMessage(jid,
    `Halo *${cust.name}*! 👋\n\n` +
    `Ketik *catat* untuk catat meter\n` +
    `Ketik *tagihan* untuk cek tagihan\n` +
    `Ketik *aduan* untuk laporkan keluhan\n` +
    `Ketik *tiket* untuk cek status pengaduan\n` +
    `Ketik *bantuan* untuk daftar perintah`
  )
}

// ─── STATE: wait_reading ───
async function handleWaitReading(jid, text, sess, { db, wa, calcWaterCost, getSettings }) {
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(sess.data.custId)
  if (!cust) { clearSession(jid); return }

  const cleaned = text.replace(/[\s.,]/g, '')
  const val     = parseInt(cleaned, 10)

  if (isNaN(val) || val <= 0 || String(val) !== cleaned) {
    await wa.sendMessage(jid,
      `⚠️ *Angka tidak valid.*\n\n` +
      `Masukkan angka stand meter (bilangan bulat, tanpa koma).\n` +
      `Stand lama: *${cust.last_stand} m³*`
    )
    return
  }

  if (val <= cust.last_stand) {
    await wa.sendMessage(jid,
      `⚠️ Angka harus *lebih besar* dari stand lama.\n\n` +
      `Stand lama    : *${cust.last_stand} m³*\n` +
      `Anda masukkan : *${val} m³*\n\n` +
      `Silakan masukkan angka yang benar.`
    )
    return
  }

  const usage     = val - cust.last_stand
  const sett      = getSettings()
  const { cost }  = calcWaterCost(cust.grp, usage)
  const admin     = parseFloat(sett.adminFee) || 5000
  const ppjActive = sett.ppjEnabled !== 'false'
  const ppj       = ppjActive ? Math.round(cost * (parseFloat(sett.ppjRate) || 10) / 100) : 0
  const total     = cost + admin + ppj

  setSession(jid, 'wait_confirm', { custId: cust.id, newStand: val, usage, total, cost, admin, ppj })

  const ppjLine = ppj > 0 ? `\n• PPJ        : Rp ${Number(ppj).toLocaleString('id-ID')}` : ''
  await wa.sendMessage(jid,
    `📋 *Konfirmasi Pembacaan Meter*\n\n` +
    `👤 Nama       : ${cust.name}\n` +
    `🔢 No Meter   : ${cust.meter}\n` +
    `📊 Stand Lama : ${cust.last_stand} m³\n` +
    `📊 Stand Baru : ${val} m³\n` +
    `💧 Pemakaian  : ${usage} m³\n\n` +
    `💰 *Estimasi Tagihan:*\n` +
    `• Air        : Rp ${Number(cost).toLocaleString('id-ID')}\n` +
    `• Admin      : Rp ${Number(admin).toLocaleString('id-ID')}` +
    ppjLine + `\n` +
    `• *Total     : Rp ${Number(total).toLocaleString('id-ID')}*\n\n` +
    `Ketik *ya* untuk konfirmasi atau *batal* untuk membatalkan.`
  )
}

// ─── STATE: wait_confirm ───
async function handleWaitConfirm(jid, lower, sess, { db, wa, getSettings, calcDueDate }) {
  const YES = ['ya', 'yes', 'iya', 'ok', 'oke', 'setuju', 'y', '1', 'benar', 'lanjut']
  if (!YES.includes(lower)) {
    await wa.sendMessage(jid, `Ketik *ya* untuk konfirmasi atau *batal* untuk membatalkan.`)
    return
  }

  const { custId, newStand, usage, total, cost, admin, ppj } = sess.data
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(custId)
  if (!cust) { clearSession(jid); return }

  const sett    = getSettings()
  const today   = new Date().toISOString().split('T')[0]
  const period  = today.substring(0, 7)
  const dueDate = calcDueDate(today, parseInt(sett.dueDays) || 20)

  const existing = db.prepare('SELECT id FROM readings WHERE cust_id = ? AND period = ?').get(custId, period)
  if (existing) {
    clearSession(jid)
    await wa.sendMessage(jid,
      `⚠️ Meteran bulan ini sudah tercatat.\n` +
      `Ketik *tagihan* untuk cek tagihan Anda.`
    )
    return
  }

  try {
    const periodName = new Date(today + 'T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO readings (cust_id, last_stand, current_stand, usage, date, note, period)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(custId, cust.last_stand, newStand, usage, today, 'Catat mandiri via WhatsApp', period)

      const b = db.prepare(`
        INSERT INTO bills (cust_id, invoice_no, period, period_key, usage, water_cost, admin, ppj, total, due_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(custId, `_TMP_${Date.now()}`, periodName, period, usage, cost, admin, ppj, total, dueDate)

      const billId    = b.lastInsertRowid
      const invoiceNo = `INV-${new Date().getFullYear()}-${String(billId).padStart(4, '0')}`
      db.prepare('UPDATE bills SET invoice_no = ? WHERE id = ?').run(invoiceNo, billId)
      db.prepare('UPDATE customers SET last_stand = ? WHERE id = ?').run(newStand, custId)

      return { invoiceNo }
    })

    const { invoiceNo } = tx()
    clearSession(jid)

    await wa.sendMessage(jid,
      `✅ *Pembacaan Meter Berhasil Dicatat!*\n\n` +
      `• No. Invoice : ${invoiceNo}\n` +
      `• Periode     : ${periodName}\n` +
      `• Pemakaian   : ${usage} m³\n` +
      `• Total       : Rp ${Number(total).toLocaleString('id-ID')}\n` +
      `• Jatuh Tempo : ${formatDate(dueDate)}\n\n` +
      `Mohon lakukan pembayaran sebelum jatuh tempo.\n` +
      `Terima kasih! 🙏\n\n` +
      `_${sett.companyName || 'PAMSIMAS'}_`
    )
  } catch (e) {
    clearSession(jid)
    console.error('Bot catat error:', e.message)
    await wa.sendMessage(jid,
      `❌ Terjadi kesalahan saat mencatat.\n` +
      `Silakan coba lagi atau hubungi kantor.`
    )
  }
}

// ─── Tiket status helper ───
const TICKET_STATUS_LABEL = {
  open:        '🟡 Baru — menunggu penanganan',
  in_progress: '🔵 Sedang ditangani',
  resolved:    '✅ Selesai ditangani',
  closed:      '⚪ Tiket ditutup',
}

async function sendTicketStatus(jid, ticket, wa) {
  if (!ticket) {
    await wa.sendMessage(jid,
      `⚠️ Nomor tiket tidak ditemukan.\n\n` +
      `Pastikan format benar, contoh: \`TKT-0001\``
    )
    return
  }
  const lines = [
    `🎫 *Status Pengaduan ${ticket.ticket_no}*\n`,
    `• Kategori  : ${ticket.category}`,
    `• Status    : ${TICKET_STATUS_LABEL[ticket.status] || ticket.status}`,
    `• Prioritas : ${ticket.priority === 'critical' ? '🔴 Kritis' : ticket.priority === 'high' ? '🟠 Tinggi' : ticket.priority === 'medium' ? '🟡 Sedang' : '⚪ Rendah'}`,
    ticket.assigned_to ? `• Ditangani : ${ticket.assigned_to}` : null,
    `• Dibuat    : ${formatDate(ticket.created_at)}`,
    ticket.resolved_at ? `• Selesai   : ${formatDate(ticket.resolved_at)}` : null,
  ].filter(Boolean).join('\n')
  await wa.sendMessage(jid, lines)
}

// ─── STATE: wait_ticket_no ───
async function handleWaitTicketNo(jid, text, { db, wa }) {
  clearSession(jid)
  const ticket = db.prepare(`
    SELECT t.*, c.name as cust_name
    FROM tickets t LEFT JOIN customers c ON c.id = t.cust_id
    WHERE LOWER(t.ticket_no) = LOWER(?)
  `).get(text.trim())
  await sendTicketStatus(jid, ticket, wa)
}

// ─── STATE: wait_complaint_cat ───
async function handleWaitComplaintCat(jid, text, _lower, sess, { wa }) {
  const { cats, custId, custName } = sess.data
  const num = parseInt(text.trim(), 10)
  const byName = cats.findIndex(c => c.toLowerCase() === text.trim().toLowerCase())

  let category = null
  if (!isNaN(num) && num >= 1 && num <= cats.length) {
    category = cats[num - 1]
  } else if (byName >= 0) {
    category = cats[byName]
  }

  if (!category) {
    const list = cats.map((c, i) => `${i + 1}. ${c}`).join('\n')
    await wa.sendMessage(jid,
      `⚠️ Pilihan tidak valid. Ketik nomor 1–${cats.length}:\n\n` + list
    )
    return
  }

  setSession(jid, 'wait_complaint_desc', { custId, custName, category })
  await wa.sendMessage(jid,
    `📝 Kategori: *${category}*\n\n` +
    `Silakan jelaskan keluhan Anda secara singkat dan jelas.\n` +
    `_Ketik *batal* untuk membatalkan._`
  )
}

// ─── STATE: wait_complaint_desc ───
async function handleWaitComplaintDesc(jid, text, sess, { wa }) {
  if (text.trim().length < 5) {
    await wa.sendMessage(jid, `⚠️ Deskripsi terlalu singkat. Tolong jelaskan lebih detail.`)
    return
  }
  setSession(jid, 'wait_complaint_confirm', { ...sess.data, description: text.trim() })
  await wa.sendMessage(jid,
    `📋 *Konfirmasi Laporan Keluhan*\n\n` +
    `• Kategori : ${sess.data.category}\n` +
    `• Keluhan  : ${text.trim()}\n\n` +
    `Ketik *ya* untuk mengirim atau *batal* untuk membatalkan.`
  )
}

// ─── STATE: wait_complaint_confirm ───
async function handleWaitComplaintConfirm(jid, lower, sess, { db, wa, getSettings }) {
  const YES = ['ya', 'yes', 'iya', 'ok', 'oke', 'y', '1', 'kirim', 'lanjut']
  if (!YES.includes(lower)) {
    await wa.sendMessage(jid, `Ketik *ya* untuk mengirim atau *batal* untuk membatalkan.`)
    return
  }

  const { custId, custName, category, description } = sess.data
  const sett = getSettings()

  // Buat nomor tiket
  const last = db.prepare("SELECT ticket_no FROM tickets ORDER BY id DESC LIMIT 1").get()
  let seq = 1
  if (last) { const m = last.ticket_no.match(/TKT-(\d+)/); if (m) seq = parseInt(m[1]) + 1 }
  const ticketNo = `TKT-${String(seq).padStart(4, '0')}`

  const cust = custId ? db.prepare('SELECT * FROM customers WHERE id = ?').get(custId) : null
  const now  = new Date().toISOString().replace('T', ' ').slice(0, 19)

  try {
    const r = db.prepare(`
      INSERT INTO tickets (ticket_no, cust_id, reporter_name, reporter_phone, category, description, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'medium', ?, ?)
    `).run(ticketNo, custId || null, custName, cust?.phone || null, category, description, now, now)

    db.prepare(`
      INSERT INTO ticket_updates (ticket_id, status, note, created_by, created_at)
      VALUES (?, 'open', 'Laporan masuk via WhatsApp', 'Bot WA', ?)
    `).run(r.lastInsertRowid, now)

    clearSession(jid)
    await wa.sendMessage(jid,
      `✅ *Laporan Berhasil Dikirim!*\n\n` +
      `• No. Tiket : *${ticketNo}*\n` +
      `• Kategori  : ${category}\n\n` +
      `Tim *${sett.companyName || 'PAMSIMAS'}* akan segera menindaklanjuti.\n` +
      `Simpan nomor tiket Anda untuk pengecekan status.\n\nTerima kasih 🙏`
    )
  } catch (e) {
    clearSession(jid)
    console.error('Bot complaint error:', e.message)
    await wa.sendMessage(jid, `❌ Gagal mengirim laporan. Silakan coba lagi atau hubungi kantor.`)
  }
}

module.exports = { handleMessage }
