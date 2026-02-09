import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface WorkspaceTrustDialogProps {
  folderPath: string
  folderName: string
  onTrust: () => void
  onRestricted: () => void
}

export default function WorkspaceTrustDialog({
  folderPath,
  folderName,
  onTrust,
  onRestricted,
}: WorkspaceTrustDialogProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[560px] rounded-xl overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-elevated)',
          }}
        >
          {/* Header */}
          <div className="px-7 pt-7 pb-2">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-glow)' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h2
                  className="text-[15px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Do you trust the authors of this folder?
                </h2>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Workspace Trust
                </p>
              </div>
            </div>

            {/* Folder path */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span
                className="text-[12px] font-mono truncate"
                style={{ color: 'var(--text-secondary)' }}
                title={folderPath}
              >
                {folderPath}
              </span>
            </div>

            <p
              className="text-[12.5px] leading-relaxed mb-5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Code in this folder can execute tools, run commands, and modify files on your system.
              If you don't trust the source, open in <strong style={{ color: 'var(--text-primary)' }}>Restricted Mode</strong> to
              safely browse and read code without risk.
            </p>
          </div>

          {/* Feature comparison */}
          <div
            className="grid grid-cols-2 gap-0 mx-7 mb-5 rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            {/* Trusted column */}
            <div
              className="p-4"
              style={{
                backgroundColor: 'var(--accent-glow)',
                borderRight: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span className="text-[11.5px] font-semibold" style={{ color: 'var(--accent)' }}>
                  Trusted
                </span>
              </div>
              <ul className="space-y-1.5">
                {['File editing', 'Terminal access', 'AI Agent & Chat', 'Command execution', 'File browsing', 'Code search'].map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Restricted column */}
            <div className="p-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <div className="flex items-center gap-1.5 mb-3">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                <span className="text-[11.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Restricted
                </span>
              </div>
              <ul className="space-y-1.5">
                {[
                  { name: 'File editing', allowed: false },
                  { name: 'Terminal access', allowed: false },
                  { name: 'AI Agent & Chat', allowed: false },
                  { name: 'Command execution', allowed: false },
                  { name: 'File browsing', allowed: true },
                  { name: 'Code search', allowed: true },
                ].map((f) => (
                  <li key={f.name} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {f.allowed ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                    {f.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex items-center justify-end gap-2.5 px-7 py-4"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <button
              onClick={onRestricted}
              className="px-4 py-2 rounded-lg text-[12px] font-medium transition-all duration-150 hover:brightness-110 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)',
              }}
            >
              No, I don't trust the authors
            </button>
            <button
              onClick={onTrust}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-150 hover:brightness-110 cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--bg-primary)',
                border: '1px solid rgba(var(--accent-rgb), 0.5)',
                boxShadow: '0 2px 8px rgba(var(--accent-rgb), 0.2)',
              }}
            >
              Yes, I trust the authors
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/** Restricted mode banner shown at the top of the chat panel */
export function RestrictedModeBanner({ onTrust }: { onTrust: () => void }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 mx-3 mt-3 rounded-lg"
      style={{
        backgroundColor: 'rgba(var(--accent-secondary-rgb), 0.06)',
        border: '1px solid rgba(var(--accent-secondary-rgb), 0.15)',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-[11.5px] font-medium" style={{ color: 'var(--error)' }}>
          Restricted Mode
        </p>
        <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          AI chat, editing, and terminal are disabled. You can browse files and search code.
        </p>
      </div>
      <button
        onClick={onTrust}
        className="px-3 py-1.5 rounded-md text-[10.5px] font-medium flex-shrink-0 transition-all duration-150 hover:brightness-110 cursor-pointer"
        style={{
          backgroundColor: 'var(--accent-glow)',
          color: 'var(--accent)',
          border: '1px solid rgba(var(--accent-rgb), 0.25)',
        }}
      >
        Trust Workspace
      </button>
    </div>
  )
}
