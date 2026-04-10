import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmtRupiah, fmtDate } from './tariff'

/**
 * Generate Invoice PDF
 */
export function generateInvoicePDF(bill, customer, settings, blocks) {
  const doc = new jsPDF({ format: 'a5', unit: 'mm' })
  const W = 148, margin = 14

  // Header
  doc.setFillColor(11, 79, 108)
  doc.rect(0, 0, W, 36, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(settings.companyName, margin, 13)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(settings.companyAddress, margin, 19)
  doc.text(`Telp: ${settings.companyPhone}`, margin, 24)
  doc.text('TAGIHAN AIR MINUM', W - margin, 15, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(bill.invoiceNo, W - margin, 21, { align: 'right' })

  // Customer info
  doc.setTextColor(20, 30, 50)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  let y = 44
  doc.setFont('helvetica', 'bold')
  doc.text('KEPADA:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(customer.name, margin + 22, y)
  y += 5
  doc.text('ALAMAT:', margin, y)
  doc.text(customer.address, margin + 22, y)
  y += 5
  doc.text('NO. METER:', margin, y)
  doc.text(customer.meter, margin + 22, y)
  doc.text('PERIODE:', W / 2 + 2, y - 5)
  doc.setFont('helvetica', 'bold')
  doc.text(bill.period, W / 2 + 22, y - 5)
  doc.setFont('helvetica', 'normal')
  doc.text('JATUH TEMPO:', W / 2 + 2, y)
  doc.setTextColor(214, 40, 40)
  doc.text(fmtDate(bill.dueDate), W / 2 + 22, y)
  doc.setTextColor(20, 30, 50)

  // Table
  y += 10
  const rows = blocks.map(b => [
    'Pemakaian Air (' + b.label + ')',
    b.vol + ' m³',
    fmtRupiah(b.price) + '/m³',
    fmtRupiah(b.sub)
  ])
  rows.push(['Biaya Administrasi', '-', '-', fmtRupiah(bill.admin)])
  rows.push(['PPJ (10%)', '-', '-', fmtRupiah(bill.ppj)])

  autoTable(doc, {
    startY: y,
    head: [['Uraian', 'Volume', 'Tarif', 'Subtotal']],
    body: rows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [26, 127, 173], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 55 }, 3: { halign: 'right' } },
    alternateRowStyles: { fillColor: [244, 249, 252] },
  })

  // Total box
  const finalY = doc.lastAutoTable.finalY + 4
  doc.setFillColor(214, 240, 250)
  doc.roundedRect(margin, finalY, W - margin * 2, 12, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('TOTAL TAGIHAN', margin + 4, finalY + 8)
  doc.setTextColor(11, 79, 108)
  doc.setFontSize(11)
  doc.text(fmtRupiah(bill.total), W - margin - 2, finalY + 8, { align: 'right' })

  // Footer
  doc.setTextColor(130, 150, 170)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.text('Terima kasih telah membayar tepat waktu. Pembayaran dapat dilakukan di kantor PDAM atau transfer ke rekening resmi.', margin, finalY + 22, { maxWidth: W - margin * 2 })

  doc.save(`${bill.invoiceNo}.pdf`)
}

/**
 * Generate Monthly Report PDF
 */
export function generateMonthlyReportPDF(data, settings, period) {
  const doc = new jsPDF({ format: 'a4', orientation: 'landscape' })
  const W = 297, margin = 14

  // Header
  doc.setFillColor(11, 79, 108)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('LAPORAN KEUANGAN BULANAN', margin, 12)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`${settings.companyName} · Periode: ${period}`, margin, 20)
  doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, W - margin, 20, { align: 'right' })

  // Summary stats
  let y = 38
  const summaries = [
    { label: 'Total Volume', value: data.totalVolume.toLocaleString('id-ID') + ' m³' },
    { label: 'Total Tagihan', value: fmtRupiah(data.totalBilled) },
    { label: 'Total Terbayar', value: fmtRupiah(data.totalPaid) },
    { label: 'Piutang', value: fmtRupiah(data.totalUnpaid) },
    { label: 'Tingkat Bayar', value: data.payRate + '%' },
  ]
  const bw = (W - margin * 2) / summaries.length
  summaries.forEach((s, i) => {
    const x = margin + i * bw
    doc.setFillColor(244, 249, 252)
    doc.roundedRect(x, y, bw - 4, 18, 2, 2, 'F')
    doc.setTextColor(74, 112, 134)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(s.label, x + 4, y + 6)
    doc.setTextColor(11, 46, 63)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(s.value, x + 4, y + 14)
  })

  // Table
  autoTable(doc, {
    startY: y + 26,
    head: [['No.', 'Pelanggan', 'No. Meteran', 'Golongan', 'Pemakaian (m³)', 'Tagihan', 'Status', 'Tgl Bayar']],
    body: data.rows.map((r, i) => [
      i + 1, r.name, r.meter, r.group,
      r.usage, fmtRupiah(r.total),
      r.status === 'paid' ? 'Lunas' : r.status === 'overdue' ? 'Terlambat' : 'Belum Lunas',
      r.paidDate || '-'
    ]),
    margin: { left: margin, right: margin },
    styles: { fontSize: 8 },
    headStyles: { fillColor: [26, 127, 173], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 5: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = data.cell.raw
        if (val === 'Lunas') data.cell.styles.textColor = [82, 183, 136]
        else if (val === 'Terlambat') data.cell.styles.textColor = [214, 40, 40]
        else data.cell.styles.textColor = [244, 162, 97]
      }
    },
  })

  doc.save(`Laporan-${period.replace(' ', '-')}.pdf`)
}
