import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Trash2 } from 'lucide-react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  dangerLabel?: string
  fileName?: string
  isDanger?: boolean
  onConfirm: () => void
  onCancel: () => void
  onDanger?: () => void
}

export default function ConfirmDialog({
  title, message,
  confirmLabel = 'Save', cancelLabel = 'Cancel', dangerLabel,
  fileName, isDanger,
  onConfirm, onCancel, onDanger,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel, onConfirm])

  const IconComponent = isDanger ? Trash2 : AlertTriangle
  const accentColor = isDanger ? 'rgba(239, 68, 68, 0.9)' : 'var(--accent)'
  const accentBg = isDanger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(var(--accent-rgb), 0.1)'
  const accentBorder = isDanger ? 'rgba(239, 68, 68, 0.2)' : 'rgba(var(--accent-rgb), 0.15)'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
        onClick={onCancel}
      >
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-[400px] rounded-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: `1px solid ${accentBorder}`,
            boxShadow: `0 25px 60px -12px rgba(0, 0, 0, 0.5), 0 0 40px -8px ${accentBg}`,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Top accent bar */}
          <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

          <div className="p-6">
            {/* Icon + Title */}
            <div className="flex items-start gap-3.5 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: accentBg,
                  border: `1px solid ${accentBorder}`,
                }}
              >
                <IconComponent size={18} style={{ color: accentColor }} />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="text-[15px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {title}
                </h3>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {message}
                  {fileName && (
                    <>
                      {' '}
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {fileName}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="mb-4" style={{ borderTop: '1px solid var(--border-subtle)' }} />

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onCancel}
                className="group relative px-4 py-2 rounded-lg text-[12px] font-medium transition-all duration-150"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  e.currentTarget.style.borderColor = 'var(--border-default)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.borderColor = 'var(--border-subtle)'
                }}
              >
                {cancelLabel}
                <span className="ml-2 text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  Esc
                </span>
              </button>
              {dangerLabel && onDanger && (
                <button
                  onClick={onDanger}
                  className="px-4 py-2 rounded-lg text-[12px] font-medium transition-all duration-150"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)'
                  }}
                >
                  {dangerLabel}
                </button>
              )}
              <button
                onClick={onConfirm}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-150"
                style={{
                  backgroundColor: isDanger ? '#ef4444' : 'var(--accent)',
                  color: isDanger ? '#fff' : '#000',
                  boxShadow: `0 2px 8px -2px ${isDanger ? 'rgba(239,68,68,0.4)' : 'rgba(var(--accent-rgb),0.3)'}`,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '0.9'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '1'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                {confirmLabel}
                <span
                  className="ml-2 text-[10px] px-1 py-0.5 rounded"
                  style={{
                    backgroundColor: isDanger ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                    color: isDanger ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)',
                  }}
                >
                  ↵
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
