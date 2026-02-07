import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface MenuItemDef {
  label: string
  icon?: LucideIcon
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export interface MenuSeparator {
  separator: true
}

export type MenuItem = MenuItemDef | MenuSeparator

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right > vw) {
      ref.current.style.left = `${Math.max(4, x - rect.width)}px`
    }
    if (rect.bottom > vh) {
      ref.current.style.top = `${Math.max(4, y - rect.height)}px`
    }
  }, [x, y])

  return (
    <div
      ref={ref}
      className="fixed z-[9999] min-w-[180px] py-1 rounded-lg shadow-lg"
      style={{
        left: x,
        top: y,
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-elevated)',
      }}
    >
      {items.map((item, i) => {
        if ('separator' in item) {
          return (
            <div
              key={`sep-${i}`}
              className="my-1 mx-2"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            />
          )
        }

        const Icon = item.icon
        return (
          <button
            key={`${item.label}-${i}`}
            disabled={item.disabled}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left transition-colors duration-75"
            style={{
              color: item.danger ? 'var(--error)' : item.disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
              opacity: item.disabled ? 0.5 : 1,
              cursor: item.disabled ? 'default' : 'pointer',
            }}
            onMouseEnter={e => {
              if (!item.disabled) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {Icon && <Icon size={14} style={{ flexShrink: 0, opacity: 0.7 }} />}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] ml-4" style={{ color: 'var(--text-muted)' }}>
                {item.shortcut}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
