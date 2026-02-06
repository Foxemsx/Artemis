import { useState, useEffect } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.artemis.window.isMaximized().then(setIsMaximized)
    const unsub1 = window.artemis.window.onMaximize(() => setIsMaximized(true))
    const unsub2 = window.artemis.window.onUnmaximize(() => setIsMaximized(false))
    return () => { unsub1(); unsub2() }
  }, [])

  return (
    <div
      className="titlebar-drag flex items-center justify-between h-8 px-3 shrink-0 no-select"
      style={{
        backgroundColor: 'var(--titlebar-bg)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Logo + Name */}
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-4 rounded flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent)', opacity: 0.9 }}
        >
          <span className="text-[9px] font-black" style={{ color: '#000' }}>A</span>
        </div>
        <span
          className="text-[11px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--text-muted)' }}
        >
          Artemis
        </span>
      </div>

      {/* Window Controls */}
      <div className="titlebar-no-drag flex items-center -mr-1">
        <button
          onClick={() => window.artemis.window.minimize()}
          className="w-10 h-8 flex items-center justify-center transition-colors duration-100"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <Minus size={13} strokeWidth={1.5} />
        </button>

        <button
          onClick={() => window.artemis.window.maximize()}
          className="w-10 h-8 flex items-center justify-center transition-colors duration-100"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          {isMaximized ? <Copy size={10} strokeWidth={1.5} /> : <Square size={10} strokeWidth={1.5} />}
        </button>

        <button
          onClick={() => window.artemis.window.close()}
          className="w-10 h-8 flex items-center justify-center transition-colors duration-100"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--error)'
            e.currentTarget.style.color = '#ffffff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
