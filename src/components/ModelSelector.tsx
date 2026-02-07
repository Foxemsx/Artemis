import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check, Crown, Sparkles, Info, ExternalLink } from 'lucide-react'
import type { Provider, Model } from '../types'

interface Props {
  providers: Provider[]
  activeModel: Model | null
  onSelectModel?: (model: Model) => void
}

function getModelTier(model: Model): 'free' | 'premium' {
  if (model.free) return 'free'
  const lower = model.id.toLowerCase()
  if (lower.includes('nano') || lower.includes('free') || lower.includes('mini')) return 'free'
  return 'premium'
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(0)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`
  return count.toString()
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  return `$${price.toFixed(2)}`
}

export default function ModelSelector({ providers, activeModel, onSelectModel }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownPosition, setDropdownPosition] = useState<{ left: number; top: number } | null>(null)
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return

    // Calculate dropdown position to keep it on screen
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownWidth = 360
      const viewportWidth = window.innerWidth

      // Default position: left-aligned with button
      let left = rect.left

      // If dropdown would overflow right edge, align to right of button
      if (left + dropdownWidth > viewportWidth - 16) {
        left = Math.max(16, rect.right - dropdownWidth)
      }

      setDropdownPosition({
        left,
        top: rect.bottom + 8
      })
    }

    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const filteredProviders = providers.map(provider => ({
    ...provider,
    models: provider.models.filter(model =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(provider => provider.models.length > 0)

  const allModels = filteredProviders.flatMap(p =>
    p.models.map(m => ({ ...m, providerName: p.name }))
  )

  const handleSelectModel = (model: Model) => {
    onSelectModel?.(model)
    setIsOpen(false)
    setSearchQuery('')
  }

  const toggleProvider = (providerId: string) => {
    setCollapsedProviders(prev => {
      const next = new Set(prev)
      if (next.has(providerId)) {
        next.delete(providerId)
      } else {
        next.add(providerId)
      }
      return next
    })
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 h-[26px] px-2.5 rounded-lg text-[11px] font-medium transition-all duration-200"
        style={{
          backgroundColor: isOpen ? 'var(--bg-hover)' : 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          border: `1px solid ${isOpen ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'var(--border-default)'
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'var(--border-subtle)'
            e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
          }
        }}
      >
        <Sparkles size={11} style={{ color: 'var(--accent)' }} />
        <span className="truncate max-w-[110px]">
          {activeModel ? activeModel.name : 'Select model'}
        </span>
        <ChevronDown
          size={11}
          className="transition-transform duration-200"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            color: 'var(--text-muted)',
          }}
        />
      </button>

      {isOpen && dropdownPosition && (
        <div
          className="fixed rounded-xl overflow-hidden z-50"
          style={{
            left: `${dropdownPosition.left}px`,
            top: `${dropdownPosition.top}px`,
            width: 'min(360px, calc(100vw - 32px))',
            maxWidth: '360px',
            minWidth: '280px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {/* Search */}
          <div className="p-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-150"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Search size={13} style={{ color: 'var(--text-muted)' }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="flex-1 bg-transparent border-none outline-none text-[12px]"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Model List */}
          <div className="max-h-[340px] overflow-y-auto">
            {filteredProviders.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Search size={24} style={{ color: 'var(--text-muted)', opacity: 0.5, margin: '0 auto 8px' }} />
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No models found</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Try a different search term</p>
              </div>
            ) : searchQuery ? (
              <div className="py-2">
                {allModels.map((model) => (
                  <ModelItem
                    key={`${model.providerId}-${model.id}`}
                    model={model}
                    isActive={model.id === activeModel?.id}
                    showProvider
                    onClick={() => handleSelectModel(model)}
                  />
                ))}
              </div>
            ) : (
              <div className="py-1">
                {filteredProviders.map((provider) => {
                  const isCollapsed = collapsedProviders.has(provider.id)
                  const isProviderActive = provider.models.some(m => m.id === activeModel?.id)

                  return (
                    <ProviderSection
                      key={provider.id}
                      provider={provider}
                      isCollapsed={isCollapsed}
                      isActive={isProviderActive}
                      activeModel={activeModel}
                      onToggle={() => toggleProvider(provider.id)}
                      onSelectModel={handleSelectModel}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Dashboard Info */}
          <div
            className="px-4 py-2.5"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <a
              href="https://opencode.ai/dashboard/models"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[10px] hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={11} style={{ color: 'var(--accent)' }} />
              <span>Enable more models in your OpenCode dashboard</span>
            </a>
          </div>

          {/* Footer */}
          <div
            className="px-4 py-2.5 flex items-center justify-between"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {allModels.length} models across {filteredProviders.length} providers
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span
                  className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold"
                  style={{ backgroundColor: 'rgba(74, 222, 128, 0.12)', color: 'var(--success)' }}
                >
                  Free
                </span>
              </span>
              <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <Crown size={10} style={{ color: 'var(--accent)' }} />
                Premium
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Provider Section Component ────────────────────────────────────────────────

interface ProviderSectionProps {
  provider: Provider
  isCollapsed: boolean
  isActive: boolean
  activeModel: Model | null
  onToggle: () => void
  onSelectModel: (model: Model) => void
}

function ProviderSection({ provider, isCollapsed, isActive, activeModel, onToggle, onSelectModel }: ProviderSectionProps) {
  // Group models by company within each provider
  const groupedByCompany = provider.models.reduce((acc, model) => {
    const company = model.providerName || 'Other'
    if (!acc[company]) acc[company] = []
    acc[company].push(model)
    return acc
  }, {} as Record<string, typeof provider.models>)

  const companyCount = Object.keys(groupedByCompany).length

  return (
    <div className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Provider Header - Clickable to collapse/expand */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between transition-all duration-200"
        style={{
          backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="transition-transform duration-200"
            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          >
            <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
              {provider.name}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {companyCount} model {companyCount === 1 ? 'company' : 'companies'} · {provider.models.length} models
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Active indicator */}
          {isActive && (
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--accent)' }}
            />
          )}
        </div>
      </button>

      {/* Collapsible Content */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isCollapsed ? '0px' : '1000px',
          opacity: isCollapsed ? 0 : 1,
        }}
      >
        <div className="pb-2">
          {Object.entries(groupedByCompany).map(([company, companyModels]) => (
            <div key={company} className="mt-1">
              {/* Company Header */}
              <div
                className="px-10 py-1 text-[9px] font-medium uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                {company}
              </div>
              {companyModels.map((model) => (
                <ModelItem
                  key={model.id}
                  model={model}
                  isActive={model.id === activeModel?.id}
                  onClick={() => onSelectModel(model)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Model Item Component ───────────────────────────────────────────────────────

function ModelItem({
  model,
  isActive,
  showProvider = false,
  onClick
}: {
  model: Model & { providerName?: string }
  isActive: boolean
  showProvider?: boolean
  onClick: () => void
}) {
  const tier = getModelTier(model)
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemRef = useRef<HTMLButtonElement>(null)

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
    tooltipTimer.current = setTimeout(() => {
      if (itemRef.current) {
        const rect = itemRef.current.getBoundingClientRect()
        const tooltipWidth = 256
        const tooltipGap = 8
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        // Default: position to the right of the item
        let left = rect.right + tooltipGap
        let top = rect.top

        // If tooltip would overflow right edge, position to the left instead
        if (left + tooltipWidth > viewportWidth - 8) {
          left = rect.left - tooltipWidth - tooltipGap
        }

        // If tooltip would overflow bottom, shift up
        if (top + 200 > viewportHeight) {
          top = Math.max(8, viewportHeight - 200)
        }

        setTooltipPos({ top, left })
      }
      setShowTooltip(true)
    }, 400)
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    setShowTooltip(false)
    setTooltipPos(null)
  }

  return (
    <div className="relative">
      <button
        ref={itemRef}
        onClick={onClick}
        className="w-full text-left px-10 pr-4 py-2 flex items-center justify-between transition-all duration-150"
        style={{
          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
          backgroundColor: isActive ? 'var(--accent-glow)' : 'transparent',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium truncate">{model.name}</span>
            {tier === 'free' && (
              <span
                className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold shrink-0"
                style={{ backgroundColor: 'rgba(74, 222, 128, 0.12)', color: 'var(--success)' }}
              >
                Free
              </span>
            )}
            {(model.contextWindow || model.pricing) && (
              <Info size={9} style={{ color: 'var(--text-muted)', opacity: 0.4 }} className="shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {showProvider && model.providerName && (
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {model.providerName}
              </span>
            )}
            <span className="text-[9px] font-mono truncate" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              {model.id}
            </span>
          </div>
        </div>
        {isActive && (
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 ml-2"
            style={{ backgroundColor: 'var(--accent)', color: '#000' }}
          >
            <Check size={11} strokeWidth={3} />
          </div>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && tooltipPos && (model.description || model.contextWindow || model.maxTokens || model.pricing) && (
        <div
          className="fixed w-64 rounded-lg p-3 z-[9999] pointer-events-none"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
            {model.name}
          </p>

          {model.description && (
            <p className="text-[10px] mb-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {model.description}
            </p>
          )}

          <div className="space-y-1.5">
            {model.contextWindow && (
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Context Window</span>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {formatTokenCount(model.contextWindow)} tokens
                </span>
              </div>
            )}
            {model.maxTokens && (
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Max Output</span>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {formatTokenCount(model.maxTokens)} tokens
                </span>
              </div>
            )}
            {model.pricing && (
              <>
                <div
                  className="my-1.5"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Input price</span>
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--accent)' }}>
                    {formatPrice(model.pricing.input)}/1M
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Output price</span>
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--accent)' }}>
                    {formatPrice(model.pricing.output)}/1M
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
