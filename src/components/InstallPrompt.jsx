import { useState, useEffect } from 'react'

const DISMISS_KEY = 'pwa-install-dismissed'
const DISMISS_TTL = 3 * 24 * 60 * 60 * 1000  // 3 hari

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow]                     = useState(false)
  const [isInstalled, setIsInstalled]       = useState(false)
  const [platform, setPlatform]             = useState('other')  // 'ios' | 'android' | 'desktop' | 'other'

  useEffect(() => {
    // Cek apakah sudah installed (standalone mode)
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    ) {
      setIsInstalled(true)
      return
    }

    // Cek apakah baru-baru ini di-dismiss
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed && Date.now() - parseInt(dismissed) < DISMISS_TTL) return

    // Deteksi platform
    const ua = navigator.userAgent
    const isIOS     = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
    const isMac     = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1  // iPad dengan desktop mode
    const isAndroid = /Android/.test(ua)
    const isMobile  = isIOS || isMac || isAndroid

    if (isIOS || isMac) setPlatform('ios')
    else if (isAndroid) setPlatform('android')
    else setPlatform('desktop')

    // Android / Desktop Chrome: tangkap beforeinstallprompt
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS: tidak ada beforeinstallprompt, tampilkan panduan manual
    if (isIOS || isMac) {
      // Delay sedikit agar halaman selesai render
      const t = setTimeout(() => setShow(true), 2000)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', handler)
      }
    }

    // Deteksi setelah installed
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShow(false)
      setDeferredPrompt(null)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
    }
    setDeferredPrompt(null)
    setShow(false)
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  }

  if (!show || isInstalled) return null

  const isIOS = platform === 'ios'

  return (
    <>
      {/* Backdrop blur tipis */}
      <div
        onClick={handleDismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 990,
          background: 'rgba(0,0,0,0.25)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
      />

      {/* Banner slide-up dari bawah */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        zIndex: 991,
        background: 'var(--card)',
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -8px 40px rgba(11,79,108,0.18)',
        padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
        animation: 'slideUp 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Handle bar */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: 'var(--border)',
          margin: '0 auto 18px',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          {/* App icon */}
          <img
            src="/pwa-192x192.png"
            alt="AquaMeter"
            style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 800, fontSize: 17,
              color: 'var(--text)', marginBottom: 3,
            }}>
              Install AquaMeter
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.5 }}>
              {isIOS
                ? 'Tambahkan ke Home Screen untuk akses cepat tanpa buka browser'
                : 'Install sebagai aplikasi untuk akses lebih cepat dan bisa dipakai offline'}
            </div>
          </div>
        </div>

        {/* iOS: panduan manual */}
        {isIOS ? (
          <div style={{
            background: 'var(--bg-alt)',
            borderRadius: 12, padding: '12px 14px',
            fontSize: 13, lineHeight: 1.7,
            color: 'var(--text-sec)',
            marginBottom: 14,
          }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Cara install di iPhone / iPad:</div>
            <div>1. Tap tombol <b style={{ fontSize: 15 }}>⎋</b> <b>Bagikan</b> di bawah Safari</div>
            <div>2. Pilih <b>"Tambahkan ke Layar Utama"</b></div>
            <div>3. Tap <b>Tambahkan</b> di pojok kanan atas</div>
          </div>
        ) : (
          /* Android / Desktop: tombol install */
          <button
            onClick={handleInstall}
            style={{
              width: '100%',
              background: 'var(--ocean)',
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              padding: '14px 20px',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 18 }}>📲</span>
            Install Aplikasi Sekarang
          </button>
        )}

        <button
          onClick={handleDismiss}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'var(--text-hint)',
            fontSize: 13,
            padding: '8px',
            cursor: 'pointer',
          }}
        >
          Nanti saja
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}
