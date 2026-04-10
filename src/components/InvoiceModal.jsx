import React from 'react'
import { Modal, Button, SummaryRow } from './UI'
import { fmtRupiah, fmtDate, calcWaterCost, getBillStatus, TARIFFS } from '../utils/tariff'
import { generateInvoicePDF } from '../utils/pdfGenerator'
import { useStore } from '../store'

export function InvoiceModal({ open, onClose, bill }) {
  const { customers, settings, markPaid, markUnpaid, showToast } = useStore()
  if (!bill) return null
  const customer = customers.find(c => c.id === bill.custId) || {}
  const { blocks } = calcWaterCost(customer.group || 'R1', bill.usage)
  const status = getBillStatus(bill)

  const handleMarkPaid = () => {
    markPaid(bill.id)
    showToast('Tagihan ' + bill.invoiceNo + ' ditandai lunas!')
    onClose()
  }

  const handlePrint = () => {
    generateInvoicePDF(bill, customer, settings, blocks)
    showToast('PDF invoice berhasil diunduh!')
  }

  return (
    <Modal open={open} onClose={onClose} title="🧾 Detail Tagihan" width={560}>
      {/* Invoice Header */}
      <div className="invoice-header">
        <div className="invoice-number">{bill.invoiceNo}</div>
        <div style={{ fontSize: 12, opacity: 0.7, margin: '4px 0' }}>Tagihan Air Minum · {bill.period}</div>
        <div className="invoice-amount">{fmtRupiah(bill.total)}</div>
        <span className={`badge ${status.cls}`} style={{ marginTop: 8, display: 'inline-flex' }}>{status.label}</span>
      </div>

      {/* Customer & Bill Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, margin: '16px 0', fontSize: 13 }}>
        <div>
          <div style={{ color: 'var(--text-hint)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pelanggan</div>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{customer.name}</div>
          <div style={{ color: 'var(--text-sec)', fontSize: 12 }}>{customer.address}</div>
          <div style={{ color: 'var(--text-hint)', fontSize: 12, marginTop: 2 }}>No. Meter: {customer.meter}</div>
          <div style={{ color: 'var(--text-hint)', fontSize: 12 }}>Golongan: {customer.group} · {TARIFFS[customer.group]?.name}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-hint)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Detail Tagihan</div>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Periode: {bill.period}</div>
          <div style={{ color: 'var(--text-sec)', fontSize: 12 }}>Jatuh Tempo: <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{fmtDate(bill.dueDate)}</span></div>
          {bill.paidDate && <div style={{ color: 'var(--mint)', fontSize: 12, marginTop: 2 }}>Dibayar: {fmtDate(bill.paidDate)}</div>}
        </div>
      </div>

      {/* Usage Detail */}
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <table className="invoice-table">
          <thead>
            <tr>
              <th>Uraian</th>
              <th style={{ textAlign: 'center' }}>Volume</th>
              <th style={{ textAlign: 'right' }}>Tarif</th>
              <th style={{ textAlign: 'right' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b, i) => (
              <tr key={i}>
                <td>Pemakaian air ({b.label})</td>
                <td style={{ textAlign: 'center' }} className="mono">{b.vol} m³</td>
                <td style={{ textAlign: 'right' }} className="mono">{fmtRupiah(b.price)}/m³</td>
                <td style={{ textAlign: 'right' }} className="mono">{fmtRupiah(b.sub)}</td>
              </tr>
            ))}
            <tr>
              <td>Biaya Administrasi</td>
              <td style={{ textAlign: 'center' }}>–</td>
              <td style={{ textAlign: 'right' }}>–</td>
              <td style={{ textAlign: 'right' }} className="mono">{fmtRupiah(bill.admin)}</td>
            </tr>
            <tr>
              <td>Pajak Penerangan Jalan (PPJ 10%)</td>
              <td style={{ textAlign: 'center' }}>–</td>
              <td style={{ textAlign: 'right' }}>–</td>
              <td style={{ textAlign: 'right' }} className="mono">{fmtRupiah(bill.ppj)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Total */}
      <div className="invoice-total">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Total Tagihan</span>
        <span className="invoice-total-val">{fmtRupiah(bill.total)}</span>
      </div>

      {/* Notes */}
      {bill.status === 'overdue' && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid #f5c6c6', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 12, color: 'var(--danger)' }}>
          ⚠️ Tagihan ini melewati jatuh tempo. Mohon segera melakukan pembayaran untuk menghindari denda.
        </div>
      )}

      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>Tutup</Button>
        <Button variant="secondary" onClick={handlePrint} icon="🖨️">Cetak PDF</Button>
        {bill.status !== 'paid' && (
          <Button variant="primary" onClick={handleMarkPaid} icon="✅">Tandai Lunas</Button>
        )}
        {bill.status === 'paid' && (
          <Button variant="ghost" onClick={() => { markUnpaid(bill.id); showToast('Status tagihan direset'); onClose() }}>
            Batal Lunas
          </Button>
        )}
      </div>
    </Modal>
  )
}
