import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useStore } from '../store'
import { reportAPI, billAPI, readingAPI, transactionAPI } from '../utils/api'
import { StatCard, Card, Badge, Button } from '../components/UI'
import { InvoiceModal } from '../components/InvoiceModal'
import { fmtRupiah, fmtShort, getBillStatus } from '../utils/tariff'

const MONTH_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

const CustomTooltip = ({ active, payload, label, money }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.fill || p.stroke, marginBottom: 2 }}>
          {p.name}: <b>{money ? fmtShort(p.value) : p.value.toLocaleString('id-ID') + ' m³'}</b>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const navigate   = useNavigate()
  const { showToast } = useStore()
  const [selectedBill, setSelectedBill] = useState(null)

  // API data
  const [summary,      setSummary]      = useState(null)
  const [monthly,      setMonthly]      = useState([])
  const [unpaidBills,  setUnpaidBills]  = useState([])
  const [recentReads,  setRecentReads]  = useState([])
  const [totalCust,    setTotalCust]    = useState(0)
  const [kasMonth,     setKasMonth]     = useState(null)   // buku kas bulan ini
  const [recentTx,     setRecentTx]     = useState([])     // transaksi kas terbaru
  const [loading,      setLoading]      = useState(true)
  const loadedRef = useRef(false)

  const thisMonth = new Date().toLocaleDateString('sv-SE').substring(0, 7)
  const thisYear  = new Date().getFullYear()

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    Promise.all([
      reportAPI.summary(),
      reportAPI.monthly(thisYear),
      billAPI.getAll({ status: 'unpaid', limit: 10 }),
      readingAPI.getAll({ limit: 6 }),
      transactionAPI.getSummary({ month: thisMonth }),
      transactionAPI.getAll({ month: thisMonth, limit: 5 }),
    ]).then(([sum, mon, unpaid, reads, kas, txs]) => {
      setSummary(sum)
      setMonthly(mon)
      setUnpaidBills(unpaid)
      setRecentReads(reads)
      setTotalCust(sum?.active_customers || 0)
      setKasMonth(kas)
      setRecentTx(txs)
    }).catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  // Chart data — 6 bulan terakhir dari data monthly DB
  const chartData = monthly.slice(-6).map(m => {
    const [, mo] = m.period_key.split('-')
    return {
      month:    MONTH_ID[parseInt(mo) - 1],
      volume:   Math.round(m.total_volume   || 0),
      tagihan:  Math.round(m.total_billed   || 0),
      terbayar: Math.round(m.total_paid     || 0),
    }
  })

  // Stats dari summary API
  const totalVolume    = summary?.total_volume   || 0
  const totalPiutang   = summary?.unpaid_amount  || 0
  const unpaidCount    = summary?.unpaid_count   || 0

  // Bulan ini dari monthly
  const thisMonthData  = monthly.find(m => m.period_key === thisMonth)
  const thisTagihan    = thisMonthData?.total_billed || 0
  const thisTerbayar   = thisMonthData?.total_paid   || 0
  const payRate        = thisTagihan > 0 ? Math.round(thisTerbayar / thisTagihan * 100) : 0

  // Buku kas bulan ini
  const kasIncome  = kasMonth?.total_income  || 0
  const kasExpense = kasMonth?.total_expense || 0
  const kasSaldo   = kasIncome - kasExpense

  // Meter progress bulan ini
  const readThisMonth = monthly.find(m => m.period_key === thisMonth)?.bill_count || 0

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat dashboard...</div>

  return (
    <div>
      {/* ── Stat Cards ── */}
      <div className="stats-grid">
        <StatCard
          icon="💧" color="blue"
          value={totalVolume.toLocaleString('id-ID')}
          label="Total Pemakaian (m³)"
          change={`${readThisMonth} baca bulan ini`}
          onClick={() => navigate('/meters')}
        />
        <StatCard
          icon="👥" color="teal"
          value={totalCust}
          label="Pelanggan Aktif"
          change={`${unpaidCount} tagihan belum lunas`}
          onClick={() => navigate('/customers')}
        />
        <StatCard
          icon="💰" color="coral"
          value={fmtShort(thisTagihan)}
          label="Tagihan Bulan Ini"
          change={`Terbayar ${fmtShort(thisTerbayar)}`}
          onClick={() => navigate('/billing')}
        />
        <StatCard
          icon="✅" color="mint"
          value={payRate + '%'}
          label="Tingkat Pembayaran"
          change={payRate >= 80 ? 'Baik' : 'Perlu perhatian'}
          changeType={payRate >= 80 ? 'up' : 'down'}
          onClick={() => navigate('/billing')}
        />
      </div>

      {/* ── Charts ── */}
      <div className="grid-2">
        <Card>
          <div className="card-header">
            <div>
              <div className="card-title">Pemakaian Air Bulanan (m³)</div>
              <div className="card-sub">6 bulan terakhir</div>
            </div>
            <Badge variant="info">{thisYear}</Badge>
          </div>
          {chartData.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-hint)', fontSize: 13 }}>Belum ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="volume" name="Volume" fill="var(--ocean-light)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <div className="card-header">
            <div>
              <div className="card-title">Tagihan vs Terbayar (Rp)</div>
              <div className="card-sub">6 bulan terakhir</div>
            </div>
          </div>
          {chartData.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-hint)', fontSize: 13 }}>Belum ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} width={48} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<CustomTooltip money />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tagihan"  name="Tagihan"  fill="var(--coral-light)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="terbayar" name="Terbayar" fill="var(--mint)"        radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Readings + Unpaid ── */}
      <div className="grid-2">
        <Card>
          <div className="card-header">
            <div className="card-title">Pembacaan Meter Terbaru</div>
            <Button variant="primary" size="sm" onClick={() => navigate('/meters')}>+ Input Baca</Button>
          </div>
          {recentReads.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-hint)', fontSize: 13 }}>Belum ada pembacaan</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Pelanggan</th><th className="hide-mobile">No. Meter</th><th>Pakai</th><th className="hide-mobile">Tanggal</th></tr>
                </thead>
                <tbody>
                  {recentReads.map(r => (
                    <tr key={r.id}>
                      <td><b style={{ fontSize: 13 }}>{r.custName || '-'}</b></td>
                      <td className="mono hide-mobile" style={{ fontSize: 12 }}>{r.meter || '-'}</td>
                      <td className="mono"><b>{r.usage}</b> m³</td>
                      <td className="hide-mobile" style={{ fontSize: 12 }}>{r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="card-header">
            <div className="card-title">Tagihan Belum Lunas</div>
            <Badge variant="danger">{unpaidBills.length} tagihan</Badge>
          </div>
          {unpaidBills.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-hint)', fontSize: 13 }}>
              🎉 Semua tagihan sudah lunas!
            </div>
          ) : (
            unpaidBills.slice(0, 5).map(b => {
              const status = getBillStatus(b)
              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedBill(b)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.custName || '-'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{b.period} · {b.invoiceNo}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{fmtShort(b.total)}</span>
                    <Badge variant={b.status === 'overdue' ? 'danger' : 'warning'}>{status.label}</Badge>
                  </div>
                </div>
              )
            })
          )}
          {unpaidBills.length > 5 && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <Button variant="ghost" size="sm" onClick={() => navigate('/billing')}>Lihat semua ({unpaidBills.length})</Button>
            </div>
          )}
        </Card>
      </div>

      {/* ── Buku Kas Summary + Quick Stats ── */}
      <div className="grid-2">
        {/* Buku Kas Widget */}
        <Card>
          <div className="card-header">
            <div>
              <div className="card-title">📒 Buku Kas Bulan Ini</div>
              <div className="card-sub">{new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/cashbook')}>Lihat semua</Button>
          </div>

          {/* Saldo bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'var(--success-bg)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--mint)', fontWeight: 600, marginBottom: 4 }}>▲ Pemasukan</div>
              <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--mint)' }}>{fmtShort(kasIncome)}</div>
            </div>
            <div style={{ background: 'var(--danger-bg)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>▼ Pengeluaran</div>
              <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--danger)' }}>{fmtShort(kasExpense)}</div>
            </div>
          </div>

          {/* Saldo total */}
          <div style={{ background: kasSaldo >= 0 ? 'var(--ocean-pale)' : 'var(--danger-bg)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-sec)' }}>Saldo Kas</span>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 20, fontWeight: 800, color: kasSaldo >= 0 ? 'var(--ocean)' : 'var(--danger)' }}>
              {kasSaldo >= 0 ? '' : '-'}{fmtShort(Math.abs(kasSaldo))}
            </span>
          </div>

          {/* Transaksi terbaru */}
          {recentTx.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-hint)', fontSize: 13, padding: '8px 0' }}>Belum ada transaksi bulan ini</div>
          ) : (
            recentTx.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-hint)' }}>{t.date} · {t.category}</div>
                </div>
                <span style={{ fontWeight: 700, fontSize: 13, marginLeft: 12, color: t.type === 'income' ? 'var(--mint)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
                  {t.type === 'income' ? '+' : '-'}{fmtShort(t.amount)}
                </span>
              </div>
            ))
          )}
        </Card>

        {/* Quick Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ background: 'var(--ocean)', color: '#fff', border: 'none', marginBottom: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Meter Terbaca Bulan Ini</div>
            <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 32, fontWeight: 800 }}>
              {readThisMonth}
              <span style={{ fontSize: 16, fontWeight: 400, opacity: 0.7 }}> / {totalCust}</span>
            </div>
            <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#fff', borderRadius: 99, width: (totalCust ? Math.round(readThisMonth / totalCust * 100) : 0) + '%', transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>pelanggan sudah dibaca</div>
          </Card>

          <Card style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 8 }}>Total Piutang</div>
            <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 28, fontWeight: 800, color: 'var(--danger)' }}>
              {fmtShort(totalPiutang)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 4 }}>{unpaidCount} tagihan tertunggak</div>
          </Card>

          <Card style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 8 }}>Total Pendapatan (All Time)</div>
            <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 24, fontWeight: 800, color: 'var(--ocean)' }}>
              {fmtShort(summary?.total_paid || 0)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 4 }}>dari {fmtShort(summary?.total_billed || 0)} tagihan</div>
          </Card>
        </div>
      </div>

      <InvoiceModal open={!!selectedBill} onClose={() => setSelectedBill(null)} bill={selectedBill} />
    </div>
  )
}
