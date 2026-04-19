const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys')
const pino   = require('pino')
const qrcode = require('qrcode')
const path   = require('path')
const fs     = require('fs')

const DATA_DIR  = process.env.DATA_DIR || __dirname
const AUTH_DIR  = path.join(DATA_DIR, '.wa_auth')
const MAX_QUEUE = 200   // simpan maks 200 item di memori

let sock             = null
let currentQR        = null
let connectionStatus = 'disconnected'
let reconnectTimer   = null
let _messageHandler  = null

// ─── Queue ────────────────────────────────────────────────────────────────────
const queue       = []   // { id, jid, phone, description, text, status, addedAt, sentAt, error }
let isProcessing  = false

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function enqueue(recipient, text, description = '') {
  const jid   = recipient.includes('@') ? recipient : formatJid(recipient)
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
        if (!sock || connectionStatus !== 'connected') {
          throw new Error('WhatsApp belum terhubung')
        }
        // Jeda awal sebelum buka chat (meniru perilaku manusia)
        await randomDelay(2000, 5000)
        await sendWithHumanDelay(item.jid, item.text)
        item.status = 'sent'
        item.sentAt = new Date().toISOString()
        console.log(`✅ WA terkirim [${item.phone}]: ${item.description}`)
      } catch (e) {
        item.status = 'failed'
        item.error  = e.message
        console.error(`❌ WA gagal [${item.phone}]: ${e.message}`)
      }

      // Jeda antar pesan: 8–20 detik — lebih lama = lebih aman dari deteksi
      const pending = queue.filter(q => q.status === 'pending')
      if (pending.length > 0) {
        await randomDelay(8000, 20000)
      }
    }
  } finally {
    isProcessing = false
  }
}

function getQueue() {
  // Kembalikan 100 item terbaru, terbaru di atas
  return queue.slice(-100).reverse()
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
  clearReconnect()
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version }          = await fetchLatestBaileysVersion()
  console.log('📱 WA version:', version)

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
    const { messages, type } = upsert
    if (type !== 'notify') return
    for (const msg of messages) {
      if (msg.key.fromMe)                        continue
      if (msg.key.remoteJid?.endsWith('@g.us'))  continue
      if (!msg.message)                          continue

      const jid   = msg.key.remoteJid
      const phone = jid.split('@')[0].split(':')[0]
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
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      connectionStatus = 'qr'
      try { currentQR = await qrcode.toDataURL(qr, { width: 300, margin: 2 }) } catch (_) {}
    }

    if (connection === 'open') {
      connectionStatus = 'connected'
      currentQR        = null
      console.log('✅ WhatsApp terhubung:', sock.user?.id)
      // Lanjutkan antrian yang sempat tertunda
      processQueue()
    }

    if (connection === 'close') {
      const code        = lastDisconnect?.error?.output?.statusCode
      const isLoggedOut = code === DisconnectReason.loggedOut
      connectionStatus  = 'disconnected'
      currentQR         = null
      sock              = null
      console.log('⚠️  WA terputus, kode:', code)

      if (isLoggedOut) {
        try { fs.rmSync(AUTH_DIR, { recursive: true }) } catch (_) {}
      } else {
        const delay = Math.floor(Math.random() * 7000) + 5000
        reconnectTimer = setTimeout(connect, delay)
      }
    }
  })
}

function getStatus() {
  return {
    status:     connectionStatus,
    qr:         currentQR,
    phone:      sock?.user?.id?.split(':')[0] || null,
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

async function sendWithHumanDelay(jid, text) {
  await sock.sendPresenceUpdate('composing', jid)
  const wordCount    = text.split(/\s+/).length
  const typingMs     = Math.floor(wordCount * (Math.random() * 200 + 200))
  const cappedTyping = Math.min(Math.max(typingMs, 1500), 8000)
  await randomDelay(cappedTyping, cappedTyping + Math.floor(Math.random() * 1500))
  await sock.sendPresenceUpdate('paused', jid)
  await randomDelay(300, 1200)
  await sock.sendMessage(jid, { text })
}

function formatJid(phone) {
  let num = String(phone).split(':')[0].replace(/\D/g, '')
  if (num.startsWith('0'))   num = '62' + num.slice(1)
  if (!num.startsWith('62')) num = '62' + num
  return num + '@s.whatsapp.net'
}

async function disconnect() {
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
  enqueue,
  getQueue, clearDone, retryFailed,
  // backward-compat alias agar bot.js tetap jalan
  sendMessage: (recipient, text) => enqueue(recipient, text, 'Bot reply'),
}
