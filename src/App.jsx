import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Toast } from './components/UI'
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
import Settings from './pages/Settings'
import './styles/components.css'

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
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
                <Route path="/tickets"       element={<Tickets />} />
                <Route path="/settings"      element={<Settings />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
      <Toast />
    </BrowserRouter>
  )
}
