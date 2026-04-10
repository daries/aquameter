import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../utils/api'
import { setAuth } from '../utils/auth'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPwd, setShowPwd]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) { setError('Username dan password wajib diisi'); return }
    setLoading(true); setError('')
    try {
      const { token, user } = await authAPI.login({ username, password })
      setAuth(token, user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8 8 4 12 4 16a8 8 0 0016 0c0-4-4-8-8-14z" fill="#fff" opacity="0.95"/>
            </svg>
          </div>
          <div>
            <div className="login-logo-title">PAMSIMAS</div>
            <div className="login-logo-sub">Sistem Manajemen Meteran Air</div>
          </div>
        </div>

        <div className="login-heading">Masuk ke Sistem</div>
        <p className="login-sub">Silakan login dengan akun petugas Anda</p>

        {error && (
          <div className="login-error">
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              placeholder="Masukkan username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-group">
              <input
                type={showPwd ? 'text' : 'password'}
                className="form-input"
                placeholder="Masukkan password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{ borderRadius: '10px 0 0 10px', borderRight: 'none' }}
              />
              <button
                type="button"
                className="input-addon"
                onClick={() => setShowPwd(!showPwd)}
                style={{ cursor: 'pointer', border: '1.5px solid var(--border)', borderLeft: 'none', background: 'var(--bg)', borderRadius: '0 10px 10px 0', userSelect: 'none' }}
              >
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px', fontSize: 14 }}
            disabled={loading}
          >
            {loading ? '⏳ Memverifikasi...' : '🔑 Masuk'}
          </button>
        </form>

      </div>
    </div>
  )
}
