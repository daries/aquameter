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
  const [waStatus,     setWaStatus]     = useState({ status: 'disconnected', qr: null, phone: null })
  const [waConnecting, setWaConnecting] = useState(false)
  const waPollerRef = useRef(null)

  const pollWA = () => waAPI.status().then(setWaStatus).catch(() => {})

  useEffect(() => {
    pollWA()
    // Poll tiap 2 detik agar QR tidak ketinggalan
    waPollerRef.current = setInterval(pollWA, 2000)
    return () => clearInterval(waPollerRef.current)
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
          waTemplateReading:       data.waTemplateReading       || '',
          waTemplatePayment:       data.waTemplatePayment       || '',
          waTemplateInstallPending: data.waTemplateInstallPending || '',
          waTemplateInstallInvoice: data.waTemplateInstallInvoice || '',
          waTemplateInstallPaid:    data.waTemplateInstallPaid    || '',
          waTemplateInstallDone:    data.waTemplateInstallDone    || '',
          installFee:               data.installFee               || '500000',
          installAdminFee:          data.installAdminFee          || '50000',
          thermalPaperWidth:        data.thermalPaperWidth        || '58',
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

      {/* ── WhatsApp Notification ── */}
      <Card style={{ marginTop: 0 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>📲 Notifikasi WhatsApp</div>

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
          {waStatus.phone && (
            <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>+{waStatus.phone}</span>
          )}
          <div style={{ flex: 1 }} />
          {isAdmin && waStatus.status === 'connected' && (
            <Button variant="danger" size="sm" onClick={handleWADisconnect} disabled={waConnecting}>
              {waConnecting ? 'Memutus...' : '🔌 Putuskan'}
            </Button>
          )}
          {isAdmin && waStatus.status === 'disconnected' && (
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

        {/* Connecting spinner */}
        {waStatus.status === 'connecting' && (
          <div style={{ textAlign: 'center', padding: '24px 0', marginBottom: 18 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>Memulai koneksi, QR code akan muncul sebentar lagi...</div>
          </div>
        )}

        {/* QR Code */}
        {waStatus.status === 'qr' && (
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
              Variabel: {'{nama}'} {'{invoice}'} {'{bulan}'} {'{jumlah}'} {'{tgl_bayar}'} {'{nama_perusahaan}'}
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
              onClick={() => save('WhatsApp', ['waEnabled','waTemplateReading','waTemplatePayment','waTemplateInstallPending','waTemplateInstallInvoice','waTemplateInstallPaid','waTemplateInstallDone'])}
              disabled={saving === 'WhatsApp'}
            >
              {saving === 'WhatsApp' ? 'Menyimpan...' : 'Simpan Pengaturan WA'}
            </Button>
          </div>
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
            { label: 'Notif WA',         value: form.waEnabled === 'true' ? '✅ Aktif' : '❌ Nonaktif' },
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
