import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { billAPI, settingsAPI } from '../utils/api'
import { Card, Badge, Button, Tabs, SearchInput, EmptyState } from '../components/UI'
import { InvoiceModal } from '../components/InvoiceModal'
import { fmtRupiah, fmtShort, fmtDateShort, getBillStatus } from '../utils/tariff'

export default function Billing() {
  const { showToast } = useStore()
  const [bills, setBills]           = useState([])
  const [settings, setSettings]     = useState({})
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('unpaid')
  const [search, setSearch]         = useState('')
  const [selectedBill, setSelectedBill] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [page, setPage]               = useState(1)
  const PAGE_SIZE = 20
  const loadedRef = useRef(false)

  const loadBills = async () => {
    try {
      const [data, sett] = await Promise.all([billAPI.getAll({ limit: 500 }), settingsAPI.get()])
      setBills(data)
      setSettings(sett)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    loadBills()
  }, [])

  const handleMarkPaid = async (b) => {
    try {
      await billAPI.markPaid(b.id)
      showToast('Tagihan ' + b.invoiceNo + ' lunas!')
      setSelectedBill(null)
      await loadBills()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleMarkUnpaid = async (b) => {
    try {
      await billAPI.markUnpaid(b.id)
      showToast('Status tagihan direset')
      setSelectedBill(null)
      await loadBills()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const filtered = bills.filter(b => {
    const matchTab = tab === 'all' || b.status === tab
    const matchSearch = !search ||
      b.custName?.toLowerCase().includes(search.toLowerCase()) ||
      b.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      b.period.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleTabChange = (t) => { setTab(t); setPage(1) }
  const handleSearch    = (v) => { setSearch(v); setPage(1) }

  const tabs = [
    { id: 'all',    label: 'Semua',       count: bills.length },
    { id: 'unpaid', label: 'Belum Lunas', count: bills.filter(b => b.status === 'unpaid').length },
    { id: 'overdue',label: 'Terlambat',   count: bills.filter(b => b.status === 'overdue').length },
    { id: 'paid',   label: 'Lunas',       count: bills.filter(b => b.status === 'paid').length },
  ]

  const totalAmount = filtered.reduce((s, b) => s + b.total, 0)
  const totalPaid   = filtered.filter(b => b.status === 'paid').reduce((s, b) => s + b.total, 0)

  return (
    <div>
      {/* Summary Row */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <Card style={{ padding: '14px 16px', background: 'var(--ocean)', color: '#fff', border: 'none' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Total Tagihan (filter aktif)</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 22, fontWeight: 800, marginTop: 4 }}>{fmtShort(totalAmount)}</div>
        </Card>
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>Sudah Terbayar</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 22, fontWeight: 800, color: 'var(--mint)', marginTop: 4 }}>{fmtShort(totalPaid)}</div>
        </Card>
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>Piutang</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 22, fontWeight: 800, color: 'var(--danger)', marginTop: 4 }}>{fmtShort(totalAmount - totalPaid)}</div>
        </Card>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <SearchInput value={search} onChange={handleSearch} placeholder="Cari nama, no. tagihan..." />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>{filtered.length} tagihan</span>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={handleTabChange} />

      <Card padding={0}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat data...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="🧾" title="Tidak ada tagihan" description="Tidak ada tagihan yang cocok dengan filter saat ini" />
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 'var(--radius)' }}>
            <table>
              <thead>
                <tr>
                  <th className="hide-mobile">No. Tagihan</th>
                  <th>Pelanggan</th>
                  <th className="hide-mobile">Periode</th>
                  <th className="hide-mobile" style={{ textAlign: 'center' }}>Pemakaian</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th className="hide-mobile">Jatuh Tempo</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(b => {
                  const status = getBillStatus(b)
                  return (
                    <tr key={b.id}>
                      <td className="mono hide-mobile" style={{ fontSize: 11.5 }}>{b.invoiceNo}</td>
                      <td>
                        <b style={{ display: 'block', fontSize: 13 }}>{b.custName || '—'}</b>
                        <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{b.meter} · {b.group}</span>
                        <span className="hide-mobile" style={{ fontSize: 10, color: 'var(--text-hint)' }}>{b.invoiceNo}</span>
                      </td>
                      <td className="hide-mobile" style={{ fontSize: 12 }}>{b.period}</td>
                      <td className="mono hide-mobile" style={{ textAlign: 'center' }}><b>{b.usage}</b> m³</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtRupiah(b.total)}</td>
                      <td className="hide-mobile" style={{ fontSize: 12 }}>
                        <span style={{ color: b.status === 'overdue' ? 'var(--danger)' : 'var(--text)' }}>
                          {fmtDateShort(b.dueDate)}
                        </span>
                        {b.paidDate && <div style={{ fontSize: 10, color: 'var(--mint)' }}>Bayar: {fmtDateShort(b.paidDate)}</div>}
                      </td>
                      <td><Badge variant={b.status === 'paid' ? 'success' : b.status === 'overdue' ? 'danger' : 'warning'}>{status.label}</Badge></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button variant="secondary" size="sm" onClick={() => setSelectedBill(b)}>🧾 Lihat</Button>
                          {b.photo && (
                            <Button variant="ghost" size="sm" onClick={() => setPhotoPreview(b.photo)} title="Lihat foto meter">📷</Button>
                          )}
                          {b.status !== 'paid' && (
                            <Button variant="ghost" size="sm" onClick={() => handleMarkPaid(b)}>✅</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <Button variant="ghost" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹ Prev</Button>
            <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>
              Hal. {page} / {totalPages} &nbsp;·&nbsp; {filtered.length} tagihan
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next ›</Button>
          </div>
        )}
      </Card>

      <InvoiceModal
        open={!!selectedBill}
        onClose={() => setSelectedBill(null)}
        bill={selectedBill}
        settingsData={settings}
        onMarkPaid={handleMarkPaid}
        onMarkUnpaid={handleMarkUnpaid}
      />

      {/* Photo preview modal */}
      {photoPreview && (
        <div
          onClick={() => setPhotoPreview(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📷 Foto Pembacaan Meter</span>
              <button onClick={() => setPhotoPreview(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <img src={photoPreview} alt="Foto meter" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
          </div>
        </div>
      )}
    </div>
  )
}
