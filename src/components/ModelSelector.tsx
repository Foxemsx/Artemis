import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { ChevronDown, Search, Check, Crown, Sparkles, Info, ExternalLink, AlertTriangle } from 'lucide-react'
import type { Provider, Model } from '../types'
import { formatTokenCount } from '../lib/formatters'

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

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  return `$${price.toFixed(2)}`
}

const DROPDOWN_WIDTH = 480
const MAX_SEARCH_RESULTS = 80
// Providers with more models than this are auto-collapsed on open
const AUTO_COLLAPSE_THRESHOLD = 15
// Max models rendered per expanded provider before "Show all" is needed
const PROVIDER_RENDER_LIMIT = 15

export default function ModelSelector({ providers, activeModel, onSelectModel }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [dropdownPosition, setDropdownPosition] = useState<{ left: number; top: number } | null>(null)
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set())
  // Track which providers the user has explicitly expanded to show all models
  const [expandedFullProviders, setExpandedFullProviders] = useState<Set<string>>(new Set())
  // Deferred content render: show dropdown shell instantly, populate list next frame
  const [contentReady, setContentReady] = useState(false)
  // Single shared tooltip state lifted from ModelItem
  const [tooltip, setTooltip] = useState<{ model: Model & { providerName?: string }; top: number; left: number } | null>(null)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Compute which providers should be auto-collapsed (large ones)
  const autoCollapsed = useMemo(() => {
    const set = new Set<string>()
    for (const p of providers) {
      if (p.models.length > AUTO_COLLAPSE_THRESHOLD) {
        // Don't auto-collapse if the active model is in this provider
        const hasActive = activeModel && p.models.some(m => m.id === activeModel.id)
        if (!hasActive) set.add(p.id)
      }
    }
    return set
  }, [providers, activeModel])

  useEffect(() => {
    if (!isOpen) {
      setContentReady(false)
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
      setTooltip(null)
      return
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      let left = rect.left
      if (left + DROPDOWN_WIDTH > viewportWidth - 16) {
        left = Math.max(16, rect.right - DROPDOWN_WIDTH)
      }
      setDropdownPosition({ left, top: rect.bottom + 8 })
    }

    // Reset state on open
    setCollapsedProviders(autoCollapsed)
    setExpandedFullProviders(new Set())

    // Defer content render to next frame so the dropdown shell appears instantly
    const raf = requestAnimationFrame(() => setContentReady(true))

    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
        setDebouncedQuery('')
        setTooltip(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      cancelAnimationFrame(raf)
    }
  }, [isOpen, autoCollapsed])

  useEffect(() => {
    if (isOpen && contentReady && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen, contentReady])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearchQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 80)
  }, [])

  const queryLower = debouncedQuery.toLowerCase()

  const filteredProviders = useMemo(() => {
    if (!queryLower) return providers
    return providers.map(provider => ({
      ...provider,
      models: provider.models.filter(model =>
        model.name.toLowerCase().includes(queryLower) ||
        model.id.toLowerCase().includes(queryLower) ||
        provider.name.toLowerCase().includes(queryLower)
      )
    })).filter(provider => provider.models.length > 0)
  }, [providers, queryLower])

  const allModels = useMemo(() =>
    filteredProviders.flatMap(p =>
      p.models.map(m => ({ ...m, providerName: p.name }))
    ),
    [filteredProviders]
  )

  const totalModelCount = useMemo(() =>
    providers.reduce((sum, p) => sum + p.models.length, 0),
    [providers]
  )

  const handleSelectModel = useCallback((model: Model) => {
    onSelectModel?.(model)
    setIsOpen(false)
    setSearchQuery('')
    setDebouncedQuery('')
    setTooltip(null)
  }, [onSelectModel])

  const toggleProvider = useCallback((providerId: string) => {
    setCollapsedProviders(prev => {
      const next = new Set(prev)
      if (next.has(providerId)) {
        next.delete(providerId)
      } else {
        next.add(providerId)
      }
      return next
    })
  }, [])

  const showAllForProvider = useCallback((providerId: string) => {
    setExpandedFullProviders(prev => {
      const next = new Set(prev)
      next.add(providerId)
      return next
    })
  }, [])

  // Shared tooltip handlers passed to ModelItem
  const handleModelHover = useCallback((model: Model & { providerName?: string }, el: HTMLElement) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    tooltipTimerRef.current = setTimeout(() => {
      const rect = el.getBoundingClientRect()
      const tooltipWidth = 280
      const tooltipGap = 8
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      let left = rect.right + tooltipGap
      let top = rect.top
      if (left + tooltipWidth > viewportWidth - 8) {
        left = rect.left - tooltipWidth - tooltipGap
      }
      if (top + 200 > viewportHeight) {
        top = Math.max(8, viewportHeight - 200)
      }
      setTooltip({ model, top, left })
    }, 500)
  }, [])

  const handleModelLeave = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    setTooltip(null)
  }, [])

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
            width: `min(${DROPDOWN_WIDTH}px, calc(100vw - 32px))`,
            maxWidth: `${DROPDOWN_WIDTH}px`,
            minWidth: '320px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {/* Search */}
          <div className="p-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Search size={14} style={{ color: 'var(--text-muted)' }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search models..."
                className="flex-1 bg-transparent border-none outline-none text-[12px]"
                style={{ color: 'var(--text-primary)' }}
              />
              {searchQuery && (
                <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {allModels.length} results
                </span>
              )}
            </div>
          </div>

          {/* Model List — single scroll area, no nested scrollbars */}
          <div
            className="overflow-y-auto"
            style={{ maxHeight: 'min(520px, calc(100vh - 200px))' }}
          >
            {!contentReady ? (
              <div className="px-4 py-8 text-center">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Loading models…</span>
              </div>
            ) : filteredProviders.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Search size={24} style={{ color: 'var(--text-muted)', opacity: 0.5, margin: '0 auto 8px' }} />
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No models found</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Try a different search term</p>
              </div>
            ) : debouncedQuery ? (
              <div className="py-1">
                {allModels.slice(0, MAX_SEARCH_RESULTS).map((model) => (
                  <ModelItem
                    key={`${model.providerId}-${model.id}`}
                    model={model}
                    isActive={model.id === activeModel?.id}
                    showProvider
                    onClick={() => handleSelectModel(model)}
                    onHover={handleModelHover}
                    onLeave={handleModelLeave}
                  />
                ))}
                {allModels.length > MAX_SEARCH_RESULTS && (
                  <div className="px-4 py-2 text-center">
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Showing {MAX_SEARCH_RESULTS} of {allModels.length} results — refine your search
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-1">
                {filteredProviders.map((provider) => (
                  <ProviderSection
                    key={provider.id}
                    provider={provider}
                    isCollapsed={collapsedProviders.has(provider.id)}
                    isActive={provider.models.some(m => m.id === activeModel?.id)}
                    activeModel={activeModel}
                    onToggle={() => toggleProvider(provider.id)}
                    onSelectModel={handleSelectModel}
                    renderLimit={expandedFullProviders.has(provider.id) ? Infinity : PROVIDER_RENDER_LIMIT}
                    onShowAll={() => showAllForProvider(provider.id)}
                    onModelHover={handleModelHover}
                    onModelLeave={handleModelLeave}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-4 py-2 flex items-center justify-between"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {totalModelCount} models · {providers.length} providers
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
              <a
                href="#"
                className="flex items-center gap-1 text-[10px] hover:opacity-80 transition-opacity cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.artemis.shell.openExternal('https://opencode.ai/dashboard') }}
              >
                <ExternalLink size={9} style={{ color: 'var(--accent)' }} />
                Dashboard
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Single shared tooltip — rendered at root level, not per-item */}
      {isOpen && tooltip && (tooltip.model.description || tooltip.model.contextWindow || tooltip.model.maxTokens || tooltip.model.pricing) && (
        <div
          className="fixed w-[280px] rounded-lg p-3 z-[9999] pointer-events-none"
          style={{
            top: tooltip.top,
            left: tooltip.left,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
            {tooltip.model.name}
          </p>

          {tooltip.model.description && (
            <p className="text-[10px] mb-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {tooltip.model.description}
            </p>
          )}

          {tooltip.model.supportsTools === false && (
            <div
              className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-md"
              style={{
                backgroundColor: 'rgba(251, 146, 60, 0.08)',
                border: '1px solid rgba(251, 146, 60, 0.15)',
              }}
            >
              <AlertTriangle size={10} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <span className="text-[9px] leading-tight" style={{ color: 'var(--warning)' }}>
                Not recommended for Agent — this model does not support tool calling
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            {tooltip.model.contextWindow && (
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Context Window</span>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {formatTokenCount(tooltip.model.contextWindow, 0)} tokens
                </span>
              </div>
            )}
            {tooltip.model.maxTokens && (
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Max Output</span>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {formatTokenCount(tooltip.model.maxTokens, 0)} tokens
                </span>
              </div>
            )}
            {tooltip.model.pricing && (
              <>
                <div
                  className="my-1.5"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Input price</span>
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--accent)' }}>
                    {formatPrice(tooltip.model.pricing.input)}/1M
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Output price</span>
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--accent)' }}>
                    {formatPrice(tooltip.model.pricing.output)}/1M
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

// ─── Provider Section Component ────────────────────────────────────────────────

interface ProviderSectionProps {
  provider: Provider
  isCollapsed: boolean
  isActive: boolean
  activeModel: Model | null
  onToggle: () => void
  onSelectModel: (model: Model) => void
  renderLimit: number
  onShowAll: () => void
  onModelHover: (model: Model & { providerName?: string }, el: HTMLElement) => void
  onModelLeave: () => void
}

const ProviderSection = memo(function ProviderSection({
  provider, isCollapsed, isActive, activeModel, onToggle, onSelectModel,
  renderLimit, onShowAll, onModelHover, onModelLeave,
}: ProviderSectionProps) {
  const groupedByCompany = useMemo(() =>
    provider.models.reduce((acc, model) => {
      const company = model.providerName || 'Other'
      if (!acc[company]) acc[company] = []
      acc[company].push(model)
      return acc
    }, {} as Record<string, typeof provider.models>),
    [provider.models]
  )

  const companyCount = Object.keys(groupedByCompany).length
  const totalModels = provider.models.length
  const isLimited = renderLimit < Infinity && totalModels > renderLimit

  // Flatten and limit the models to render
  const modelsToRender = useMemo(() => {
    const entries = Object.entries(groupedByCompany)
    if (!isLimited) return entries

    let remaining = renderLimit
    const result: [string, typeof provider.models][] = []
    for (const [company, models] of entries) {
      if (remaining <= 0) break
      if (models.length <= remaining) {
        result.push([company, models])
        remaining -= models.length
      } else {
        result.push([company, models.slice(0, remaining)])
        remaining = 0
      }
    }
    return result
  }, [groupedByCompany, renderLimit, isLimited])

  return (
    <div className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Provider Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between transition-colors duration-100"
        style={{
          backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
        }}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="transition-transform duration-150"
            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          >
            <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
              {provider.name}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {companyCount} model {companyCount === 1 ? 'company' : 'companies'} · {totalModels} models
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
          )}
        </div>
      </button>

      {/* Collapsible Content — NO inner scroll, outer container handles it */}
      {!isCollapsed && (
        <div className="pb-2">
          {modelsToRender.map(([company, companyModels]) => (
            <div key={company} className="mt-1">
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
                  onHover={onModelHover}
                  onLeave={onModelLeave}
                />
              ))}
            </div>
          ))}
          {isLimited && (
            <button
              onClick={onShowAll}
              className="w-full px-10 py-2 text-[10px] font-medium transition-colors duration-100 text-left cursor-pointer"
              style={{ color: 'var(--accent)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              Show all {totalModels} models…
            </button>
          )}
        </div>
      )}
    </div>
  )
})

// ─── Model Item Component ───────────────────────────────────────────────────────
// Lightweight: no internal state, tooltip is lifted to parent

const ModelItem = memo(function ModelItem({
  model,
  isActive,
  showProvider = false,
  onClick,
  onHover,
  onLeave,
}: {
  model: Model & { providerName?: string }
  isActive: boolean
  showProvider?: boolean
  onClick: () => void
  onHover: (model: Model & { providerName?: string }, el: HTMLElement) => void
  onLeave: () => void
}) {
  const tier = getModelTier(model)
  const itemRef = useRef<HTMLButtonElement>(null)

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
    if (itemRef.current) onHover(model, itemRef.current)
  }, [isActive, model, onHover])

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
    onLeave()
  }, [isActive, onLeave])

  return (
    <button
      ref={itemRef}
      onClick={onClick}
      className="w-full text-left px-10 pr-4 py-1.5 flex items-center justify-between transition-colors duration-75"
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
          {model.supportsTools === false && (
            <span
              className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold shrink-0 flex items-center gap-0.5"
              style={{ backgroundColor: 'rgba(251, 146, 60, 0.12)', color: 'var(--warning)' }}
              title="This model does not support tools"
            >
              <AlertTriangle size={8} />
              No Tools
            </span>
          )}
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
  )
})
