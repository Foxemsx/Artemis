import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Sparkles, Search, Check, Zap, Crown } from 'lucide-react'
import type { Provider, Model } from '../types'

interface Props {
  providers: Provider[]
  activeModel: Model | null
  onSelectModel?: (model: Model) => void
}

// Helper to categorize models
function getModelTier(modelId: string): 'free' | 'premium' {
  const lowerName = modelId.toLowerCase()
  // Free tier models
  if (lowerName.includes('nano') || lowerName.includes('free') || lowerName.includes('mini')) {
    return 'free'
  }
  return 'premium'
}

export default function ModelSelector({ providers, activeModel, onSelectModel }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Filter models based on search
  const filteredProviders = providers.map(provider => ({
    ...provider,
    models: provider.models.filter(model => 
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(provider => provider.models.length > 0)

  // Get all models for flat list when searching
  const allModels = filteredProviders.flatMap(p => 
    p.models.map(m => ({ ...m, providerName: p.name }))
  )

  const handleSelectModel = (model: Model) => {
    onSelectModel?.(model)
    setIsOpen(false)
    setSearchQuery('')
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-all duration-100 group"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-default)'
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)'
          e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
        }}
      >
        <Sparkles size={11} style={{ color: 'var(--accent)' }} />
        <span className="truncate max-w-[120px]">
          {activeModel ? activeModel.name : 'Select model'}
        </span>
        <ChevronDown 
          size={12} 
          className="transition-transform duration-150"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 w-72 rounded-lg overflow-hidden z-50"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-elevated)',
          }}
        >
          {/* Search */}
          <div 
            className="p-2"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-md"
              style={{ 
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <Search size={12} style={{ color: 'var(--text-muted)' }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="flex-1 bg-transparent border-none outline-none text-[11px]"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Model List */}
          <div className="max-h-[300px] overflow-y-auto py-1">
            {filteredProviders.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  No models found
                </p>
              </div>
            ) : searchQuery ? (
              // Flat list when searching
              allModels.map((model) => (
                <ModelItem
                  key={`${model.providerId}-${model.id}`}
                  model={model}
                  isActive={model.id === activeModel?.id}
                  showProvider
                  onClick={() => handleSelectModel(model)}
                />
              ))
            ) : (
              // Grouped by provider
              filteredProviders.map((provider) => (
                <div key={provider.id}>
                  <div
                    className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {provider.name}
                  </div>
                  {provider.models.map((model) => (
                    <ModelItem
                      key={model.id}
                      model={model}
                      isActive={model.id === activeModel?.id}
                      onClick={() => handleSelectModel(model)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer with hint */}
          <div
            className="px-3 py-2 flex items-center justify-between"
            style={{ 
              backgroundColor: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border-subtle)'
            }}
          >
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {allModels.length} models available
            </span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                <span className="px-1 py-0.5 rounded text-[8px]" style={{ backgroundColor: 'var(--success)', color: '#fff' }}>Free</span>
              </span>
              <span className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                <Crown size={9} style={{ color: 'var(--accent)' }} />
                Premium
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Individual model item component
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
  const tier = getModelTier(model.id)
  
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 flex items-center justify-between transition-colors duration-75 group"
      style={{
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
        backgroundColor: isActive ? 'var(--accent-glow)' : 'transparent',
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
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium truncate">{model.name}</span>
          {tier === 'free' && (
            <span 
              className="px-1 py-0.5 rounded text-[8px] font-medium shrink-0"
              style={{ backgroundColor: 'var(--success)', color: '#fff' }}
            >
              Free
            </span>
          )}
        </div>
        {showProvider && (
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {model.providerName}
          </span>
        )}
      </div>
      {isActive && (
        <Check size={12} style={{ color: 'var(--accent)' }} className="shrink-0" />
      )}
    </button>
  )
}
