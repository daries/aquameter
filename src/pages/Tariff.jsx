import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { Card, SummaryRow, Button } from '../components/UI'
import { TARIFFS, fmtRupiah, GOLONGAN_OPTIONS } from '../utils/tariff'
import { tariffAPI, settingsAPI } from '../utils/api'

// Merge API blocks with static metadata (name, description) from tariff.js
function buildTariffs(apiData) {
  const result = {}
  for (const [grp, def] of Object.entries(TARIFFS)) {
    const apiBlocks = apiData[grp]
    result[grp] = {
      ...def,
      blocks: apiBlocks
        ? apiBlocks.map(b => ({ limit: b.limit === null ? Infinity : b.limit, price: b.price }))
        : def.blocks,
    }
  }
  return result
}

// Calculate water cost using arbitrary tariff blocks
function calcWithBlocks(blocks, usage) {
  let cost = 0, prev = 0, result = []
  for (const b of blocks) {
    if (usage <= prev) break
    const lim = (b.limit === Infinity || b.limit === null) ? usage : b.limit
    const vol = Math.min(usage - prev, lim - prev)
    if (vol > 0) { cost += vol * b.price; result.push({ vol, price: b.price, sub: vol * b.price }) }
    prev = lim
    if (b.limit === Infinity || b.limit === null) break
  }
  return { cost, blocks: result }
}

function calcFullWithBlocks(blocks, usage, adminFee = 5000, ppjRate = 10) {
  const { cost, blocks: bk } = calcWithBlocks(blocks, usage)
  const ppj = Math.round(cost * ppjRate / 100)
  return { waterCost: cost, blocks: bk, admin: adminFee, ppj, total: cost + adminFee + ppj }
}

// ─── Inline edit form for one golongan ───
function TariffEditForm({ tariff, onSave, onCancel, saving }) {
  const [prices, setPrices] = useState(() => tariff.blocks.map(b => ({ ...b })))
  const [errors, setErrors] = useState([])

  const setPrice = (i, val) => {
    setPrices(p => p.map((b, idx) => idx === i ? { ...b, price: val } : b))
    setErrors(e => e.filter(x => x !== i))
  }

  const handleSave = () => {
    const errs = []
    prices.forEach((b, i) => { if (isNaN(parseFloat(b.price)) || parseFloat(b.price) <= 0) errs.push(i) })
    if (errs.length) { setErrors(errs); return }
    onSave(prices.map(b => ({ ...b, price: parseFloat(b.price) })))
  }

  return (
    <div className="tariff-edit-form">
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ocean)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Edit Harga Tarif — {tariff.name}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {prices.map((b, i) => {
          const prevLimit = i === 0 ? 0 : prices[i - 1].limit
          const rangeLabel = (b.limit === Infinity || b.limit === null)
            ? `> ${prevLimit} m³`
            : `${prevLimit + 1}–${b.limit} m³`
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 100, fontSize: 12, color: 'var(--text-sec)', flexShrink: 0 }}>{rangeLabel}</div>
              <div className="input-group" style={{ flex: 1 }}>
                <span className="input-addon" style={{ borderRadius: '10px 0 0 10px', border: '1.5px solid var(--border)', borderRight: 'none' }}>Rp</span>
                <input
                  type="number"
                  className={`form-input mono ${errors.includes(i) ? 'error' : ''}`}
                  style={{ borderRadius: '0' }}
                  value={b.price}
                  min="1"
                  onChange={e => setPrice(i, e.target.value)}
                />
                <span className="input-addon">/m³</span>
              </div>
            </div>
          )
        })}
      </div>
      {errors.length > 0 && (
        <div className="form-hint" style={{ color: 'var(--danger)', marginTop: 6 }}>Harga harus angka positif</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Button variant="primary" onClick={handleSave} icon="💾" disabled={saving}>
          {saving ? 'Menyimpan...' : 'Simpan ke Database'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Batal</Button>
      </div>
    </div>
  )
}

// ─── Biaya config card ───
function BiayaConfig({ settings, onSave }) {
  const [adminFee,   setAdminFee]   = useState(String(settings.adminFee ?? 5000))
  const [ppjEnabled, setPpjEnabled] = useState(settings.ppjEnabled !== false && settings.ppjEnabled !== 'false')
  const [ppjRate,    setPpjRate]    = useState(String(settings.ppjRate ?? 10))
  const [errors,     setErrors]     = useState({})
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)

  // Sync when settings prop changes (after API load)
  useEffect(() => {
    setAdminFee(String(settings.adminFee ?? 5000))
    setPpjEnabled(settings.ppjEnabled !== false && settings.ppjEnabled !== 'false')
    setPpjRate(String(settings.ppjRate ?? 10))
  }, [settings.adminFee, settings.ppjEnabled, settings.ppjRate])

  const handleSave = async () => {
    const errs = {}
    const admin = parseFloat(adminFee)
    const rate  = parseFloat(ppjRate)
    if (isNaN(admin) || admin < 0) errs.adminFee = 'Harus angka ≥ 0'
    if (ppjEnabled && (isNaN(rate) || rate < 0 || rate > 100)) errs.ppjRate = 'Harus angka 0–100'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setSaving(true)
    try {
      await onSave({ adminFee: admin, ppjEnabled, ppjRate: parseFloat(rate) || 0 })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>⚙️ Konfigurasi Biaya Tambahan</div>
      <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 16 }}>Disimpan ke database dan dipakai saat input baca meter</div>

      <div className="form-group">
        <label className="form-label">Biaya Administrasi</label>
        <div className="input-group">
          <span className="input-addon">Rp</span>
          <input
            type="number" className={`form-input mono ${errors.adminFee ? 'error' : ''}`}
            value={adminFee} min="0"
            onChange={e => { setAdminFee(e.target.value); setErrors(v => ({ ...v, adminFee: undefined })) }}
          />
          <span className="input-addon">/ tagihan</span>
        </div>
        {errors.adminFee && <div className="form-hint" style={{ color: 'var(--danger)' }}>{errors.adminFee}</div>}
        <div className="form-hint">Biaya tetap per tagihan bulanan</div>
      </div>

      <div className="form-group">
        <label className="form-label">Pajak Penerangan Jalan (PPJ)</label>
        <label className="toggle-row">
          <div className={`toggle-switch ${ppjEnabled ? 'on' : ''}`} onClick={() => setPpjEnabled(v => !v)}>
            <div className="toggle-thumb" />
          </div>
          <span style={{ fontSize: 13, color: ppjEnabled ? 'var(--ocean)' : 'var(--text-hint)', fontWeight: 500 }}>
            {ppjEnabled ? 'PPJ Aktif' : 'PPJ Nonaktif'}
          </span>
        </label>
      </div>

      {ppjEnabled && (
        <div className="form-group">
          <label className="form-label">Persentase PPJ</label>
          <div className="input-group" style={{ maxWidth: 200 }}>
            <input
              type="number" className={`form-input mono ${errors.ppjRate ? 'error' : ''}`}
              value={ppjRate} min="0" max="100" step="0.5"
              onChange={e => { setPpjRate(e.target.value); setErrors(v => ({ ...v, ppjRate: undefined })) }}
            />
            <span className="input-addon">%</span>
          </div>
          {errors.ppjRate && <div className="form-hint" style={{ color: 'var(--danger)' }}>{errors.ppjRate}</div>}
          <div className="form-hint">Dihitung dari biaya pemakaian air</div>
        </div>
      )}

      <Button variant={saved ? 'secondary' : 'primary'} onClick={handleSave} icon={saved ? '✅' : '💾'} disabled={saving}>
        {saving ? 'Menyimpan...' : saved ? 'Tersimpan' : 'Simpan ke Database'}
      </Button>
    </Card>
  )
}

// ─── Main page ───
export default function Tariff() {
  const { settings, updateSettings, showToast } = useStore()

  const [apiTariffs,  setApiTariffs]  = useState(null)   // raw from API
  const [editingGrp,  setEditingGrp]  = useState(null)
  const [savingGrp,   setSavingGrp]   = useState(null)
  const [loadError,   setLoadError]   = useState(false)
  const [group,       setGroup]       = useState('R1')
  const [usage,       setUsage]       = useState(20)
  const [confirmReset, setConfirmReset] = useState(null)  // grp or 'all'

  // Load tariffs + settings from API on mount
  useEffect(() => {
    tariffAPI.getAll()
      .then(data => setApiTariffs(data))
      .catch(() => setLoadError(true))

    settingsAPI.get()
      .then(data => updateSettings(data))
      .catch(() => {})
  }, [])

  // Build full tariff objects (with name, description, blocks)
  const tariffs   = apiTariffs ? buildTariffs(apiTariffs) : TARIFFS
  const adminFee  = parseFloat(settings.adminFee) || 5000
  const ppjActive = settings.ppjEnabled !== false && settings.ppjEnabled !== 'false'
  const ppjRate   = ppjActive ? (parseFloat(settings.ppjRate) || 10) : 0

  const activeBill = calcFullWithBlocks(tariffs[group].blocks, parseInt(usage) || 0, adminFee, ppjRate)

  // Save a golongan's tariff blocks to server
  const handleSaveTariff = async (grp, blocks) => {
    setSavingGrp(grp)
    try {
      const apiBlocks = blocks.map(b => ({
        limit: b.limit === Infinity ? null : b.limit,
        price: b.price,
      }))
      const updated = await tariffAPI.update(grp, apiBlocks)
      setApiTariffs(prev => ({ ...prev, [grp]: updated }))
      setEditingGrp(null)
      showToast(`Tarif ${grp} berhasil disimpan ke database`)
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan tarif', 'error')
    } finally {
      setSavingGrp(null)
    }
  }

  // Reset one golongan to default
  const handleResetGrp = async (grp) => {
    setConfirmReset(null)
    const defaultBlocks = TARIFFS[grp].blocks.map(b => ({
      limit: b.limit === Infinity ? null : b.limit,
      price: b.price,
    }))
    setSavingGrp(grp)
    try {
      const updated = await tariffAPI.update(grp, defaultBlocks)
      setApiTariffs(prev => ({ ...prev, [grp]: updated }))
      showToast(`Tarif ${grp} dikembalikan ke default`)
    } catch (err) {
      showToast(err.message || 'Gagal reset tarif', 'error')
    } finally {
      setSavingGrp(null)
    }
  }

  // Save biaya config to server settings
  const handleBiayaSave = async (data) => {
    updateSettings(data)  // update store immediately (optimistic)
    await settingsAPI.update({
      adminFee:   String(data.adminFee),
      ppjEnabled: String(data.ppjEnabled),
      ppjRate:    String(data.ppjRate),
    })
  }

  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>
        ⚠️ Gagal memuat data tarif dari server. Pastikan server berjalan.
      </div>
    )
  }

  return (
    <div>
      {/* Confirm reset modal */}
      {confirmReset && (
        <div className="modal-overlay open" onClick={() => setConfirmReset(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">Reset Tarif {confirmReset}?</div>
            <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 20 }}>
              Harga tarif golongan <b>{confirmReset}</b> akan dikembalikan ke nilai default awal. Tindakan ini akan disimpan ke database.
            </p>
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setConfirmReset(null)}>Batal</Button>
              <Button variant="danger" onClick={() => handleResetGrp(confirmReset)}>Ya, Reset</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        {/* ─── Left: Tariff Structure ─── */}
        <div>
          <Card>
            <div className="card-header" style={{ marginBottom: 4 }}>
              <div>
                <div className="card-title">Struktur Tarif Air</div>
                <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 2 }}>
                  {apiTariffs ? '✅ Data dari database server' : '⏳ Memuat dari server...'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {Object.entries(tariffs).map(([grpKey, t]) => {
                const isEditing = editingGrp === grpKey
                const isSaving  = savingGrp === grpKey

                // Detect modification vs default
                const defaultBlocks = TARIFFS[grpKey].blocks
                const isModified = t.blocks.some((b, i) => b.price !== defaultBlocks[i]?.price)

                return (
                  <div key={grpKey} className={`tariff-block ${grpKey === group ? 'highlight' : ''}`}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditing ? 12 : 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge badge-info" style={{ fontSize: 10 }}>{grpKey}</span>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-hint)', marginLeft: 6 }}>{t.description}</span>
                        </div>
                        {isModified && <span className="badge badge-warning" style={{ fontSize: 9 }}>DIMODIFIKASI</span>}
                      </div>
                      {!isEditing && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {isModified && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 10, color: 'var(--danger)' }}
                              onClick={() => setConfirmReset(grpKey)}
                              disabled={!!isSaving}
                            >
                              🔄
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 11 }}
                            onClick={() => setEditingGrp(grpKey)}
                            disabled={!!savingGrp}
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Edit form or read-only view */}
                    {isEditing ? (
                      <TariffEditForm
                        tariff={t}
                        saving={isSaving}
                        onSave={(blocks) => handleSaveTariff(grpKey, blocks)}
                        onCancel={() => setEditingGrp(null)}
                      />
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 16px' }}>
                        {t.blocks.map((b, i) => {
                          const prevLim = i === 0 ? 0 : t.blocks[i - 1].limit
                          const label = (b.limit === Infinity || b.limit === null)
                            ? `> ${prevLim} m³`
                            : `${prevLim + 1}–${b.limit} m³`
                          const changed = b.price !== TARIFFS[grpKey].blocks[i]?.price
                          return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px dotted var(--border)' }}>
                              <span style={{ color: 'var(--text-sec)' }}>{label}</span>
                              <span className="mono" style={{ fontWeight: 600, color: changed ? 'var(--ocean)' : 'var(--text)' }}>
                                {fmtRupiah(b.price)}/m³{changed ? ' ✱' : ''}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-hint)' }}>
              ✱ = nilai telah diubah · 🔄 = reset ke default
            </div>
          </Card>
        </div>

        {/* ─── Right: Konfigurasi + Kalkulator + Perbandingan ─── */}
        <div>
          <BiayaConfig settings={settings} onSave={handleBiayaSave} />

          <Card style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>🧮 Kalkulator Tagihan</div>

            <div className="form-group">
              <label className="form-label">Golongan Tarif</label>
              <select className="form-select" value={group} onChange={e => setGroup(e.target.value)}>
                {GOLONGAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Pemakaian (m³)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="range" min="0" max="100" step="1" value={usage}
                  onChange={e => setUsage(e.target.value)} style={{ flex: 1 }}
                />
                <div className="input-group" style={{ width: 100 }}>
                  <input type="number" className="form-input mono" value={usage}
                    onChange={e => setUsage(e.target.value)} min="0" style={{ padding: '8px 10px' }} />
                  <span className="input-addon">m³</span>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <SummaryRow label="Pemakaian" value={`${usage} m³`} />
              {activeBill.blocks.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-hint)', paddingLeft: 12 }}>└ {b.vol} m³ × {fmtRupiah(b.price)}</span>
                  <span className="mono">{fmtRupiah(b.sub)}</span>
                </div>
              ))}
              <SummaryRow label="Biaya Pemakaian Air" value={fmtRupiah(activeBill.waterCost)} />
              <SummaryRow label={`Biaya Administrasi`} value={fmtRupiah(activeBill.admin)} />
              {ppjActive && (
                <SummaryRow label={`PPJ (${settings.ppjRate ?? 10}%)`} value={fmtRupiah(activeBill.ppj)} />
              )}
              <SummaryRow label="TOTAL TAGIHAN" value={fmtRupiah(activeBill.total)} bold />
            </div>
          </Card>

          <Card>
            <div className="card-title" style={{ marginBottom: 12 }}>Perbandingan Tarif ({usage} m³)</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Golongan</th>
                    <th style={{ textAlign: 'right' }}>Biaya Air</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(tariffs).map(([grpKey, t]) => {
                    const b = calcFullWithBlocks(t.blocks, parseInt(usage) || 0, adminFee, ppjRate)
                    return (
                      <tr key={grpKey} style={{ background: grpKey === group ? 'var(--ocean-pale)' : '' }}>
                        <td>
                          <span className="badge badge-info" style={{ marginRight: 6 }}>{grpKey}</span>
                          <span style={{ fontSize: 12 }}>{t.name}</span>
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmtRupiah(b.waterCost)}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: grpKey === group ? 700 : 400, color: grpKey === group ? 'var(--ocean)' : 'var(--text)' }}>
                          {fmtRupiah(b.total)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
