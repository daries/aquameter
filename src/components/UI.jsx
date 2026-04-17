import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'

/* ─── Badge ─── */
export function Badge({ children, variant = 'info', size = 'md' }) {
  const cls = {
    success: 'badge-success', warning: 'badge-warning',
    danger: 'badge-danger', info: 'badge-info', gray: 'badge-gray',
  }
  const sizes = { sm: '10px 7px', md: '3px 9px' }
  return (
    <span className={`badge ${cls[variant]}`} style={{ padding: sizes[size], fontSize: size === 'sm' ? 10 : 11 }}>
      {children}
    </span>
  )
}

/* ─── Button ─── */
export function Button({ children, variant = 'primary', size = 'md', onClick, type = 'button', disabled, full, className = '', icon }) {
  const cls = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' }
  const sizes = { sm: 'btn-sm', md: '', lg: 'btn-lg' }
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className={`btn ${cls[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      style={{ width: full ? '100%' : undefined, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
      {children}
    </button>
  )
}

/* ─── Card ─── */
export function Card({ children, className = '', style, onClick, padding = 20 }) {
  return (
    <div className={`card ${className}`} style={{ padding, cursor: onClick ? 'pointer' : 'default', ...style }} onClick={onClick}>
      {children}
    </div>
  )
}

/* ─── Modal ─── */
export function Modal({ open, onClose, title, children, width = 520 }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal animate-fade" style={{ width, maxWidth: '94vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div className="modal-title" style={{ margin: 0 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-hint)', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ─── Form Input ─── */
export function FormInput({ label, hint, addon, error, ...props }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      {addon ? (
        <div className="input-group">
          <input className={`form-input mono ${error ? 'error' : ''}`} {...props} />
          <span className="input-addon">{addon}</span>
        </div>
      ) : (
        <input className={`form-input ${error ? 'error' : ''}`} {...props} />
      )}
      {hint && <div className="form-hint">{hint}</div>}
      {error && <div className="form-hint" style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  )
}

export function FormSelect({ label, children, hint, ...props }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select className="form-select" {...props}>{children}</select>
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  )
}

/* ─── Toast ─── */
export function Toast() {
  const toast = useStore(s => s.toast)
  if (!toast) return null
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }
  return (
    <div className="toast show" style={{
      background: toast.type === 'error' ? 'var(--danger)' : toast.type === 'warning' ? 'var(--warning)' : 'var(--teal)'
    }}>
      <span>{icons[toast.type] || '✅'}</span>
      <span>{toast.message}</span>
    </div>
  )
}

/* ─── Stat Card ─── */
export function StatCard({ icon, value, label, change, changeType = 'up', color = 'blue', onClick }) {
  return (
    <div className={`stat-card ${color}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {change && <div className={`stat-change ${changeType}`}>{changeType === 'up' ? '↑' : '↓'} {change}</div>}
    </div>
  )
}

/* ─── Empty State ─── */
export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-hint)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text-sec)', marginBottom: 6 }}>{title}</div>
      {description && <div style={{ fontSize: 13 }}>{description}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

/* ─── Confirm Dialog ─── */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Ya, lanjutkan', danger = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={400}>
      <p style={{ fontSize: 14, color: 'var(--text-sec)', marginBottom: 20 }}>{message}</p>
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose() }}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

/* ─── Tabs ─── */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon && <span>{t.icon} </span>}{t.label}
          {t.count != null && (
            <span style={{ marginLeft: 6, background: active === t.id ? 'var(--ocean-pale)' : 'var(--border)', color: 'var(--text-sec)', borderRadius: 99, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/* ─── Progress Bar ─── */
export function ProgressBar({ value, max = 100, color = 'var(--ocean-light)', height = 8 }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="progress-bar" style={{ height }}>
      <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/* ─── Search Input ─── */
export function SearchInput({ value, onChange, placeholder = 'Cari...' }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-hint)' }}>🔍</span>
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="form-input"
        style={{ paddingLeft: 32, marginBottom: 0 }}
      />
    </div>
  )
}

/* ─── Summary Row ─── */
export function SummaryRow({ label, value, bold, color }) {
  return (
    <div className={`summary-row ${bold ? 'total' : ''}`}>
      <span style={{ color: bold ? 'var(--text)' : 'var(--text-sec)' }}>{label}</span>
      <span className="mono" style={{ color: color || (bold ? 'var(--ocean)' : 'var(--text)') }}>{value}</span>
    </div>
  )
}
