import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { calcWaterCost, calcDueDate, generateInvoiceNumber } from '../utils/tariff'

const initialCustomers = []
const initialReadings  = []
const initialBills     = []

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
      nextCustId: 1,
      nextBillId: 1,
      nextReadId: 1,
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
    {
      name: 'pamsimas-store',
      version: 2,
      migrate: (persisted) => ({
        ...persisted,
        customers: [],
        readings:  [],
        bills:     [],
      }),
    }
  )
)
