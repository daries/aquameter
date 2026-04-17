import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Toast } from './components/UI'
import { InstallPrompt } from './components/InstallPrompt'
import { isAuthenticated } from './utils/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Meters from './pages/Meters'
import Customers from './pages/Customers'
import Billing from './pages/Billing'
import Tariff from './pages/Tariff'
import Reports from './pages/Reports'
import Cashbook from './pages/Cashbook'
import Users from './pages/Users'
import Installations from './pages/Installations'
import Tickets from './pages/Tickets'
import MasterTicket from './pages/MasterTicket'
import Settings from './pages/Settings'
import './styles/components.css'

function detectMobileBrowser() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 768px)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent)
}

function detectStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [isMobileBrowser, setIsMobileBrowser] = useState(detectMobileBrowser)
  const [isStandalone, setIsStandalone] = useState(detectStandalone)

  useEffect(() => {
    const syncMode = () => {
      setIsMobileBrowser(detectMobileBrowser())
      setIsStandalone(detectStandalone())
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    syncMode()
    window.addEventListener('resize', syncMode)
    mediaQuery.addEventListener?.('change', syncMode)
    window.addEventListener('appinstalled', syncMode)

    return () => {
      window.removeEventListener('resize', syncMode)
      mediaQuery.removeEventListener?.('change', syncMode)
      window.removeEventListener('appinstalled', syncMode)
    }
  }, [])

  const pwaMode = useMemo(() => {
    if (isStandalone) return 'standalone'
    if (isMobileBrowser) return 'mobile-browser'
    return 'desktop-browser'
  }, [isMobileBrowser, isStandalone])

  useEffect(() => {
    document.documentElement.dataset.mobileBrowser = String(isMobileBrowser)
    document.documentElement.dataset.pwaMode = pwaMode
    document.body.dataset.mobileBrowser = String(isMobileBrowser)
    document.body.dataset.pwaMode = pwaMode
  }, [isMobileBrowser, pwaMode])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout isMobileBrowser={isMobileBrowser} isStandalone={isStandalone}>
              <Routes>
                <Route path="/"          element={<Dashboard />} />
                <Route path="/meters"    element={<Meters />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/billing"   element={<Billing />} />
                <Route path="/tariff"    element={<Tariff />} />
                <Route path="/reports"   element={<Reports />} />
                <Route path="/cashbook"  element={<Cashbook />} />
                <Route path="/users"         element={<Users />} />
                <Route path="/installations" element={<Installations />} />
                <Route path="/tickets"        element={<Tickets />} />
                <Route path="/master-ticket" element={<MasterTicket />} />
                <Route path="/settings"      element={<Settings />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
      <Toast />
      <InstallPrompt />
    </BrowserRouter>
  )
}
