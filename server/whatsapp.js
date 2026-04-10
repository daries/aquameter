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

const AUTH_DIR = path.join(__dirname, '.wa_auth')

let sock             = null
let currentQR        = null
let connectionStatus = 'disconnected'
let reconnectTimer   = null
let _messageHandler  = null   // dipasang dari index.js via onMessage()

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
    printQRInTerminal: true,   // juga cetak di terminal untuk debugging
    logger:            pino({ level: 'silent' }),
    browser:           ['AquaMeter', 'Chrome', '1.0.0'],
  })

  sock.ev.on('creds.update', saveCreds)

  // ── Terima pesan masuk dari pelanggan ──
  sock.ev.on('messages.upsert', (upsert) => {
    const { messages, type } = upsert
    console.log(`📬 messages.upsert type="${type}" count=${messages?.length}`)
    if (type !== 'notify') return
    for (const msg of messages) {
      // Skip pesan dari diri sendiri, grup, atau tanpa konten
      if (msg.key.fromMe)             continue
      if (msg.key.remoteJid?.endsWith('@g.us')) continue
      if (!msg.message)               continue

      const jid   = msg.key.remoteJid
      const phone = jid.split('@')[0].split(':')[0]  // strip device suffix: 628xxx:10 → 628xxx
      const text  =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        ''

      console.log(`📩 Pesan masuk [${phone}]: "${text}" | handler: ${!!_messageHandler}`)

      if (text && _messageHandler) {
        _messageHandler(jid, phone, text).catch(e =>
          console.error('Bot handler error:', e.message, e.stack)
        )
      } else if (!_messageHandler) {
        console.warn('⚠️  _messageHandler belum terdaftar!')
      }
    }
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      connectionStatus = 'qr'
      try {
        currentQR = await qrcode.toDataURL(qr, { width: 300, margin: 2 })
        console.log('📷 QR code generated, panjang:', currentQR.length)
      } catch (e) {
        console.error('❌ qrcode.toDataURL gagal:', e.message)
      }
    }

    if (connection === 'open') {
      connectionStatus = 'connected'
      currentQR        = null
      console.log('✅ WhatsApp terhubung:', sock.user?.id)
    }

    if (connection === 'close') {
      const code        = lastDisconnect?.error?.output?.statusCode
      const isLoggedOut = code === DisconnectReason.loggedOut
      connectionStatus  = 'disconnected'
      currentQR         = null
      sock              = null
      console.log('⚠️  WhatsApp terputus, kode:', code, isLoggedOut ? '(logout)' : '(reconnect)')

      if (isLoggedOut) {
        try { fs.rmSync(AUTH_DIR, { recursive: true }) } catch (_) {}
      } else {
        // Reconnect dengan jeda acak 5–12 detik agar tidak terlihat bot
        const delay = Math.floor(Math.random() * 7000) + 5000
        reconnectTimer = setTimeout(connect, delay)
      }
    }
  })
}

function getStatus() {
  return {
    status: connectionStatus,
    qr:     currentQR,
    phone:  sock?.user?.id?.split(':')[0] || null,
  }
}

// Delay acak antara min–max milidetik, meniru jeda manusia mengetik
function randomDelay(minMs = 2000, maxMs = 6000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Simulasi typing indicator sebelum kirim pesan
async function sendWithHumanDelay(jid, text) {
  // 1. Tandai "sedang mengetik" selama durasi acak
  await sock.sendPresenceUpdate('composing', jid)
  // Kecepatan mengetik manusia: ~40–80 wpm → ~200–400ms per kata
  const wordCount    = text.split(/\s+/).length
  const typingMs     = Math.floor(wordCount * (Math.random() * 200 + 200))
  const cappedTyping = Math.min(Math.max(typingMs, 1500), 8000) // min 1.5s, max 8s
  await randomDelay(cappedTyping, cappedTyping + Math.floor(Math.random() * 1500))

  // 2. Stop typing sebentar (jeda "berpikir")
  await sock.sendPresenceUpdate('paused', jid)
  await randomDelay(300, 1200)

  // 3. Kirim pesan
  await sock.sendMessage(jid, { text })
}

async function sendMessage(recipient, text) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp belum terhubung')
  }
  // Jika recipient sudah berupa JID lengkap (ada '@'), pakai langsung
  // Jika hanya nomor HP, format menjadi JID
  const jid = recipient.includes('@') ? recipient : formatJid(recipient)

  // Jeda awal acak sebelum mulai — meniru waktu buka chat
  await randomDelay(1500, 4000)

  await sendWithHumanDelay(jid, text)
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

function formatJid(phone) {
  // Bersihkan dari device suffix (628xxx:10 → 628xxx) dan karakter non-digit
  let num = String(phone).split(':')[0].replace(/\D/g, '')
  if (num.startsWith('0'))   num = '62' + num.slice(1)
  if (!num.startsWith('62')) num = '62' + num
  return num + '@s.whatsapp.net'
}

module.exports = { connect, getStatus, sendMessage, disconnect, onMessage }
