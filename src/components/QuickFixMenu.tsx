import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Lightbulb, Import, Trash2, Wand2, RefreshCw, Code } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { QuickFix } from '../lib/quickFixes'

interface Props {
  fixes: QuickFix[]
  activeIndex: number
  position: { x: number; y: number }
  onSelect: (fix: QuickFix) => void
  onClose: () => void
  onMove: (nextIndex: number) => void
}

const ICONS: Record<string, LucideIcon> = {
  import: Import,
  remove: Trash2,
  convert: RefreshCw,
  ai: Wand2,
  extract: Code,
}

export default function QuickFixMenu({
  fixes, activeIndex, position, onSelect, onClose, onMove,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (fixes.length === 0) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const target = fixes[activeIndex] || fixes[0]
        if (!target?.disabled) onSelect(target)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const top = fixes[0]
        if (top && !top.disabled) onSelect(top)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        onMove(Math.min(activeIndex + 1, fixes.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onMove(Math.max(activeIndex - 1, 0))
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [fixes, activeIndex, onSelect, onClose, onMove])

  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nextLeft = position.x
    let nextTop = position.y
    if (rect.right > vw - 8) {
      nextLeft = Math.max(8, vw - rect.width - 8)
    }
    if (rect.bottom > vh - 8) {
      nextTop = Math.max(8, vh - rect.height - 8)
    }
    menuRef.current.style.left = `${nextLeft}px`
    menuRef.current.style.top = `${nextTop}px`
  }, [position.x, position.y, fixes.length])

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[1000] min-w-[280px] rounded-lg shadow-xl overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-elevated)',
      }}
    >
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          Quick Fixes
        </span>
      </div>
      {fixes.map((fix, i) => {
        const Icon = ICONS[fix.icon] || Lightbulb
        const isActive = i === activeIndex
        return (
          <button
            key={fix.id}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors"
            style={{
              backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
              color: fix.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
              opacity: fix.disabled ? 0.6 : 1,
              cursor: fix.disabled ? 'default' : 'pointer',
            }}
            onMouseEnter={() => onMove(i)}
            onClick={() => {
              if (!fix.disabled) onSelect(fix)
            }}
          >
            <Icon size={14} style={{ color: fix.kind === 'ai' ? 'var(--accent)' : 'var(--text-secondary)' }} />
            <span>{fix.title}</span>
          </button>
        )
      })}
    </motion.div>
  )
}
