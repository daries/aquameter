import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { settingsAPI, waAPI } from '../utils/api'
import { getUser } from '../utils/auth'
import { Card, Button, FormInput } from '../components/UI'

const WA_STATUS_LABEL = {
  disconnected: { text: 'Tidak Terhubung', color: 'var(--danger)' },
  connecting:   { text: 'Menghubungkan…',  color: '#f59e0b' },
  qr:           { text: 'Scan QR Code',    color: '#f59e0b' },
  connected:    { text: 'Terhubung',        color: 'var(--mint)' },
}

export default function Settings() {
  const { showToast } = useStore()
  const user    = getUser()
  const isAdmin = user?.role === 'admin'

  const [form,    setForm]    = useState({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(null)
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
    settingsAPI.get()
      .then(data => setForm({
        companyName:        data.companyName        || '',
        companyAddress:     data.companyAddress     || '',
        companyPhone:       data.companyPhone       || '',
        companyEmail:       data.companyEmail       || '',
        companyNpwp:        data.companyNpwp        || '',
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
      }))
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
          {isAdmin && (
            <Button
              variant="primary"
              onClick={() => save('perusahaan', ['companyName','companyAddress','companyPhone','companyEmail','companyNpwp'])}
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
              Variabel: {'{nama}'} {'{bulan}'} {'{meter_awal}'} {'{meter_akhir}'} {'{pemakaian}'} {'{tagihan}'} {'{jatuh_tempo}'} {'{nama_perusahaan}'}
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
