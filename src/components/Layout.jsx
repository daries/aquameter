import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getUser, clearAuth } from '../utils/auth'
import { authAPI } from '../utils/api'

const navItems = [
  { group: 'Utama', items: [
    { to: '/', label: 'Dashboard', icon: '📊', end: true },
    { to: '/meters', label: 'Baca Meteran', icon: '💧' },
    { to: '/customers', label: 'Pelanggan', icon: '👥' },
  ]},
  { group: 'Keuangan', items: [
    { to: '/billing',  label: 'Tagihan',   icon: '🧾' },
    { to: '/cashbook', label: 'Buku Kas',  icon: '📒' },
    { to: '/tariff',   label: 'Tarif',     icon: <span style={{color:'red'}}>$</span> },
    { to: '/reports',  label: 'Laporan',   icon: '📈' },
  ]},
  { group: 'Sistem', items: [
    { to: '/installations', label: 'Pasang Baru',    icon: '🔧' },
    { to: '/tickets',       label: 'Pengaduan',      icon: '🎫' },
    { to: '/master-ticket', label: 'Master Tiket',   icon: '🗂️', adminOnly: true },
    { to: '/users',         label: 'Manajemen User', icon: '👤', adminOnly: true },
    { to: '/settings',      label: 'Pengaturan',     icon: '⚙️' },
  ]},
]

// 5 items shown in mobile bottom bar
const bottomNavItems = [
  { to: '/',         label: 'Dashboard', icon: '📊', end: true },
  { to: '/meters',   label: 'Meteran',   icon: '💧' },
  { to: '/billing',  label: 'Tagihan',   icon: '🧾' },
  { to: '/cashbook', label: 'Buku Kas',  icon: '📒' },
  { to: '/settings', label: 'Setting',   icon: '⚙️' },
]

const pageTitles = {
  '/': '📊 Dashboard',
  '/meters': '💧 Baca Meteran',
  '/customers': '👥 Pelanggan',
  '/billing': '🧾 Tagihan',
  '/cashbook':      '📒 Buku Kas',
  '/installations': '🔧 Pasang Baru',
  '/tickets':       '🎫 Pengaduan',
  '/master-ticket': '🗂️ Master Tiket',
  '/users':         '👤 Manajemen User',
  '/tariff': '$ Tarif',
  '/reports': '📈 Laporan',
  '/settings': '⚙️ Pengaturan',
}

export function Layout({ children, isMobileBrowser = false, isStandalone = false }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768)
  const [installPrompt, setInstallPrompt] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()
  const title = pageTitles[location.pathname] || 'PAMSIMAS'
  const user = getUser()

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }

    const handleInstalled = () => {
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const handleLogout = async () => {
    try { await authAPI.logout() } catch (e) { /* ignore */ }
    clearAuth()
    navigate('/login', { replace: true })
  }

  const closeSidebar = () => setSidebarOpen(false)

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice.catch(() => null)
    setInstallPrompt(null)
  }

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''} ${isMobileBrowser ? 'mobile-browser' : ''} ${isStandalone ? 'standalone-mode' : ''}`}>
      {/* Overlay (visible on mobile when sidebar open) */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          className="mobile-overlay"
        />
      )}

      <Sidebar open={sidebarOpen} onClose={closeSidebar} user={user} onLogout={handleLogout} />

      <div className="main">
        <div className="topbar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="mobile-menu-btn"
              aria-label="Menu"
            >☰</button>
            <div className="page-title">{title}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="topbar-date">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="topbar-user-info">
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{user.fullName}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-hint)', textTransform: 'uppercase' }}>{user.role}</div>
                </div>
                <button onClick={handleLogout} className="btn btn-ghost btn-sm no-print" title="Logout">
                  <span className="topbar-logout-text">🚪 Keluar</span>
                  <span className="topbar-logout-icon">🚪</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {isMobileBrowser && !isStandalone && (
          <div className="install-banner no-print">
            <div>
              <div className="install-banner-title">Mode aplikasi tersedia di mobile</div>
              <div className="install-banner-text">
                Install AquaMeter ke home screen supaya tampil full-screen, lebih stabil, dan terasa seperti aplikasi.
              </div>
            </div>
            {installPrompt ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleInstall}>
                Install App
              </button>
            ) : (
              <div className="install-banner-hint">Gunakan menu browser lalu pilih "Add to Home Screen"</div>
            )}
          </div>
        )}

        <div className="content animate-fade">
          {children}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="bottom-nav no-print">
        {bottomNavItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Sidebar({ open, onClose, user, onLogout }) {
  return (
    <nav className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-text">
          <div className="logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8 8 4 12 4 16a8 8 0 0016 0c0-4-4-8-8-14z" fill="#fff" opacity="0.9"/>
            </svg>
          </div>
          PAMSIMAS
        </div>
        <div className="logo-sub">Sistem Manajemen Air v2.0</div>
      </div>

      <div className="nav">
        {navItems.map(section => (
          <div key={section.group} className="nav-section">
            <div className="nav-label">{section.group}</div>
            {section.items
              .filter(item => !item.adminOnly || user?.role === 'admin')
              .map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => { if (window.innerWidth <= 768) onClose() }}
                  style={{ textDecoration: 'none' }}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
          </div>
        ))}
      </div>

      {user && (
        <div className="sidebar-user">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="sidebar-avatar">{user.fullName?.[0] || '?'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.fullName}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{user.role}</div>
            </div>
            <button onClick={onLogout} className="sidebar-logout" title="Logout">🚪</button>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="version">PAMSIMAS © 2026 · PDAM Integration</div>
      </div>
    </nav>
  )
}
