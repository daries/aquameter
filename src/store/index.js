import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { calcWaterCost, calcDueDate, generateInvoiceNumber } from '../utils/tariff'

const initialCustomers = [
  { id: 1, name: 'Budi Santoso', ktp: '3573010101800001', meter: 'MET-0001', group: 'R1', address: 'Jl. Melati No. 12, Sukun', phone: '081234567890', lastStand: 245, status: 'active', joinDate: '2020-01-15' },
  { id: 2, name: 'Siti Rahayu', ktp: '3573010101800002', meter: 'MET-0002', group: 'R2', address: 'Jl. Mawar No. 7, Lowokwaru', phone: '082345678901', lastStand: 1823, status: 'active', joinDate: '2019-05-20' },
  { id: 3, name: 'Hendra Wijaya', ktp: '3573010101800003', meter: 'MET-0003', group: 'R3', address: 'Jl. Anggrek No. 15, Klojen', phone: '083456789012', lastStand: 3241, status: 'active', joinDate: '2018-11-10' },
  { id: 4, name: 'Dewi Kusuma', ktp: '3573010101800004', meter: 'MET-0004', group: 'R1', address: 'Jl. Dahlia No. 3, Blimbing', phone: '084567890123', lastStand: 512, status: 'active', joinDate: '2021-03-08' },
  { id: 5, name: 'Toko Maju Jaya', ktp: '3573010101800005', meter: 'MET-0005', group: 'K1', address: 'Jl. Pasar Besar No. 22, Klojen', phone: '085678901234', lastStand: 4200, status: 'active', joinDate: '2017-07-12' },
  { id: 6, name: 'Ahmad Fauzi', ktp: '3573010101800006', meter: 'MET-0006', group: 'R1', address: 'Jl. Kenanga No. 9, Sukun', phone: '086789012345', lastStand: 189, status: 'active', joinDate: '2022-02-14' },
  { id: 7, name: 'Rina Permata', ktp: '3573010101800007', meter: 'MET-0007', group: 'R2', address: 'Jl. Flamboyan No. 4, Kedungkandang', phone: '087890123456', lastStand: 2100, status: 'active', joinDate: '2020-09-30' },
  { id: 8, name: 'CV Berkah Abadi', ktp: '3573010101800008', meter: 'MET-0008', group: 'K2', address: 'Jl. Industri No. 5, Lowokwaru', phone: '088901234567', lastStand: 8500, status: 'active', joinDate: '2016-04-22' },
  { id: 9, name: 'Agus Salim', ktp: '3573010101800009', meter: 'MET-0009', group: 'R1', address: 'Jl. Cempaka No. 6, Sukun', phone: '089012345678', lastStand: 378, status: 'active', joinDate: '2021-11-05' },
  { id: 10, name: 'Warung Barokah', ktp: '3573010101800010', meter: 'MET-0010', group: 'K1', address: 'Jl. Raya Dieng No. 11, Klojen', phone: '081123456789', lastStand: 5600, status: 'active', joinDate: '2019-08-17' },
]

const initialReadings = [
  { id: 1, custId: 1, lastStand: 232, currentStand: 245, usage: 13, date: '2025-04-01', note: 'Normal', period: '2025-04' },
  { id: 2, custId: 2, lastStand: 1798, currentStand: 1823, usage: 25, date: '2025-04-01', note: 'Normal', period: '2025-04' },
  { id: 3, custId: 3, lastStand: 3203, currentStand: 3241, usage: 38, date: '2025-04-02', note: 'Normal', period: '2025-04' },
  { id: 4, custId: 4, lastStand: 499, currentStand: 512, usage: 13, date: '2025-04-02', note: '', period: '2025-04' },
  { id: 5, custId: 5, lastStand: 4162, currentStand: 4200, usage: 38, date: '2025-04-02', note: 'Normal', period: '2025-04' },
  { id: 6, custId: 1, lastStand: 221, currentStand: 232, usage: 11, date: '2025-03-01', note: 'Normal', period: '2025-03' },
  { id: 7, custId: 2, lastStand: 1771, currentStand: 1798, usage: 27, date: '2025-03-01', note: 'Normal', period: '2025-03' },
  { id: 8, custId: 6, lastStand: 174, currentStand: 189, usage: 15, date: '2025-04-03', note: '', period: '2025-04' },
]

const initialBills = [
  { id: 1, custId: 1, invoiceNo: 'INV-2025-0001', period: 'April 2025', periodKey: '2025-04', usage: 13, waterCost: 20800, admin: 5000, ppj: 2080, total: 27880, dueDate: '2025-04-21', status: 'unpaid', paidDate: null },
  { id: 2, custId: 2, invoiceNo: 'INV-2025-0002', period: 'April 2025', periodKey: '2025-04', usage: 25, waterCost: 52500, admin: 5000, ppj: 5250, total: 62750, dueDate: '2025-04-21', status: 'paid', paidDate: '2025-04-10' },
  { id: 3, custId: 3, invoiceNo: 'INV-2025-0003', period: 'April 2025', periodKey: '2025-04', usage: 38, waterCost: 102600, admin: 5000, ppj: 10260, total: 117860, dueDate: '2025-04-21', status: 'unpaid', paidDate: null },
  { id: 4, custId: 4, invoiceNo: 'INV-2025-0004', period: 'April 2025', periodKey: '2025-04', usage: 13, waterCost: 20800, admin: 5000, ppj: 2080, total: 27880, dueDate: '2025-04-21', status: 'paid', paidDate: '2025-04-08' },
  { id: 5, custId: 5, invoiceNo: 'INV-2025-0005', period: 'April 2025', periodKey: '2025-04', usage: 38, waterCost: 114000, admin: 5000, ppj: 11400, total: 130400, dueDate: '2025-03-20', status: 'overdue', paidDate: null },
  { id: 6, custId: 1, invoiceNo: 'INV-2025-0006', period: 'Maret 2025', periodKey: '2025-03', usage: 11, waterCost: 17600, admin: 5000, ppj: 1760, total: 24360, dueDate: '2025-03-21', status: 'paid', paidDate: '2025-03-15' },
  { id: 7, custId: 2, invoiceNo: 'INV-2025-0007', period: 'Maret 2025', periodKey: '2025-03', usage: 27, waterCost: 57150, admin: 5000, ppj: 5715, total: 67865, dueDate: '2025-03-21', status: 'paid', paidDate: '2025-03-12' },
  { id: 8, custId: 6, invoiceNo: 'INV-2025-0008', period: 'April 2025', periodKey: '2025-04', usage: 15, waterCost: 24000, admin: 5000, ppj: 2400, total: 31400, dueDate: '2025-04-23', status: 'unpaid', paidDate: null },
]

const initialSettings = {
  companyName: 'PDAM Tirta Sejahtera',
  companyAddress: 'Jl. Sudirman No. 45, Kota',
  companyPhone: '0341-123456',
  companyEmail: 'info@pdamtirsej.go.id',
  companyNpwp: '01.234.567.8-901.000',
  readDate: 1,
  dueDays: 20,
  lateFee: 2,
  adminFee: 5000,
  ppjEnabled: true,
  ppjRate: 10,
  currency: 'IDR',
}

export const useStore = create(
  persist(
    (set, get) => ({
      customers: initialCustomers,
      readings: initialReadings,
      bills: initialBills,
      settings: initialSettings,
      nextCustId: 11,
      nextBillId: 9,
      nextReadId: 9,
      toast: null,

      // Customer actions
      addCustomer: (data) => set(s => ({
        customers: [...s.customers, { ...data, id: s.nextCustId, status: 'active', joinDate: new Date().toISOString().split('T')[0] }],
        nextCustId: s.nextCustId + 1,
      })),
      updateCustomer: (id, data) => set(s => ({
        customers: s.customers.map(c => c.id === id ? { ...c, ...data } : c)
      })),
      deleteCustomer: (id) => set(s => ({
        customers: s.customers.map(c => c.id === id ? { ...c, status: 'inactive' } : c)
      })),

      // Reading actions
      addReading: (data) => {
        const s = get()
        const customer = s.customers.find(c => c.id === data.custId)
        if (!customer) return null
        const usage = data.currentStand - data.lastStand
        const { cost } = calcWaterCost(customer.group, usage)
        const admin = s.settings.adminFee
        const ppj = Math.round(cost * s.settings.ppjRate / 100)
        const total = cost + admin + ppj
        const billId = s.nextBillId
        const readId = s.nextReadId
        const periodKey = data.date.substring(0, 7)
        const periodDate = new Date(data.date)
        const periodName = periodDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

        const reading = { id: readId, ...data, usage, period: periodKey }
        const bill = {
          id: billId,
          custId: data.custId,
          invoiceNo: generateInvoiceNumber(billId),
          period: periodName,
          periodKey,
          usage,
          waterCost: cost,
          admin,
          ppj,
          total,
          dueDate: calcDueDate(data.date, s.settings.dueDays),
          status: 'unpaid',
          paidDate: null,
        }

        set(s => ({
          readings: [...s.readings, reading],
          bills: [...s.bills, bill],
          customers: s.customers.map(c => c.id === data.custId ? { ...c, lastStand: data.currentStand } : c),
          nextBillId: s.nextBillId + 1,
          nextReadId: s.nextReadId + 1,
        }))
        return bill
      },

      // Bill actions
      markPaid: (billId) => set(s => ({
        bills: s.bills.map(b => b.id === billId
          ? { ...b, status: 'paid', paidDate: new Date().toISOString().split('T')[0] }
          : b
        )
      })),
      markUnpaid: (billId) => set(s => ({
        bills: s.bills.map(b => b.id === billId ? { ...b, status: 'unpaid', paidDate: null } : b)
      })),

      // Settings
      updateSettings: (data) => set(s => ({ settings: { ...s.settings, ...data } })),

      // Toast
      showToast: (message, type = 'success') => {
        set({ toast: { message, type, id: Date.now() } })
        setTimeout(() => set({ toast: null }), 3500)
      },
    }),
    { name: 'pamsimas-store', version: 1 }
  )
)
