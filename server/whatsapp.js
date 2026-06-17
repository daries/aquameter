const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys')
const pino   = require('pino')
const qrcode = require('qrcode')
const path   = require('path')
const fs     = require('fs')
const axios  = require('axios')

const AUTH_DIR  = path.join(__dirname, '.wa_auth')
const MAX_QUEUE = 200   // simpan maks 200 item di memori

let sock             = null
let currentQR        = null
let connectionStatus = 'disconnected'
let reconnectTimer   = null
let _messageHandler  = null

// ─── Fonnte mode ───────────────────────────────────────────────────────────────
let waMode      = 'baileys'   // 'baileys' | 'fonnte'
let fonnteToken = ''
let fonntePhone = null

function setMode(mode, token) {
  const switching = mode !== waMode
  waMode      = mode || 'baileys'
  fonnteToken = token || ''

  if (switching && waMode === 'fonnte') {
    clearReconnect()
    if (sock) {
      try { sock.logout() } catch (_) {}
      sock = null
    }
    connectionStatus = 'disconnected'
    currentQR        = null
    fonntePhone      = null
  }

  if (switching && waMode === 'baileys') {
    fonntePhone      = null
    connectionStatus = 'disconnected'
  }
}

// tokenOverride — untuk test langsung dari form sebelum settings disimpan
async function validateFonnteToken(tokenOverride) {
  const token = tokenOverride || fonnteToken
  if (!token) {
    connectionStatus = 'disconnected'
    fonntePhone      = null
    return { ok: false, message: 'Token Fonnte belum dikonfigurasi' }
  }
  try {
    const resp = await axios.post('https://api.fonnte.com/device', {}, {
      headers: { Authorization: token },
      timeout: 10000,
    })
    console.log('[Fonnte] device response:', JSON.stringify(resp.data))
    // Fonnte mengembalikan status: true saat berhasil
    if (resp.data?.status === true) {
      const devices = resp.data?.data
      const device  = Array.isArray(devices) && devices.length > 0
        ? (devices[0].device || devices[0].name || null)
        : null
      // Hanya update state global jika bukan test preview (override)
      if (!tokenOverride) {
        connectionStatus = 'connected'
        fonntePhone      = device
      }
      return { ok: true, device }
    }
    if (!tokenOverride) {
      connectionStatus = 'disconnected'
      fonntePhone      = null
    }
    return { ok: false, message: resp.data?.reason || resp.data?.message || 'Token tidak valid atau perangkat tidak aktif' }
  } catch (e) {
    console.error('[Fonnte] device error:', e.message, e.response?.data)
    if (!tokenOverride) {
      connectionStatus = 'disconnected'
      fonntePhone      = null
    }
    return { ok: false, message: e.response?.data?.reason || e.response?.data?.message || e.message }
  }
}

async function sendViaFonnte(phone, text) {
  if (!fonnteToken) throw new Error('Token Fonnte belum dikonfigurasi')

  let num = String(phone).split(':')[0].replace(/\D/g, '')
  if (num.startsWith('0'))   num = '62' + num.slice(1)
  if (!num.startsWith('62')) num = '62' + num

  const resp = await axios.post('https://api.fonnte.com/send', {
    target: num,
    message: text,
    countryCode: '62',
  }, {
    headers: { Authorization: fonnteToken },
    timeout: 30000,
  })

  if (resp.data?.status === false) {
    throw new Error(resp.data?.reason || resp.data?.message || 'Gagal kirim via Fonnte')
  }
}

async function sendImageViaFonnte(phone, imageBase64, caption) {
  if (!fonnteToken) throw new Error('Token Fonnte belum dikonfigurasi')

  let num = String(phone).split(':')[0].replace(/\D/g, '')
  if (num.startsWith('0'))   num = '62' + num.slice(1)
  if (!num.startsWith('62')) num = '62' + num

  const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, '')

  const resp = await axios.post('https://api.fonnte.com/send', {
    target: num,
    message: caption || '',
    file: `data:image/jpeg;base64,${base64Clean}`,
    countryCode: '62',
  }, {
    headers: { Authorization: fonnteToken },
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })

  if (resp.data?.status === false) {
    throw new Error(resp.data?.reason || resp.data?.message || 'Gagal kirim gambar via Fonnte')
  }
}

// ─── Queue ────────────────────────────────────────────────────────────────────
const queue       = []   // { id, jid, phone, description, text, status, addedAt, sentAt, error }
let isProcessing  = false

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function enqueue(recipient, text, description = '') {
  const jid   = recipient.includes('@') ? jidNormalizedUser(recipient) : formatJid(recipient)
  const phone = jid.split('@')[0]
  const item  = {
    id: nextId(),
    jid,
    phone,
    description,
    text,
    status:   'pending',
    addedAt:  new Date().toISOString(),
    sentAt:   null,
    error:    null,
  }
  queue.push(item)
  trimQueue()
  processQueue()
  return item.id
}

function enqueueImage(recipient, imageBase64, caption, description = '') {
  const jid   = recipient.includes('@') ? jidNormalizedUser(recipient) : formatJid(recipient)
  const phone = jid.split('@')[0]
  const item  = {
    id: nextId(),
    jid,
    phone,
    description,
    text:        caption || '',
    imageBase64,
    status:      'pending',
    addedAt:     new Date().toISOString(),
    sentAt:      null,
    error:       null,
  }
  queue.push(item)
  trimQueue()
  processQueue()
  return item.id
}

function trimQueue() {
  if (queue.length <= MAX_QUEUE) return
  // Hapus yang sudah sent/failed paling lama
  const done = queue.filter(q => q.status === 'sent' || q.status === 'failed')
  const keep = MAX_QUEUE - queue.filter(q => q.status === 'pending' || q.status === 'sending').length
  const removeCount = queue.length - MAX_QUEUE
  let removed = 0
  for (let i = 0; i < queue.length && removed < removeCount; i++) {
    if (queue[i].status === 'sent' || queue[i].status === 'failed') {
      queue.splice(i, 1)
      i--; removed++
    }
  }
}

async function processQueue() {
  if (isProcessing) return
  isProcessing = true
  try {
    while (true) {
      const item = queue.find(q => q.status === 'pending')
      if (!item) break

      item.status = 'sending'

      try {
        if (waMode === 'fonnte') {
          if (item.imageBase64) {
            await sendImageViaFonnte(item.phone, item.imageBase64, item.text)
          } else {
            await sendViaFonnte(item.phone, item.text)
          }
        } else {
          if (!sock || connectionStatus !== 'connected') {
            throw new Error('WhatsApp belum terhubung')
          }
          await randomDelay(2000, 5000)
          if (item.imageBase64) {
            const imgBuf = Buffer.from(
              item.imageBase64.replace(/^data:image\/\w+;base64,/, ''),
              'base64'
            )
            await sendWithHumanDelay(item.jid, item.text, imgBuf)
          } else {
            await sendWithHumanDelay(item.jid, item.text)
          }
        }
        item.status = 'sent'
        item.sentAt = new Date().toISOString()
        console.log(`✅ WA terkirim [${item.phone}]: ${item.description}`)
      } catch (e) {
        item.status = 'failed'
        item.error  = e.message
        console.error(`❌ WA gagal [${item.phone}]: ${e.message}`)
      }

      const pending = queue.filter(q => q.status === 'pending')
      if (pending.length > 0) {
        // Fonnte API: jeda lebih pendek; Baileys: 8–20 detik agar tidak terdeteksi
        await randomDelay(waMode === 'fonnte' ? 1000 : 8000, waMode === 'fonnte' ? 3000 : 20000)
      }
    }
  } finally {
    isProcessing = false
  }
}

function getQueue() {
  return queue.slice(-100).reverse().map(({ imageBase64, ...item }) =>
    imageBase64 ? { ...item, hasImage: true } : item
  )
}

function clearDone() {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].status === 'sent' || queue[i].status === 'failed') {
      queue.splice(i, 1)
    }
  }
}

function retryFailed() {
  queue.forEach(q => {
    if (q.status === 'failed') {
      q.status = 'pending'
      q.error  = null
    }
  })
  processQueue()
}

// ─── Connection ───────────────────────────────────────────────────────────────
function onMessage(handler) { _messageHandler = handler }

function clearReconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

async function connect() {
  if (waMode === 'fonnte') {
    connectionStatus = 'connecting'
    const result = await validateFonnteToken()
    if (!result.ok) {
      connectionStatus = 'disconnected'
      throw new Error(result.message || 'Token Fonnte tidak valid')
    }
    return
  }

  clearReconnect()
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

  // fetchLatestBaileysVersion bisa gagal jika Meta memblok request — fallback ke versi stabil
  let version = [2, 3000, 1015901307]
  try {
    const res = await fetchLatestBaileysVersion()
    version = res.version
    console.log('📱 WA version:', version)
  } catch (e) {
    console.warn('⚠️  Gagal fetch WA version, pakai fallback:', version, '|', e.message)
  }

  connectionStatus = 'connecting'
  currentQR        = null

  sock = makeWASocket({
    version,
    auth:              state,
    printQRInTerminal: true,
    logger:            pino({ level: 'silent' }),
    browser:           ['AquaMeter', 'Chrome', '1.0.0'],
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', (upsert) => {
    try {
      const { messages, type } = upsert
      if (type !== 'notify') return
      for (const msg of messages) {
        if (msg.key.fromMe)                        continue
        if (msg.key.remoteJid?.endsWith('@g.us'))  continue
        if (!msg.message)                          continue

        const rawJid = msg.key.remoteJid
        const jid    = jidNormalizedUser(rawJid)
        const phone  = jid.split('@')[0]
        const text  =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          ''

        if (text && _messageHandler) {
          _messageHandler(jid, phone, text).catch(e =>
            console.error('Bot handler error:', e.message)
          )
        }
      }
    } catch (e) {
      console.error('messages.upsert error (diabaikan):', e.message)
    }
  })

  sock.ev.on('connection.update', async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        connectionStatus = 'qr'
        try { currentQR = await qrcode.toDataURL(qr, { width: 300, margin: 2 }) } catch (_) {}
      }

      if (connection === 'open') {
        connectionStatus = 'connected'
        currentQR        = null
        console.log('✅ WhatsApp terhubung:', sock.user?.id)
        processQueue()
      }

      if (connection === 'close') {
        const code        = lastDisconnect?.error?.output?.statusCode
        const isLoggedOut = code === DisconnectReason.loggedOut
        connectionStatus  = 'disconnected'
        currentQR         = null
        sock              = null
        console.log('⚠️  WA terputus, kode:', code)

        // Tandai item yang sedang 'sending' sebagai failed agar antrian tidak stuck
        queue.forEach(q => {
          if (q.status === 'sending') { q.status = 'failed'; q.error = 'Koneksi WA terputus' }
        })
        isProcessing = false

        if (isLoggedOut) {
          try { fs.rmSync(AUTH_DIR, { recursive: true }) } catch (_) {}
        } else {
          // Backoff bertahap: reconnect semakin lambat jika terus gagal
          const delay = Math.floor(Math.random() * 10000) + 8000
          console.log(`🔄 Reconnect dalam ${Math.round(delay / 1000)}s...`)
          reconnectTimer = setTimeout(() => connect().catch(e =>
            console.error('Reconnect error:', e.message)
          ), delay)
        }
      }
    } catch (e) {
      console.error('connection.update error (diabaikan):', e.message)
    }
  })
}

function getStatus() {
  return {
    status:     connectionStatus,
    qr:         waMode === 'fonnte' ? null : currentQR,
    phone:      waMode === 'fonnte' ? fonntePhone : (sock?.user?.id?.split(':')[0] || null),
    waMode,
    queueStats: {
      pending:  queue.filter(q => q.status === 'pending').length,
      sending:  queue.filter(q => q.status === 'sending').length,
      sent:     queue.filter(q => q.status === 'sent').length,
      failed:   queue.filter(q => q.status === 'failed').length,
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randomDelay(minMs = 2000, maxMs = 6000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendWithHumanDelay(jid, text, imageBuffer = null) {
  if (!sock) throw new Error('WhatsApp belum terhubung')
  try { await sock.sendPresenceUpdate('composing', jid) } catch (_) {}
  const wordCount    = (text || '').split(/\s+/).length
  const typingMs     = Math.floor(wordCount * (Math.random() * 200 + 200))
  const cappedTyping = Math.min(Math.max(typingMs, 1500), 8000)
  await randomDelay(cappedTyping, cappedTyping + Math.floor(Math.random() * 1500))
  try { await sock.sendPresenceUpdate('paused', jid) } catch (_) {}
  await randomDelay(300, 1200)
  if (!sock) throw new Error('WhatsApp terputus saat mengirim')
  if (imageBuffer) {
    await sock.sendMessage(jid, { image: imageBuffer, caption: text || '' })
  } else {
    await sock.sendMessage(jid, { text })
  }
}

function formatJid(phone) {
  let num = String(phone).split(':')[0].replace(/\D/g, '')
  if (num.startsWith('0'))   num = '62' + num.slice(1)
  if (!num.startsWith('62')) num = '62' + num
  return num + '@s.whatsapp.net'
}

async function disconnect() {
  if (waMode === 'fonnte') {
    connectionStatus = 'disconnected'
    fonntePhone      = null
    return
  }

  clearReconnect()
  if (sock) {
    try { await sock.logout() } catch (_) {}
    sock = null
  }
  try { fs.rmSync(AUTH_DIR, { recursive: true }) } catch (_) {}
  connectionStatus = 'disconnected'
  currentQR        = null
}

module.exports = {
  connect, disconnect, onMessage,
  getStatus,
  enqueue, enqueueImage,
  getQueue, clearDone, retryFailed,
  setMode,
  testFonnte: validateFonnteToken,
  sendMessage: (recipient, text) => enqueue(recipient, text, 'Bot reply'),
}
