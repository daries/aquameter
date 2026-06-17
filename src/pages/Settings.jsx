import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { settingsAPI, waAPI, databaseAPI } from '../utils/api'
import { getUser } from '../utils/auth'
import { Card, Button, FormInput, FormSelect } from '../components/UI'

const WA_STATUS_LABEL = {
  disconnected: { text: 'Tidak Terhubung', color: 'var(--danger)' },
  connecting:   { text: 'Menghubungkan…',  color: '#f59e0b' },
  qr:           { text: 'Scan QR Code',    color: '#f59e0b' },
  connected:    { text: 'Terhubung',        color: 'var(--mint)' },
}

const DB_ENGINES = [
  { value: 'sqlite',   label: 'SQLite' },
  { value: 'mysql',    label: 'MySQL' },
  { value: 'mariadb',  label: 'MariaDB' },
  { value: 'postgres', label: 'PostgreSQL' },
]

const emptyDbForm = {
  activeEngine: 'sqlite',
  profiles: {
    sqlite:   { engine: 'sqlite',   filename: 'server/aquameter.db' },
    mysql:    { engine: 'mysql',    host: '127.0.0.1', port: 3306, user: '', password: '', database: 'aquameter', ssl: false },
    mariadb:  { engine: 'mariadb',  host: '127.0.0.1', port: 3306, user: '', password: '', database: 'aquameter', ssl: false },
    postgres: { engine: 'postgres', host: '127.0.0.1', port: 5432, user: '', password: '', database: 'aquameter', ssl: false },
  },
}

export default function Settings() {
  const { showToast } = useStore()
  const user    = getUser()
  const isAdmin = user?.role === 'admin'

  const [form,    setForm]    = useState({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(null)
  const [dbForm, setDbForm] = useState(emptyDbForm)
  const [dbRuntime, setDbRuntime] = useState(null)
  const [dbAction, setDbAction] = useState(null)
  const [migrationResult, setMigrationResult] = useState(null)
  const [migSource, setMigSource] = useState('sqlite')
  const [migTarget, setMigTarget] = useState('mysql')
  const [migAppend, setMigAppend] = useState(false)
  const [migConfirm, setMigConfirm] = useState(false)
  const loadedRef = useRef(false)

  // WhatsApp state
  const [waStatus,      setWaStatus]      = useState({ status: 'disconnected', qr: null, phone: null, waMode: 'baileys', queueStats: null })
  const [waConnecting,  setWaConnecting]  = useState(false)
  const [waQueue,       setWaQueue]       = useState([])
  const [showQueue,     setShowQueue]     = useState(false)
  const [showToken,      setShowToken]      = useState(false)
  const [fonnteLoading,  setFonnteLoading]  = useState(false)
  const [webhookLog,     setWebhookLog]     = useState([])
  const [webhookPhone,   setWebhookPhone]   = useState('')
  const [webhookMsg,     setWebhookMsg]     = useState('bantuan')
  const [testWHLoading,  setTestWHLoading]  = useState(false)
  const waPollerRef      = useRef(null)
  const queuePollerRef   = useRef(null)
  const whLogPollerRef   = useRef(null)

  const pollWA       = () => waAPI.status().then(setWaStatus).catch(() => {})
  const pollQueue    = () => waAPI.getQueue().then(setWaQueue).catch(() => {})
  const pollWHLog    = () => waAPI.webhookLog().then(setWebhookLog).catch(() => {})

  useEffect(() => {
    pollWA()
    pollQueue()
    pollWHLog()
    waPollerRef.current    = setInterval(pollWA,    2000)
    queuePollerRef.current = setInterval(pollQueue, 4000)
    whLogPollerRef.current = setInterval(pollWHLog, 3000)
    return () => {
      clearInterval(waPollerRef.current)
      clearInterval(queuePollerRef.current)
      clearInterval(whLogPollerRef.current)
    }
  }, [])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    Promise.all([settingsAPI.get(), isAdmin ? databaseAPI.getConfig() : Promise.resolve(null)])
      .then(([data, dbData]) => {
        setForm({
          companyName:        data.companyName        || '',
          companyAddress:     data.companyAddress     || '',
          companyPhone:       data.companyPhone       || '',
          companyEmail:       data.companyEmail       || '',
          companyNpwp:        data.companyNpwp        || '',
          timezone:           data.timezone           || 'Asia/Jakarta',
          readDate:           data.readDate           || '1',
          dueDays:            data.dueDays            || '20',
          lateFee:            data.lateFee            || '2',
          adminFee:           data.adminFee           || '5000',
          ppjEnabled:         data.ppjEnabled         ?? 'true',
          ppjRate:            data.ppjRate            || '10',
          waEnabled:          data.waEnabled          ?? 'false',
          waMode:             data.waMode             || 'baileys',
          fonnteToken:        data.fonnteToken        || '',
          waTemplateReading:       data.waTemplateReading       || '',
          waTemplatePayment:       data.waTemplatePayment       || '',
          waTemplateInstallPending: data.waTemplateInstallPending || '',
          waTemplateInstallInvoice: data.waTemplateInstallInvoice || '',
          waTemplateInstallPaid:    data.waTemplateInstallPaid    || '',
          waTemplateInstallDone:    data.waTemplateInstallDone    || '',
          installFee:               data.installFee               || '500000',
          installAdminFee:          data.installAdminFee          || '50000',
          thermalPaperWidth:        data.thermalPaperWidth        || '58',
          paymentMethod:            data.paymentMethod            || 'none',
          paymentBankName:          data.paymentBankName          || '',
          paymentAccountNumber:     data.paymentAccountNumber     || '',
          paymentAccountName:       data.paymentAccountName       || '',
          paymentQrCode:            data.paymentQrCode            || '',
        })
        if (dbData) {
          setDbRuntime(dbData.runtime)
          setDbForm(dbData.config || emptyDbForm)
        }
      })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  const f  = (key) => ({
    value: form[key] ?? '',
    onChange: e => setForm(p => ({ ...p, [key]: e.target.value })),
    readOnly: !isAdmin,
  })

  const fi = (key) => ({
    type: 'number',
    value: form[key] ?? '',
    onChange: e => setForm(p => ({ ...p, [key]: e.target.value })),
    readOnly: !isAdmin,
  })

  const save = async (section, keys) => {
    if (!isAdmin) return
    setSaving(section)
    try {
      const payload = {}
      keys.forEach(k => { payload[k] = form[k] })
      await settingsAPI.update(payload)
      showToast('Pengaturan ' + section + ' berhasil disimpan!')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(null)
    }
  }

  const activeDbEngine = dbForm.activeEngine || 'sqlite'
  const activeProfile = dbForm.profiles?.[activeDbEngine] || emptyDbForm.profiles[activeDbEngine]

  const updateDbProfile = (engine, key, value) => {
    setDbForm(prev => ({
      ...prev,
      profiles: {
        ...prev.profiles,
        [engine]: {
          ...prev.profiles[engine],
          [key]: value,
        },
      },
    }))
  }

  const saveDbConfig = async () => {
    if (!isAdmin) return
    setDbAction('save-db')
    try {
      const result = await databaseAPI.saveConfig(dbForm)
      setDbForm(result.config)
      showToast('Konfigurasi database berhasil disimpan')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setDbAction(null)
    }
  }

  const testDbConnection = async () => {
    if (!isAdmin) return
    setDbAction('test-db')
    try {
      await databaseAPI.test(activeProfile)
      showToast(`Koneksi ${activeDbEngine} berhasil`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setDbAction(null)
    }
  }

  const runMigration = async () => {
    if (!isAdmin) return
    if (migSource === migTarget) {
      showToast('Sumber dan tujuan migrasi tidak boleh sama', 'error')
      return
    }
    setMigConfirm(false)
    setDbAction('migrate-db')
    setMigrationResult(null)
    try {
      const result = await databaseAPI.migrate({ from: migSource, to: migTarget, resetTarget: !migAppend })
      setMigrationResult(result.result)
      showToast(result.message || 'Migrasi database selesai')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setDbAction(null)
    }
  }

  const handleWAConnect = async () => {
    setWaConnecting(true)
    try {
      await waAPI.connect()
      showToast('Menghubungkan WhatsApp, tunggu QR code muncul...')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setWaConnecting(false)
    }
  }

  const handleWADisconnect = async () => {
    setWaConnecting(true)
    try {
      await waAPI.disconnect()
      setWaStatus({ status: 'disconnected', qr: null, phone: null })
      showToast('WhatsApp berhasil diputus')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setWaConnecting(false)
    }
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat pengaturan...</div>
  )

  const waInfo = WA_STATUS_LABEL[waStatus.status] || WA_STATUS_LABEL.disconnected

  return (
    <div>
      {/* Admin-only notice */}
      {!isAdmin && (
        <div style={{
          background: 'var(--warning-bg)', border: '1px solid var(--warning)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#b85c00',
        }}>
          🔒 Anda login sebagai <b>{user?.role}</b>. Pengaturan hanya bisa diubah oleh <b>admin</b>.
        </div>
      )}

      <div className="grid-2">
        {/* Company */}
        <Card>
          <div className="card-title" style={{ marginBottom: 16 }}>🏢 Informasi Perusahaan</div>
          <FormInput label="Nama PDAM / Perusahaan" {...f('companyName')} />
          <FormInput label="Alamat Lengkap" {...f('companyAddress')} />
          <div className="form-grid">
            <FormInput label="Telepon" {...f('companyPhone')} />
            <FormInput label="Email" type="email" {...f('companyEmail')} />
          </div>
          <FormInput label="NPWP" {...f('companyNpwp')} placeholder="XX.XXX.XXX.X-XXX.XXX" />
          <FormSelect
            label="Zona Waktu"
            value={form.timezone || 'Asia/Jakarta'}
            onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}
            disabled={!isAdmin}
            hint="Mempengaruhi tanggal/jam di notifikasi WhatsApp dan laporan server"
          >
            <option value="Asia/Jakarta">WIB – Waktu Indonesia Barat (UTC+7)</option>
            <option value="Asia/Makassar">WITA – Waktu Indonesia Tengah (UTC+8)</option>
            <option value="Asia/Jayapura">WIT – Waktu Indonesia Timur (UTC+9)</option>
            <option value="Asia/Singapore">Singapura / Malaysia (UTC+8)</option>
            <option value="UTC">UTC (UTC+0)</option>
          </FormSelect>
          {isAdmin && (
            <Button
              variant="primary"
              onClick={() => save('perusahaan', ['companyName','companyAddress','companyPhone','companyEmail','companyNpwp','timezone'])}
              disabled={saving === 'perusahaan'}
            >
              {saving === 'perusahaan' ? 'Menyimpan...' : 'Simpan'}
            </Button>
          )}
        </Card>

        {/* Billing Config */}
        <Card>
          <div className="card-title" style={{ marginBottom: 16 }}>🧾 Konfigurasi Tagihan</div>
          <div className="form-grid">
            <FormInput label="Tanggal Baca Meteran" {...fi('readDate')} hint="Tanggal dalam sebulan (1–28)" />
            <FormInput label="Jatuh Tempo (hari)" {...fi('dueDays')} hint="Hari setelah tanggal baca" />
          </div>
          <div className="form-grid">
            <FormInput label="Denda Keterlambatan (%)" {...fi('lateFee')} hint="Per bulan keterlambatan" />
            <FormInput label="PPJ Rate (%)" {...fi('ppjRate')} hint="Pajak Penerangan Jalan" />
          </div>
          <FormInput label="Biaya Admin Tetap (Rp)" type="number" {...fi('adminFee')} addon="Rp" hint="Biaya abodemen per bulan" />
          {isAdmin && (
            <Button
              variant="primary"
              onClick={() => save('tagihan', ['readDate','dueDays','lateFee','adminFee','ppjEnabled','ppjRate'])}
              disabled={saving === 'tagihan'}
            >
              {saving === 'tagihan' ? 'Menyimpan...' : 'Simpan'}
            </Button>
          )}
        </Card>
      </div>

      {/* ── Pasang Baru + Printer Thermal ── */}
      <Card>
        <div className="card-title" style={{ marginBottom: 16 }}>🔧 Biaya Pasang Baru</div>
        <div className="form-grid">
          <FormInput label="Biaya Pemasangan (Rp)" type="number" addon="Rp" {...fi('installFee')} hint="Default biaya saat buat invoice" />
          <FormInput label="Biaya Admin (Rp)" type="number" addon="Rp" {...fi('installAdminFee')} hint="Biaya administrasi pendaftaran" />
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--ocean-pale)', borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
          Total default: <b style={{ color: 'var(--ocean)' }}>
            Rp {(Number(form.installFee || 0) + Number(form.installAdminFee || 0)).toLocaleString('id-ID')}
          </b>
        </div>
        {isAdmin && (
          <Button variant="primary"
            onClick={() => save('pasang baru', ['installFee','installAdminFee'])}
            disabled={saving === 'pasang baru'}>
            {saving === 'pasang baru' ? 'Menyimpan...' : 'Simpan'}
          </Button>
        )}
      </Card>

      {/* ── Printer Thermal ── */}
      <Card>
        <div className="card-title" style={{ marginBottom: 4 }}>🖨️ Printer Thermal</div>
        <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 16 }}>
          Pengaturan untuk cetak struk tagihan ke printer Bluetooth portabel.
          Pasangkan printer ke HP via Bluetooth di pengaturan HP terlebih dahulu.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label className="form-label" style={{ marginBottom: 6 }}>Lebar Kertas Thermal</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { val: '58', label: '58mm', desc: '~32 karakter/baris' },
                { val: '80', label: '80mm', desc: '~42 karakter/baris' },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => isAdmin && setForm(f => ({ ...f, thermalPaperWidth: opt.val }))}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 10,
                    border: '2px solid',
                    borderColor: form.thermalPaperWidth === opt.val ? 'var(--ocean)' : 'var(--border)',
                    background: form.thermalPaperWidth === opt.val ? 'var(--ocean-pale)' : 'var(--surface-2)',
                    cursor: isAdmin ? 'pointer' : 'default',
                    textAlign: 'center',
                    minWidth: 90,
                  }}
                >
                  <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 15, color: form.thermalPaperWidth === opt.val ? 'var(--ocean)' : 'var(--text)' }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', background: 'var(--bg-alt)', borderRadius: 8, padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre', lineHeight: 1.4 }}>
              {form.thermalPaperWidth === '80'
                ? '==========================================\n    NAMA PERUSAHAAN (80mm)\n==========================================\nNo.Invoice    INV-2026-0001\nTOTAL         Rp 75.000\n=========================================='
                : '================================\n   NAMA PERUSAHAAN (58mm)\n================================\nNo.Invoice   INV-2026-0001\nTOTAL        Rp 75.000\n================================'}
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            style={{ marginTop: 14 }}
            onClick={() => save('printer', ['thermalPaperWidth'])}
            disabled={saving === 'printer'}
          >
            {saving === 'printer' ? 'Menyimpan...' : 'Simpan'}
          </Button>
        )}
      </Card>

      {/* ── Metode Pembayaran ── */}
      <Card style={{ gridColumn: '1/-1' }}>
        <div className="card-title" style={{ marginBottom: 4 }}>💳 Metode Pembayaran</div>
        <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 16 }}>
          Info pembayaran yang dikirim otomatis via WhatsApp bersama tagihan. Rekening tampil sebagai teks;
          QR Code dikirim sebagai gambar terpisah.
        </div>

        {/* Pilihan metode */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { val: 'none',   icon: '🚫', label: 'Tidak Ada',       desc: 'Tidak dikirim ke pelanggan' },
            { val: 'bank',   icon: '🏦', label: 'Rekening Bank',   desc: 'Info rekening sebagai teks WA' },
            { val: 'qrcode', icon: '📷', label: 'QR Code',         desc: 'Gambar QR dikirim via WA' },
            { val: 'both',   icon: '✅', label: 'Keduanya',        desc: 'Rekening teks + gambar QR' },
          ].map(opt => (
            <button
              key={opt.val}
              onClick={() => isAdmin && setForm(p => ({ ...p, paymentMethod: opt.val }))}
              style={{
                padding: '10px 16px', borderRadius: 10, textAlign: 'left',
                border: '2px solid',
                borderColor: form.paymentMethod === opt.val ? 'var(--ocean)' : 'var(--border)',
                background: form.paymentMethod === opt.val ? 'var(--ocean-pale)' : 'var(--surface-2)',
                cursor: isAdmin ? 'pointer' : 'default', minWidth: 130,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: form.paymentMethod === opt.val ? 'var(--ocean)' : 'var(--text)' }}>
                {opt.icon} {opt.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>

        <div className="grid-2" style={{ gap: 16 }}>
          {/* Rekening Bank */}
          {(form.paymentMethod === 'bank' || form.paymentMethod === 'both') && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>🏦 Detail Rekening Bank</div>
              <div className="form-group">
                <label className="form-label">Nama Bank</label>
                <input className="form-input" placeholder="cth: BRI, BNI, Mandiri, BSI" {...f('paymentBankName')} />
              </div>
              <div className="form-group">
                <label className="form-label">Nomor Rekening</label>
                <input className="form-input mono" placeholder="cth: 1234-5678-9012" {...f('paymentAccountNumber')} />
              </div>
              <div className="form-group">
                <label className="form-label">Atas Nama</label>
                <input className="form-input" placeholder="Nama pemilik rekening" {...f('paymentAccountName')} />
              </div>
              {/* Preview teks WA */}
              {(form.paymentBankName || form.paymentAccountNumber) && (
                <div style={{ background: 'var(--bg-alt)', borderRadius: 8, padding: '10px 12px', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text-sec)', marginTop: 4 }}>
                  {'💳 *Metode Pembayaran:*\n'}
                  {form.paymentBankName      ? `Bank: ${form.paymentBankName}\n`          : ''}
                  {form.paymentAccountNumber ? `No. Rek: ${form.paymentAccountNumber}\n`  : ''}
                  {form.paymentAccountName   ? `a.n. ${form.paymentAccountName}`          : ''}
                </div>
              )}
            </div>
          )}

          {/* QR Code */}
          {(form.paymentMethod === 'qrcode' || form.paymentMethod === 'both') && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>📷 Gambar QR Code</div>
              {form.paymentQrCode ? (
                <div style={{ marginBottom: 12 }}>
                  <img
                    src={form.paymentQrCode}
                    alt="QR Code Pembayaran"
                    style={{ width: 160, height: 160, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--border)', display: 'block' }}
                  />
                  {isAdmin && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 8, color: 'var(--danger)', fontSize: 11 }}
                      onClick={() => setForm(p => ({ ...p, paymentQrCode: '' }))}
                    >
                      ✕ Hapus QR
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ width: 160, height: 160, borderRadius: 10, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, background: 'var(--bg-alt)', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 28 }}>📷</span>
                  <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>Belum ada QR</span>
                </div>
              )}
              {isAdmin && (
                <label style={{ cursor: 'pointer' }}>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files[0]
                      e.target.value = ''
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => setForm(p => ({ ...p, paymentQrCode: ev.target.result }))
                      reader.readAsDataURL(file)
                    }}
                  />
                  <span className="btn btn-ghost btn-sm">📁 Upload Gambar QR</span>
                </label>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 8 }}>
                Format: JPG/PNG. Gambar akan dikirim sebagai pesan WhatsApp terpisah.
              </div>
            </div>
          )}
        </div>

        {/* Hint variabel template */}
        {form.paymentMethod !== 'none' && (
          <div style={{ background: 'var(--ocean-pale)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--ocean)', marginTop: 16 }}>
            💡 Tambahkan <b>{'{metode_pembayaran}'}</b> ke template pesan WhatsApp baca meter / tagihan agar info pembayaran muncul di pesan.
          </div>
        )}

        {isAdmin && (
          <Button
            variant="primary"
            style={{ marginTop: 16 }}
            onClick={() => save('pembayaran', ['paymentMethod','paymentBankName','paymentAccountNumber','paymentAccountName','paymentQrCode'])}
            disabled={saving === 'pembayaran'}
          >
            {saving === 'pembayaran' ? 'Menyimpan...' : 'Simpan'}
          </Button>
        )}
      </Card>

      {/* ── WhatsApp Notification ── */}
      <Card style={{ marginTop: 0 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>📲 Notifikasi WhatsApp</div>

        {/* Provider selector */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { val: 'baileys', icon: '📱', label: 'Baileys (QR Scan)', desc: 'Scan QR dari HP langsung — tanpa biaya' },
              { val: 'fonnte',  icon: '🌐', label: 'Fonnte API',        desc: 'API token dari fonnte.com' },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => setForm(f => ({ ...f, waMode: opt.val }))}
                style={{
                  padding: '12px 16px', flex: 1, borderRadius: 10, textAlign: 'left',
                  border: '2px solid',
                  borderColor: form.waMode === opt.val ? 'var(--ocean)' : 'var(--border)',
                  background: form.waMode === opt.val ? 'var(--ocean-pale)' : 'var(--surface-2)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: form.waMode === opt.val ? 'var(--ocean)' : 'var(--text)' }}>
                  {opt.icon} {opt.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 3 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        )}

        {/* Fonnte token input */}
        {form.waMode === 'fonnte' && (
          <div style={{ marginBottom: 16, padding: '14px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🌐 Konfigurasi Fonnte</div>

            {/* Token input */}
            <label className="form-label" style={{ marginBottom: 4 }}>Token API Fonnte</label>
            <div style={{ position: 'relative', marginBottom: 4 }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={form.fonnteToken || ''}
                onChange={e => setForm(p => ({ ...p, fonnteToken: e.target.value }))}
                readOnly={!isAdmin}
                placeholder="Paste token dari dashboard fonnte.com"
                style={{
                  width: '100%', padding: '9px 40px 9px 12px', borderRadius: 8,
                  border: '1.5px solid var(--border)', fontSize: 13,
                  background: isAdmin ? 'var(--surface)' : 'var(--bg)',
                  color: 'var(--text)', boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowToken(p => !p)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-sec)',
                }}
              >
                {showToken ? '🙈' : '👁️'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 14 }}>
              Dapatkan token di fonnte.com → Settings → Token
            </div>

            {/* Webhook URL */}
            <label className="form-label" style={{ marginBottom: 4 }}>URL Webhook (untuk bot pesan masuk)</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <input
                readOnly
                value={`${window.location.origin}/webhook/fonnte`}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8,
                  border: '1.5px solid var(--border)', fontSize: 12,
                  background: 'var(--bg)', color: 'var(--text-sec)',
                  fontFamily: 'monospace', boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/webhook/fonnte`)
                    .then(() => showToast('URL webhook disalin'))
                    .catch(() => {})
                }}
                style={{
                  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface-2)', cursor: 'pointer', fontSize: 12, color: 'var(--text)',
                  whiteSpace: 'nowrap',
                }}
              >
                📋 Salin
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 12 }}>
              Daftarkan URL ini di dashboard Fonnte → Settings → Webhook URL
            </div>

            {isAdmin && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={fonnteLoading || !form.fonnteToken}
                  onClick={async () => {
                    setFonnteLoading(true)
                    try {
                      const result = await waAPI.testFonnte(form.fonnteToken)
                      if (result.ok) {
                        showToast(`Fonnte terhubung${result.device ? ': ' + result.device : ''}`)
                      } else {
                        showToast(result.message || 'Token tidak valid', 'error')
                      }
                    } catch (e) {
                      showToast(e.message, 'error')
                    } finally {
                      setFonnteLoading(false)
                    }
                  }}
                >
                  {fonnteLoading ? 'Memeriksa...' : '🔌 Test Token'}
                </Button>
                <Button variant="ghost" size="sm" onClick={pollWHLog}>🔄 Refresh Log</Button>
              </div>
            )}

            {/* ── Test Webhook ── */}
            {isAdmin && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🧪 Simulasi Webhook Masuk</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label className="form-label" style={{ marginBottom: 3 }}>Nomor HP (sender)</label>
                    <input
                      value={webhookPhone}
                      onChange={e => setWebhookPhone(e.target.value)}
                      placeholder="628xxxxxxxxxx"
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', width: 160 }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label className="form-label" style={{ marginBottom: 3 }}>Pesan</label>
                    <input
                      value={webhookMsg}
                      onChange={e => setWebhookMsg(e.target.value)}
                      placeholder="bantuan"
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <Button
                    variant="primary" size="sm"
                    disabled={testWHLoading || !webhookPhone || !webhookMsg}
                    onClick={async () => {
                      setTestWHLoading(true)
                      try {
                        await waAPI.testWebhook(webhookPhone, webhookMsg)
                        showToast('Simulasi webhook dikirim — lihat log di bawah')
                        setTimeout(pollWHLog, 500)
                      } catch (e) {
                        showToast(e.message, 'error')
                      } finally {
                        setTestWHLoading(false)
                      }
                    }}
                  >
                    {testWHLoading ? 'Mengirim...' : '▶ Kirim Test'}
                  </Button>
                </div>
              </div>
            )}

            {/* ── Webhook Log ── */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📋 Log Webhook ({webhookLog.length})</span>
                <span style={{ fontSize: 10, color: 'var(--text-hint)', fontWeight: 400 }}>auto-refresh 3 detik</span>
              </div>
              {webhookLog.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-hint)', padding: '10px 0', textAlign: 'center' }}>
                  Belum ada aktivitas webhook
                </div>
              ) : (
                <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {webhookLog.map(entry => {
                    const isOk    = entry.status === 'ok'
                    const isError = entry.status === 'error'
                    return (
                      <div key={entry.id} style={{
                        padding: '7px 10px', borderRadius: 8, fontSize: 11,
                        background: isOk ? 'var(--success-bg, #f0fdf4)' : isError ? 'var(--danger-bg, #fff0f0)' : 'var(--bg)',
                        border: `1px solid ${isOk ? 'var(--mint)' : isError ? 'var(--danger)' : 'var(--border)'}`,
                      }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontWeight: 700, color: isOk ? 'var(--mint)' : isError ? 'var(--danger)' : 'var(--warning)' }}>
                            {isOk ? '✅ OK' : isError ? '❌ ERROR' : '⚠️ SKIP'}
                          </span>
                          <span style={{ color: 'var(--text-hint)' }}>
                            {new Date(entry.time).toLocaleTimeString('id-ID')}
                          </span>
                          {entry.sender && <span style={{ fontFamily: 'monospace', color: 'var(--ocean)' }}>{entry.sender}</span>}
                        </div>
                        {entry.message && (
                          <div style={{ color: 'var(--text-sec)', marginBottom: entry.reason || entry.botError ? 2 : 0 }}>
                            💬 "{entry.message}"
                          </div>
                        )}
                        {(entry.reason || entry.botError) && (
                          <div style={{ color: isOk ? 'var(--text-hint)' : 'var(--danger)', fontStyle: 'italic' }}>
                            {entry.reason || entry.botError}
                          </div>
                        )}
                        {entry.raw && !entry.sender && (
                          <div style={{ color: 'var(--text-hint)', fontFamily: 'monospace', fontSize: 10, marginTop: 2, wordBreak: 'break-all' }}>
                            {entry.raw.substring(0, 120)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          borderRadius: 10, background: 'var(--bg)', marginBottom: 18, flexWrap: 'wrap',
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: waInfo.color, display: 'inline-block',
            boxShadow: waStatus.status === 'connected' ? `0 0 0 3px ${waInfo.color}33` : 'none',
          }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{waInfo.text}</span>
          {waStatus.status === 'connected' && waStatus.waMode === 'fonnte' && (
            <span style={{ fontSize: 11, color: 'var(--ocean)', fontWeight: 600 }}>via Fonnte API</span>
          )}
          {waStatus.phone && (
            <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>
              {waStatus.waMode === 'fonnte' ? waStatus.phone : `+${waStatus.phone}`}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {isAdmin && waStatus.status === 'connected' && (
            <Button variant="danger" size="sm" onClick={handleWADisconnect} disabled={waConnecting}>
              {waConnecting ? 'Memutus...' : '🔌 Putuskan'}
            </Button>
          )}
          {isAdmin && waStatus.status === 'disconnected' && form.waMode === 'fonnte' && (
            <Button variant="primary" size="sm" onClick={handleWAConnect} disabled={waConnecting || !form.fonnteToken}>
              {waConnecting ? 'Memeriksa...' : '🔌 Verifikasi Token'}
            </Button>
          )}
          {isAdmin && waStatus.status === 'disconnected' && form.waMode !== 'fonnte' && (
            <Button variant="primary" size="sm" onClick={handleWAConnect} disabled={waConnecting}>
              {waConnecting ? 'Menghubungkan...' : '📱 Hubungkan'}
            </Button>
          )}
          {isAdmin && (waStatus.status === 'connecting' || waStatus.status === 'qr') && (
            <Button variant="ghost" size="sm" onClick={handleWADisconnect} disabled={waConnecting}>
              Batal
            </Button>
          )}
        </div>

        {/* Connecting spinner — Baileys only */}
        {waStatus.status === 'connecting' && form.waMode !== 'fonnte' && (
          <div style={{ textAlign: 'center', padding: '24px 0', marginBottom: 18 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>Memulai koneksi, QR code akan muncul sebentar lagi...</div>
          </div>
        )}

        {/* QR Code — Baileys only */}
        {waStatus.status === 'qr' && form.waMode !== 'fonnte' && (
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 12 }}>
              Buka <b>WhatsApp</b> → <b>Perangkat Tertaut</b> → <b>Tautkan Perangkat</b>, lalu scan QR ini:
            </div>
            {waStatus.qr ? (
              <img
                src={waStatus.qr}
                alt="WhatsApp QR Code"
                style={{ width: 240, height: 240, borderRadius: 12, border: '4px solid var(--ocean)' }}
              />
            ) : (
              <div style={{ width: 240, height: 240, margin: '0 auto', borderRadius: 12, border: '4px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-hint)' }}>
                Generating QR...
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 8 }}>
              Auto-refresh tiap 2 detik · QR kadaluarsa ±20 detik
            </div>
            <div style={{ marginTop: 10 }}>
              <Button variant="ghost" size="sm" onClick={pollWA}>🔄 Refresh Manual</Button>
            </div>
          </div>
        )}

        {/* Enable toggle */}
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.waEnabled === 'true'}
                onChange={e => setForm(p => ({ ...p, waEnabled: e.target.checked ? 'true' : 'false' }))}
                style={{ width: 16, height: 16, accentColor: 'var(--ocean)' }}
              />
              <span>Aktifkan notifikasi WhatsApp otomatis</span>
            </label>
          </div>
        )}

        {/* Templates */}
        <div className="grid-2">
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-sec)' }}>
              Template Pembacaan Meteran
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 6 }}>
              Variabel: {'{nama}'} {'{nomor_meter}'} {'{tanggal_baca}'} {'{bulan}'} {'{meter_awal}'} {'{meter_akhir}'} {'{pemakaian}'} {'{tagihan}'} {'{jatuh_tempo}'} {'{nama_perusahaan}'}
            </div>
            <textarea
              value={form.waTemplateReading || ''}
              onChange={e => setForm(p => ({ ...p, waTemplateReading: e.target.value }))}
              readOnly={!isAdmin}
              rows={8}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1.5px solid var(--border)', fontSize: 12, fontFamily: 'monospace',
                background: isAdmin ? 'var(--surface)' : 'var(--bg)', resize: 'vertical',
                color: 'var(--text)', lineHeight: 1.6, boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-sec)' }}>
              Template Pelunasan Tagihan
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 6 }}>
              Variabel: {'{nama}'} {'{nomor_meter}'} {'{invoice}'} {'{bulan}'} {'{jumlah}'} {'{tgl_bayar}'} {'{nama_perusahaan}'}
            </div>
            <textarea
              value={form.waTemplatePayment || ''}
              onChange={e => setForm(p => ({ ...p, waTemplatePayment: e.target.value }))}
              readOnly={!isAdmin}
              rows={8}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1.5px solid var(--border)', fontSize: 12, fontFamily: 'monospace',
                background: isAdmin ? 'var(--surface)' : 'var(--bg)', resize: 'vertical',
                color: 'var(--text)', lineHeight: 1.6, boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Template Pasang Baru */}
        {isAdmin && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Template Notifikasi Pasang Baru</div>
            <div className="grid-2">
              {[
                { key: 'waTemplateInstallPending', label: 'Saat Pendaftaran Masuk',   vars: '{nama} {no_daftar} {tanggal} {nama_perusahaan}' },
                { key: 'waTemplateInstallInvoice', label: 'Saat Invoice Diterbitkan', vars: '{nama} {invoice} {biaya_pasang} {biaya_admin} {total} {nama_perusahaan}' },
                { key: 'waTemplateInstallPaid',    label: 'Saat Pembayaran Lunas',    vars: '{nama} {invoice} {total} {tgl_bayar} {nama_perusahaan}' },
                { key: 'waTemplateInstallDone',    label: 'Saat Terpasang (jadi pelanggan)', vars: '{nama} {meter} {tgl_pasang} {nama_perusahaan}' },
              ].map(({ key, label, vars }) => (
                <div key={key}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-sec)' }}>{label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 5 }}>Variabel: {vars}</div>
                  <textarea
                    value={form[key] || ''}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    readOnly={!isAdmin}
                    rows={6}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 11, fontFamily: 'monospace', background: 'var(--surface)', color: 'var(--text)', lineHeight: 1.6, boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {isAdmin && (
          <div style={{ marginTop: 14 }}>
            <Button
              variant="primary"
              onClick={() => save('WhatsApp', ['waEnabled','waMode','fonnteToken','waTemplateReading','waTemplatePayment','waTemplateInstallPending','waTemplateInstallInvoice','waTemplateInstallPaid','waTemplateInstallDone'])}
              disabled={saving === 'WhatsApp'}
            >
              {saving === 'WhatsApp' ? 'Menyimpan...' : 'Simpan Pengaturan WA'}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Antrian Pesan WhatsApp ── */}
      <Card style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>📬 Antrian Pesan WhatsApp</div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
              {waStatus.queueStats
                ? `${waStatus.queueStats.pending} menunggu · ${waStatus.queueStats.sending} proses · ${waStatus.queueStats.sent} terkirim · ${waStatus.queueStats.failed} gagal`
                : 'Memuat...'
              }
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdmin && waQueue.some(q => q.status === 'failed') && (
              <Button variant="ghost" size="sm" onClick={async () => { await waAPI.retryFailed(); pollQueue() }}>↺ Coba Ulang</Button>
            )}
            {isAdmin && waQueue.some(q => q.status === 'sent' || q.status === 'failed') && (
              <Button variant="ghost" size="sm" onClick={async () => { await waAPI.clearDone(); pollQueue() }}>🗑 Bersihkan</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowQueue(p => !p)}>
              {showQueue ? 'Sembunyikan' : 'Tampilkan'} ({waQueue.length})
            </Button>
          </div>
        </div>

        {showQueue && (
          waQueue.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-hint)', fontSize: 13, padding: '16px 0' }}>Antrian kosong</div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {waQueue.map(q => {
                const statusMap = {
                  pending: { label: 'Menunggu', color: 'var(--warning)',  bg: 'var(--warning-bg)'  },
                  sending: { label: 'Mengirim', color: 'var(--ocean)',    bg: 'var(--ocean-pale)'  },
                  sent:    { label: 'Terkirim', color: 'var(--mint)',     bg: 'var(--success-bg)'  },
                  failed:  { label: 'Gagal',    color: 'var(--danger)',   bg: 'var(--danger-bg)'   },
                }
                const s = statusMap[q.status] || statusMap.pending
                return (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap', marginTop: 1 }}>
                      {s.label}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
                        {q.phone}
                        {q.sentAt && ` · ${new Date(q.sentAt).toLocaleTimeString('id-ID')}`}
                        {!q.sentAt && q.addedAt && ` · ditambah ${new Date(q.addedAt).toLocaleTimeString('id-ID')}`}
                      </div>
                      {q.error && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{q.error}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </Card>

      <Card>
        <div className="card-title" style={{ marginBottom: 16 }}>🗄️ Database & Migrasi</div>
        <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 16 }}>
          Simpan beberapa profil database untuk SQLite, MySQL, dan PostgreSQL. Tool migrasi dapat menyalin seluruh data aplikasi antar engine mana pun.
        </div>

        {dbRuntime && (
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Runtime saat ini: {dbRuntime.engine?.toUpperCase()}</div>
            <div style={{ color: 'var(--text-sec)' }}>{dbRuntime.note}</div>
            {dbRuntime.sqlitePath && (
              <div style={{ color: 'var(--text-hint)', marginTop: 4 }}>File SQLite: {dbRuntime.sqlitePath}</div>
            )}
          </div>
        )}

        <div className="form-grid">
          <FormSelect
            label="Engine Target Aktif"
            value={activeDbEngine}
            onChange={e => setDbForm(prev => ({ ...prev, activeEngine: e.target.value }))}
            disabled={!isAdmin}
            hint="Dipakai sebagai profil utama untuk uji koneksi dan target migrasi."
          >
            {DB_ENGINES.map(engine => (
              <option key={engine.value} value={engine.value}>{engine.label}</option>
            ))}
          </FormSelect>
          {activeDbEngine === 'sqlite' ? (
            <FormInput
              label="Path File SQLite"
              value={activeProfile.filename || ''}
              onChange={e => updateDbProfile('sqlite', 'filename', e.target.value)}
              readOnly={!isAdmin}
              placeholder="server/aquameter.db"
              hint="Gunakan path absolut atau relatif ke folder proyek."
            />
          ) : (
            <FormInput
              label="Nama Database"
              value={activeProfile.database || ''}
              onChange={e => updateDbProfile(activeDbEngine, 'database', e.target.value)}
              readOnly={!isAdmin}
              placeholder="aquameter"
            />
          )}
        </div>

        {activeDbEngine !== 'sqlite' && (
          <>
            <div className="form-grid">
              <FormInput
                label="Host"
                value={activeProfile.host || ''}
                onChange={e => updateDbProfile(activeDbEngine, 'host', e.target.value)}
                readOnly={!isAdmin}
                placeholder="127.0.0.1"
              />
              <FormInput
                label="Port"
                type="number"
                value={activeProfile.port || ''}
                onChange={e => updateDbProfile(activeDbEngine, 'port', e.target.value)}
                readOnly={!isAdmin}
              />
            </div>
            <div className="form-grid">
              <FormInput
                label="Username"
                value={activeProfile.user || ''}
                onChange={e => updateDbProfile(activeDbEngine, 'user', e.target.value)}
                readOnly={!isAdmin}
              />
              <FormInput
                label="Password"
                type="password"
                value={activeProfile.password || ''}
                onChange={e => updateDbProfile(activeDbEngine, 'password', e.target.value)}
                readOnly={!isAdmin}
                hint="Biarkan tetap ter-mask jika tidak ingin mengganti password tersimpan."
              />
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13, cursor: isAdmin ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                checked={Boolean(activeProfile.ssl)}
                onChange={e => updateDbProfile(activeDbEngine, 'ssl', e.target.checked)}
                disabled={!isAdmin}
                style={{ width: 16, height: 16, accentColor: 'var(--ocean)' }}
              />
              <span>Gunakan koneksi SSL</span>
            </label>
          </>
        )}

        {isAdmin && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <Button variant="secondary" onClick={testDbConnection} disabled={!!dbAction}>
                {dbAction === 'test-db' ? 'Menguji koneksi...' : 'Test Koneksi'}
              </Button>
              <Button variant="primary" onClick={saveDbConfig} disabled={!!dbAction}>
                {dbAction === 'save-db' ? 'Menyimpan...' : 'Simpan Profil Database'}
              </Button>
            </div>

            {/* ── Migrasi Antar Database ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Migrasi Antar Database</div>
              <div className="form-grid" style={{ marginBottom: 12 }}>
                <FormSelect
                  label="Sumber (From)"
                  value={migSource}
                  onChange={e => { setMigSource(e.target.value); setMigConfirm(false); setMigrationResult(null) }}
                >
                  {DB_ENGINES.map(eng => (
                    <option key={eng.value} value={eng.value}>{eng.label}</option>
                  ))}
                </FormSelect>
                <FormSelect
                  label="Tujuan (To)"
                  value={migTarget}
                  onChange={e => { setMigTarget(e.target.value); setMigConfirm(false); setMigrationResult(null) }}
                >
                  {DB_ENGINES.map(eng => (
                    <option key={eng.value} value={eng.value}>{eng.label}</option>
                  ))}
                </FormSelect>
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={migAppend}
                  onChange={e => setMigAppend(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--ocean)' }}
                />
                <span>Mode Tambah — tidak hapus data di tujuan sebelum migrasi</span>
              </label>

              {migSource === migTarget ? (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>
                  ⚠️ Sumber dan tujuan tidak boleh sama.
                </div>
              ) : !migConfirm ? (
                <Button
                  variant="ghost"
                  onClick={() => setMigConfirm(true)}
                  disabled={!!dbAction}
                >
                  {`Mulai Migrasi ${DB_ENGINES.find(x => x.value === migSource)?.label} → ${DB_ENGINES.find(x => x.value === migTarget)?.label}`}
                </Button>
              ) : (
                <div style={{ background: 'var(--danger-pale, #fff0f0)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--danger)' }}>
                    ⚠️ Konfirmasi Migrasi
                  </div>
                  <div style={{ marginBottom: 10, color: 'var(--text-sec)' }}>
                    Data dari <b>{DB_ENGINES.find(x => x.value === migSource)?.label}</b> akan disalin ke <b>{DB_ENGINES.find(x => x.value === migTarget)?.label}</b>.
                    {!migAppend && ' Data lama di database tujuan akan dihapus terlebih dahulu.'}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Button variant="danger" onClick={runMigration} disabled={dbAction === 'migrate-db'}>
                      {dbAction === 'migrate-db' ? 'Menjalankan migrasi...' : 'Ya, Jalankan Migrasi'}
                    </Button>
                    <Button variant="secondary" onClick={() => setMigConfirm(false)} disabled={dbAction === 'migrate-db'}>
                      Batal
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {migrationResult && (
          <div style={{ background: 'var(--ocean-pale)', borderRadius: 10, padding: '14px 16px', fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: 'var(--ocean)', marginBottom: 8 }}>
              Migrasi selesai: {migrationResult.sourceEngine} {'->'} {migrationResult.targetEngine}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              {migrationResult.stats?.map(item => (
                <div key={item.table} style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600 }}>{item.table}</div>
                  <div style={{ color: 'var(--text-sec)' }}>{item.rows} baris</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Preview konfigurasi aktif */}
      <Card>
        <div className="card-title" style={{ marginBottom: 16 }}>👁️ Preview Konfigurasi Aktif</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { label: 'Nama Perusahaan',  value: form.companyName },
            { label: 'Telepon',          value: form.companyPhone },
            { label: 'Biaya Admin',      value: 'Rp ' + Number(form.adminFee || 0).toLocaleString('id-ID') },
            { label: 'PPJ Rate',         value: (form.ppjEnabled === 'true' ? form.ppjRate + '%' : 'Nonaktif') },
            { label: 'Jatuh Tempo',      value: form.dueDays + ' hari setelah baca' },
            { label: 'Denda',            value: form.lateFee + '% / bulan' },
            { label: 'Tgl Baca',         value: 'Tgl ' + form.readDate + ' setiap bulan' },
            { label: 'Notif WA',         value: form.waEnabled === 'true' ? `✅ Aktif (${form.waMode === 'fonnte' ? 'Fonnte' : 'Baileys'})` : '❌ Nonaktif' },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{item.value || '—'}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Info Cards */}
      <div className="grid-3">
        <Card style={{ background: 'var(--ocean)', color: '#fff', border: 'none' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📱</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, marginBottom: 4 }}>PWA Ready</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Install sebagai aplikasi di perangkat melalui menu browser → "Add to Home Screen"</div>
        </Card>
        <Card>
          <div style={{ fontSize: 24, marginBottom: 8 }}>👤</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, marginBottom: 4 }}>Sesi Aktif</div>
          <div style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 8 }}>
            <b>{user?.fullName}</b><br />
            Role: <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{user?.role}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>
            {isAdmin ? '✅ Dapat mengubah semua pengaturan' : '⚠️ Hanya bisa melihat pengaturan'}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 24, marginBottom: 8 }}>ℹ️</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, marginBottom: 4 }}>Versi Aplikasi</div>
          <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>
            <b>PAMSIMAS v2.0</b><br />
            Backend: Node.js + SQLite<br />
            Frontend: React + Vite<br />
            © 2026 PDAM Integration
          </div>
        </Card>
      </div>
    </div>
  )
}
