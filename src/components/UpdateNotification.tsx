import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, ExternalLink, X, Sparkles, ArrowRight, FileText } from 'lucide-react'

interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  latestRelease: {
    tag_name: string
    name: string
    body: string
    published_at: string
    html_url: string
    prerelease: boolean
    assets: Array<{
      name: string
      browser_download_url: string
      size: number
      download_count: number
    }>
  } | null
}

interface Props {
  updateInfo: UpdateInfo
  onDismiss: () => void
  onViewChangelog: () => void
}

export default function UpdateNotification({ updateInfo, onDismiss, onViewChangelog }: Props) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null)

  if (!updateInfo.hasUpdate || !updateInfo.latestRelease) return null

  const release = updateInfo.latestRelease
  const installerAsset = release.assets.find(a =>
    a.name.toLowerCase().endsWith('.exe') ||
    a.name.toLowerCase().endsWith('.dmg') ||
    a.name.toLowerCase().endsWith('.appimage') ||
    a.name.toLowerCase().endsWith('.deb')
  )

  // Extract first meaningful line from release body
  const summaryLine = release.body
    ?.split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('---'))

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-5 right-5 z-50 max-w-sm"
        style={{ pointerEvents: 'auto' }}
      >
        <div
          className="rounded-xl overflow-hidden shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid rgba(var(--accent-rgb), 0.3)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(var(--accent-rgb), 0.08)',
          }}
        >
          {/* Accent gradient top bar */}
          <div
            className="h-1"
            style={{
              background: 'linear-gradient(90deg, var(--accent), rgba(var(--accent-rgb), 0.4))',
            }}
          />

          {/* Header */}
          <div className="flex items-start justify-between px-4 pt-3 pb-1">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--accent-glow)',
                  border: '1px solid rgba(var(--accent-rgb), 0.2)',
                }}
              >
                <Sparkles size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  Update Available
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Artemis IDE
                </p>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded-md transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Version info */}
          <div className="px-4 py-2">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-md"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                v{updateInfo.currentVersion}
              </span>
              <ArrowRight size={10} style={{ color: 'var(--text-muted)' }} />
              <span
                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md"
                style={{
                  backgroundColor: 'rgba(74, 222, 128, 0.1)',
                  color: 'var(--success)',
                  border: '1px solid rgba(74, 222, 128, 0.15)',
                }}
              >
                v{updateInfo.latestVersion}
              </span>
            </div>

            {summaryLine && (
              <p
                className="text-[11px] leading-relaxed line-clamp-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {summaryLine}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            {/* Update Now — opens the download link for the installer */}
            {installerAsset && (
              <button
                onClick={() => window.artemis.shell.openExternal(installerAsset.browser_download_url)}
                onMouseEnter={() => setHoveredButton('update')}
                onMouseLeave={() => setHoveredButton(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  backgroundColor: hoveredButton === 'update'
                    ? 'var(--accent)'
                    : 'var(--accent-glow)',
                  color: hoveredButton === 'update'
                    ? 'var(--bg-primary)'
                    : 'var(--accent)',
                  border: '1px solid rgba(var(--accent-rgb), 0.3)',
                }}
              >
                <Download size={12} />
                Update Now
              </button>
            )}

            {/* View Changelog */}
            <button
              onClick={onViewChangelog}
              onMouseEnter={() => setHoveredButton('changelog')}
              onMouseLeave={() => setHoveredButton(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              style={{
                backgroundColor: hoveredButton === 'changelog' ? 'var(--bg-hover)' : 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <FileText size={12} />
              Changelog
            </button>

            {/* Check GitHub */}
            <button
              onClick={() => window.artemis.shell.openExternal(release.html_url)}
              onMouseEnter={() => setHoveredButton('github')}
              onMouseLeave={() => setHoveredButton(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              style={{
                backgroundColor: hoveredButton === 'github' ? 'var(--bg-hover)' : 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <ExternalLink size={12} />
              GitHub
            </button>

            {/* Skip */}
            <button
              onClick={onDismiss}
              className="ml-auto text-[10px] font-medium transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              Skip
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
