import { useState, useEffect } from 'react'
import { Key, Shield, ExternalLink, Check, X, Loader2, Zap, Server, Sparkles, Palette, Settings2, Info, Volume2, Bell, Play, RotateCcw, Keyboard, ChevronDown, FileText, FolderOpen, Search, Terminal, GitBranch, Code, FolderPlus, Trash2, Move, Edit3, MessageSquare, Layout, Eye, Gamepad2, Circle, Globe } from 'lucide-react'
import type { Theme, AIProvider } from '../types'
import { type SoundSettings, DEFAULT_SOUND_SETTINGS, previewSound, type SoundType } from '../lib/sounds'
import { PROVIDER_REGISTRY, type ProviderInfo } from '../lib/zenClient'
import { invalidateInlineCompletionConfigCache } from './Editor'
import modelsConfig from '../lib/models.json'
import { getProviderIcon } from './ProviderIcons'

interface KeyBind {
  id: string
  label: string
  description: string
  defaultKey: string
  currentKey: string
  category: 'most-used' | 'navigation' | 'editor' | 'chat'
}

const KEYBIND_CATEGORIES: { id: string; label: string; description: string }[] = [
  { id: 'most-used', label: 'Most Useful', description: 'Frequently used shortcuts' },
  { id: 'navigation', label: 'Navigation', description: 'Switch between views and panels' },
  { id: 'editor', label: 'Editor', description: 'File editing and tab management' },
  { id: 'chat', label: 'Chat & AI', description: 'AI agent and chat controls' },
]

const DEFAULT_KEYBINDS: KeyBind[] = [
  { id: 'commandPalette', label: 'Command Palette', description: 'Open the command palette', defaultKey: 'Ctrl+K', currentKey: 'Ctrl+K', category: 'most-used' },
  { id: 'saveFile', label: 'Save File', description: 'Save the current file', defaultKey: 'Ctrl+S', currentKey: 'Ctrl+S', category: 'most-used' },
  { id: 'search', label: 'Search Files', description: 'Open file search', defaultKey: 'Ctrl+Shift+F', currentKey: 'Ctrl+Shift+F', category: 'most-used' },
  { id: 'quickSearch', label: 'Quick Search', description: 'Quick file search', defaultKey: 'Ctrl+T', currentKey: 'Ctrl+T', category: 'most-used' },
  { id: 'openProject', label: 'Open Project', description: 'Open a folder as a project', defaultKey: 'Ctrl+O', currentKey: 'Ctrl+O', category: 'most-used' },
  { id: 'settings', label: 'Settings', description: 'Open settings', defaultKey: 'Ctrl+,', currentKey: 'Ctrl+,', category: 'most-used' },
  { id: 'toggleSidebar', label: 'Toggle Sidebar', description: 'Show/hide the sidebar', defaultKey: 'Ctrl+B', currentKey: 'Ctrl+B', category: 'navigation' },
  { id: 'toggleChat', label: 'Toggle Chat', description: 'Show/hide the chat panel', defaultKey: 'Ctrl+J', currentKey: 'Ctrl+J', category: 'navigation' },
  { id: 'showExplorer', label: 'Show Explorer', description: 'Switch to file explorer view', defaultKey: 'Ctrl+Shift+E', currentKey: 'Ctrl+Shift+E', category: 'navigation' },
  { id: 'showGit', label: 'Source Control', description: 'Switch to source control view', defaultKey: 'Ctrl+Shift+G', currentKey: 'Ctrl+Shift+G', category: 'navigation' },
  { id: 'showProblems', label: 'Show Problems', description: 'Switch to problems panel', defaultKey: 'Ctrl+Shift+M', currentKey: 'Ctrl+Shift+M', category: 'navigation' },
  { id: 'newTerminal', label: 'New Terminal', description: 'Open a new terminal', defaultKey: 'Ctrl+`', currentKey: 'Ctrl+`', category: 'editor' },
  { id: 'closeTab', label: 'Close Tab', description: 'Close the active tab', defaultKey: 'Ctrl+W', currentKey: 'Ctrl+W', category: 'editor' },
  { id: 'focusChat', label: 'Focus Chat', description: 'Focus the chat input', defaultKey: 'Ctrl+L', currentKey: 'Ctrl+L', category: 'chat' },
  { id: 'newSession', label: 'New Session', description: 'Create a new chat session', defaultKey: 'Ctrl+N', currentKey: 'Ctrl+N', category: 'chat' },
  { id: 'clearChat', label: 'Clear Chat', description: 'Clear current chat messages', defaultKey: 'Ctrl+Shift+L', currentKey: 'Ctrl+Shift+L', category: 'chat' },
]

type SettingsCategory = 'providers' | 'appearance' | 'sounds' | 'discord' | 'general' | 'completion' | 'sourcecontrol' | 'rules' | 'about'

interface ProviderConfig {
  key: string
  status: 'idle' | 'saving' | 'saved' | 'error'
  errorMessage: string
  isConfigured: boolean
}

interface Props {
  theme: Theme
  onToggleTheme: () => void
  onSetTheme: (theme: Theme) => void
  apiKeys: Record<AIProvider, { key: string; isConfigured: boolean }>
  onSetApiKey: (provider: AIProvider, key: string) => Promise<boolean>
  soundSettings: SoundSettings
  onSetSoundSettings: (settings: SoundSettings) => void
}

// Theme metadata for the appearance section
const THEME_OPTIONS: { id: Theme; name: string; description: string; colors: { bg: string; accent: string; text: string; card: string } }[] = [
  { id: 'dark', name: 'Midnight', description: 'Elegant black with gold accents', colors: { bg: '#0a0a0a', accent: '#d4a853', text: '#f0f0f0', card: '#1a1a1a' } },
  { id: 'light', name: 'Daylight', description: 'Clean and bright workspace', colors: { bg: '#fafafa', accent: '#b8860b', text: '#1a1a1a', card: '#ffffff' } },
  { id: 'cyberpunk', name: 'Cyberpunk', description: 'Neon pink on deep purple', colors: { bg: '#0b0014', accent: '#ff2ecb', text: '#e0d0ff', card: '#1a0030' } },
  { id: 'nord', name: 'Nord', description: 'Arctic blue-gray palette', colors: { bg: '#2e3440', accent: '#88c0d0', text: '#eceff4', card: '#434c5e' } },
  { id: 'monokai', name: 'Monokai', description: 'Classic editor warm tones', colors: { bg: '#272822', accent: '#f92672', text: '#f8f8f2', card: '#35362f' } },
  { id: 'solarized', name: 'Solarized', description: 'Precision-crafted dark scheme', colors: { bg: '#002b36', accent: '#b58900', text: '#fdf6e3', card: '#0a3d49' } },
  { id: 'dracula', name: 'Dracula', description: 'Purple-tinted dark theme', colors: { bg: '#282a36', accent: '#bd93f9', text: '#f8f8f2', card: '#343746' } },
  { id: 'rosepine', name: 'Rose Pine', description: 'Muted rose and soft gold', colors: { bg: '#191724', accent: '#ebbcba', text: '#e0def4', card: '#26233a' } },
  { id: 'pine', name: 'Pine', description: 'Forest browns with green accents', colors: { bg: '#1c1917', accent: '#65a30d', text: '#fafaf9', card: '#44403c' } },
  { id: 'catppuccin', name: 'Catppuccin', description: 'Soft pastel creamy palette', colors: { bg: '#1e1e2e', accent: '#f5c2e7', text: '#cdd6f4', card: '#45475a' } },
  { id: 'gruvbox', name: 'Gruvbox', description: 'Warm retro brown and olive', colors: { bg: '#282828', accent: '#fabd2f', text: '#ebdbb2', card: '#3c3836' } },
  { id: 'materialocean', name: 'Material Ocean', description: 'Deep blue-teal oceanic', colors: { bg: '#0f1419', accent: '#22d3ee', text: '#e2e8f0', card: '#1e293b' } },
  { id: 'everforest', name: 'Everforest', description: 'Sage green nature palette', colors: { bg: '#2b3339', accent: '#a7c080', text: '#d3c6aa', card: '#3a454a' } },
  { id: 'sakura', name: 'Sakura', description: 'Cherry blossom pink and gold', colors: { bg: '#2a2527', accent: '#ffb7c5', text: '#f5e6d3', card: '#453a3d' } },
  { id: 'beach', name: 'Beach', description: 'Sandy shores and ocean breeze', colors: { bg: '#fef3e2', accent: '#0ea5e9', text: '#5d4e37', card: '#fffbf0' } },
  { id: 'space', name: 'Space', description: 'Deep cosmic purple and stars', colors: { bg: '#0a0a12', accent: '#a855f7', text: '#e8e8ff', card: '#1e1e33' } },
]

const SIDEBAR_ITEMS: { id: SettingsCategory; label: string; icon: typeof Palette }[] = [
  { id: 'providers', label: 'Providers', icon: Server },
  { id: 'completion', label: 'Code Completion', icon: Sparkles },
  { id: 'sourcecontrol', label: 'Source Control', icon: GitBranch },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'sounds', label: 'Sounds & Alerts', icon: Volume2 },
  { id: 'discord', label: 'Discord RPC', icon: Gamepad2 },
  { id: 'rules', label: 'Agent Rules', icon: FileText },
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'about', label: 'About', icon: Info },
]

export default function Settings({ theme, onSetTheme, apiKeys, onSetApiKey, soundSettings, onSetSoundSettings }: Props) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('providers')
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>(() => {
    const init: Record<string, ProviderConfig> = {}
    for (const p of PROVIDER_REGISTRY) {
      init[p.id] = { key: '', status: 'idle', errorMessage: '', isConfigured: (apiKeys as any)[p.id]?.isConfigured || false }
    }
    return init
  })

  const handleSaveKey = async (provider: AIProvider) => {
    const config = providers[provider]
    // Ollama doesn't require a key — allow empty key for connectivity test
    if (provider !== 'ollama' && !config.key.trim()) return
    setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'saving', errorMessage: '' } }))
    try {
      const success = await onSetApiKey(provider, config.key.trim())
      if (success) {
        setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'saved', key: '', isConfigured: true } }))
        setTimeout(() => { setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'idle' } })) }, 2000)
      } else {
        const errMsg = provider === 'ollama'
          ? 'Could not connect to Ollama. Make sure it is running and the base URL is correct.'
          : 'Invalid API key. Please check and try again.'
        setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'error', errorMessage: errMsg } }))
      }
    } catch (err: any) {
      setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'error', errorMessage: err.message || 'Failed to save API key' } }))
    }
  }

  const updateProviderKey = (provider: AIProvider, key: string) => {
    setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], key } }))
  }

  return (
    <div className="h-full flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <div
        className="w-[200px] shrink-0 h-full flex flex-col py-6 px-3"
        style={{ backgroundColor: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-subtle)' }}
      >
        <h2 className="text-[13px] font-bold px-3 mb-5 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h2>
        <nav className="space-y-1">
          {SIDEBAR_ITEMS.map(item => {
            const Icon = item.icon
            const isActive = activeCategory === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveCategory(item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-150"
                style={{
                  backgroundColor: isActive ? 'var(--accent-glow)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  border: isActive ? '1px solid rgba(var(--accent-rgb), 0.12)' : '1px solid transparent',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <Icon size={15} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ─── Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl py-8 px-10">
          {activeCategory === 'providers' && (
            <ProvidersSection
              providers={providers}
              onKeyChange={updateProviderKey}
              onSave={handleSaveKey}
            />
          )}
          {activeCategory === 'completion' && (
            <InlineCompletionSection
              apiKeys={apiKeys}
              onGoToProviders={() => setActiveCategory('providers')}
            />
          )}
          {activeCategory === 'sourcecontrol' && (
            <SourceControlSettingsSection
              apiKeys={apiKeys}
              onGoToProviders={() => setActiveCategory('providers')}
            />
          )}
          {activeCategory === 'appearance' && (
            <AppearanceSection theme={theme} onSetTheme={onSetTheme} />
          )}
          {activeCategory === 'sounds' && (
            <SoundsSection settings={soundSettings} onChange={onSetSoundSettings} />
          )}
          {activeCategory === 'discord' && <DiscordRPCSection />}
          {activeCategory === 'general' && <GeneralSection />}
          {activeCategory === 'rules' && <RulesSection />}
          {activeCategory === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

// ─── Key Security Info ──────────────────────────────────────────────────────

function KeySecurityInfo() {
  const [storeDir, setStoreDir] = useState<string>('')
  const [isEncrypted, setIsEncrypted] = useState<boolean>(false)

  useEffect(() => {
    window.artemis.store.getDir().then(setStoreDir).catch(() => {})
    window.artemis.store.isEncrypted().then(setIsEncrypted).catch(() => {})
  }, [])

  return (
    <div className="mt-6 rounded-xl p-5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(74, 222, 128, 0.06)', border: '1px solid rgba(74, 222, 128, 0.1)' }}>
          <Shield size={18} style={{ color: 'var(--success)' }} />
        </div>
        <div>
          <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Your keys stay local {isEncrypted ? '& encrypted' : ''}
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {isEncrypted
              ? 'API keys are encrypted at rest using your OS keychain (Windows DPAPI / macOS Keychain / Linux Secret Service). All API calls go directly from your computer through Electron\u2019s main process \u2014 we never see or transmit your keys.'
              : 'API keys are stored on your machine. Encryption is unavailable in this environment. All API calls go directly from your computer \u2014 we never see or transmit your keys.'}
          </p>
          {storeDir && (
            <p className="text-[10px] mt-2 font-mono" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
              Storage: {storeDir}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Ollama Base URL Input ───────────────────────────────────────────────────

function OllamaBaseUrlInput() {
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434/v1')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.artemis.store.get('baseUrl:ollama').then((val: any) => {
      if (val && typeof val === 'string') setBaseUrl(val)
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    const url = baseUrl.trim().replace(/\/+$/, '')
    await window.artemis.store.set('baseUrl:ollama', url)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mb-3">
      <label className="text-[10px] font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>
        Base URL
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434/v1"
          className="flex-1 px-3 py-1.5 rounded-lg text-[11px] outline-none transition-all"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)' }}
        />
        <button
          onClick={handleSave}
          className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
          style={{
            backgroundColor: saved ? 'rgba(74, 222, 128, 0.12)' : 'var(--accent-glow)',
            color: saved ? '#4ade80' : 'var(--accent)',
            border: saved ? '1px solid rgba(74, 222, 128, 0.25)' : '1px solid rgba(var(--accent-rgb), 0.12)',
          }}
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── Providers Section ──────────────────────────────────────────────────────

function ProvidersSection({ providers, onKeyChange, onSave }: {
  providers: Record<string, ProviderConfig>
  onKeyChange: (provider: AIProvider, key: string) => void
  onSave: (provider: AIProvider) => void
}) {
  const hasAny = Object.values(providers).some(p => p.isConfigured)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <>
      <SectionHeader title="AI Providers" subtitle="Connect one or more AI providers to start using Artemis. Each provider gives access to different models." />

      {!hasAny && (
        <div className="mb-5 flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.06)', border: '1px solid rgba(var(--accent-rgb), 0.15)' }}>
          <Zap size={16} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <p className="text-[12px] font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Get started</p>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Add at least one API key below. <strong style={{ color: 'var(--text-secondary)' }}>Groq</strong> and <strong style={{ color: 'var(--text-secondary)' }}>Zen</strong> offer free models. <strong style={{ color: 'var(--text-secondary)' }}>Ollama</strong> runs locally with no key needed.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {PROVIDER_REGISTRY.map(info => {
          const config = providers[info.id] || { key: '', status: 'idle' as const, errorMessage: '', isConfigured: false }
          const isExpanded = expandedId === info.id
          const ProvIcon = getProviderIcon(info.id)

          return (
            <div
              key={info.id}
              className="rounded-xl overflow-hidden transition-all duration-200"
              style={{ backgroundColor: 'var(--bg-card)', border: config.isConfigured ? '1px solid rgba(74, 222, 128, 0.2)' : '1px solid var(--border-subtle)' }}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : info.id)}
                className="w-full flex items-center justify-between p-4 text-left transition-colors duration-150"
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(var(--accent-rgb), 0.12)' }}>
                    <ProvIcon size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{info.name}</p>
                      {config.isConfigured && (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)' }}>
                          <Check size={9} style={{ color: '#4ade80' }} />
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{info.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.artemis.shell.openExternal(info.docsUrl) }}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.backgroundColor = 'var(--bg-elevated)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                    title={`Open ${info.name} docs`}
                  >
                    <Globe size={13} />
                  </a>
                  <ChevronDown
                    size={14}
                    style={{
                      color: 'var(--text-muted)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </div>
              </button>

              {/* Expanded form */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="mb-3" />

                  {/* Custom Base URL (Ollama) */}
                  {info.customBaseUrl && (
                    <OllamaBaseUrlInput />
                  )}

                  <ProviderKeyInput
                    name={info.name}
                    description={info.description}
                    icon={<ProvIcon size={18} />}
                    placeholder={info.placeholder}
                    helpUrl={info.helpUrl}
                    config={config}
                    onKeyChange={k => onKeyChange(info.id, k)}
                    onSave={() => onSave(info.id)}
                    noKeyRequired={info.id === 'ollama'}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <KeySecurityInfo />
    </>
  )
}

// ─── Appearance Section ─────────────────────────────────────────────────────

function AppearanceSection({ theme, onSetTheme }: { theme: Theme; onSetTheme: (t: Theme) => void }) {
  return (
    <>
      <SectionHeader title="Appearance" subtitle="Choose a theme for your workspace. All themes are designed for extended coding sessions." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {THEME_OPTIONS.map(t => {
          const isActive = theme === t.id
          return (
            <button
              key={t.id}
              onClick={() => onSetTheme(t.id)}
              className="rounded-xl text-left transition-all duration-200 group"
              style={{
                border: isActive ? '2px solid var(--accent)' : '2px solid var(--border-subtle)',
                boxShadow: isActive ? '0 0 20px rgba(var(--accent-rgb), 0.15)' : 'none',
              }}
            >
              {/* Color preview bar */}
              <div className="rounded-t-[10px] h-20 relative overflow-hidden" style={{ backgroundColor: t.colors.bg }}>
                <div className="absolute inset-x-0 bottom-0 h-10 flex items-end gap-1.5 px-3 pb-2">
                  <div className="h-3 w-16 rounded-sm" style={{ backgroundColor: t.colors.card }} />
                  <div className="h-3 flex-1 rounded-sm" style={{ backgroundColor: t.colors.card }}>
                    <div className="h-1 w-3/4 mt-1 ml-1.5 rounded-full" style={{ backgroundColor: t.colors.accent, opacity: 0.6 }} />
                  </div>
                </div>
                {/* Accent dot */}
                <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full" style={{ backgroundColor: t.colors.accent }} />
                {/* Text preview */}
                <div className="absolute top-3 left-3 space-y-1">
                  <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: t.colors.text, opacity: 0.5 }} />
                  <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: t.colors.text, opacity: 0.3 }} />
                </div>
              </div>

              {/* Label */}
              <div className="px-3.5 py-3 rounded-b-[10px]" style={{ backgroundColor: 'var(--bg-card)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                  </div>
                  {isActive && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>
                      <Check size={11} strokeWidth={3} style={{ color: '#000' }} />
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

// ─── Sounds & Notifications Section ─────────────────────────────────────────

function SoundsSection({ settings, onChange }: { settings: SoundSettings; onChange: (s: SoundSettings) => void }) {
  const update = (partial: Partial<SoundSettings>) => onChange({ ...settings, ...partial })

  const SOUND_TOGGLES: { key: keyof SoundSettings; label: string; desc: string; soundType: SoundType }[] = [
    { key: 'taskDone', label: 'Task Complete', desc: 'When the AI agent finishes responding', soundType: 'task-done' },
    { key: 'actionRequired', label: 'Action Required', desc: 'When user approval is needed', soundType: 'action-required' },
    { key: 'errorSound', label: 'Error', desc: 'When something goes wrong', soundType: 'error' },
    { key: 'messageSent', label: 'Message Sent', desc: 'When you send a message', soundType: 'message-sent' },
  ]

  return (
    <>
      <SectionHeader title="Sounds & Alerts" subtitle="Configure audio feedback and desktop notifications." />

      {/* Master toggle */}
      <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(var(--accent-rgb), 0.12)' }}>
              <Volume2 size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Enable Sounds</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Master toggle for all audio feedback</p>
            </div>
          </div>
          <button
            onClick={() => update({ enabled: !settings.enabled })}
            className="w-10 h-5.5 rounded-full relative transition-all duration-200 shrink-0"
            style={{
              backgroundColor: settings.enabled ? 'var(--accent)' : 'var(--bg-elevated)',
              border: `1px solid ${settings.enabled ? 'var(--accent)' : 'var(--border-default)'}`,
              width: 40, height: 22,
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
              style={{
                backgroundColor: settings.enabled ? '#000' : 'var(--text-muted)',
                left: settings.enabled ? 20 : 2,
              }}
            />
          </button>
        </div>

        {/* Volume slider */}
        {settings.enabled && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Volume</span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{Math.round(settings.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(settings.volume * 100)}
              onChange={e => update({ volume: Number(e.target.value) / 100 })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ backgroundColor: 'var(--bg-elevated)', accentColor: 'var(--accent)' }}
            />
          </div>
        )}
      </div>

      {/* Individual sound toggles */}
      {settings.enabled && (
        <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[12px] font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Sound Events</p>
          <div className="space-y-4">
            {SOUND_TOGGLES.map(toggle => (
              <div key={toggle.key} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>{toggle.label}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{toggle.desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => previewSound(toggle.soundType, settings.volume)}
                    className="p-1 rounded-md transition-all duration-100"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                    title={`Preview ${toggle.label} sound`}
                  >
                    <Play size={11} />
                  </button>
                  <button
                    onClick={() => update({ [toggle.key]: !settings[toggle.key] })}
                    className="w-9 h-5 rounded-full relative transition-all duration-200"
                    style={{
                      backgroundColor: settings[toggle.key] ? 'var(--accent)' : 'var(--bg-elevated)',
                      border: `1px solid ${settings[toggle.key] ? 'var(--accent)' : 'var(--border-default)'}`,
                    }}
                  >
                    <div
                      className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200"
                      style={{
                        backgroundColor: settings[toggle.key] ? '#000' : 'var(--text-muted)',
                        left: settings[toggle.key] ? 17 : 2,
                      }}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(96, 165, 250, 0.06)', border: '1px solid rgba(96, 165, 250, 0.1)' }}>
              <Bell size={18} style={{ color: 'rgb(96, 165, 250)' }} />
            </div>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Desktop Notifications</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Show system notifications when tasks complete or need attention</p>
            </div>
          </div>
          <button
            onClick={() => update({ notificationsEnabled: !settings.notificationsEnabled })}
            className="w-10 rounded-full relative transition-all duration-200 shrink-0"
            style={{
              backgroundColor: settings.notificationsEnabled ? 'var(--accent)' : 'var(--bg-elevated)',
              border: `1px solid ${settings.notificationsEnabled ? 'var(--accent)' : 'var(--border-default)'}`,
              width: 40, height: 22,
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
              style={{
                backgroundColor: settings.notificationsEnabled ? '#000' : 'var(--text-muted)',
                left: settings.notificationsEnabled ? 20 : 2,
              }}
            />
          </button>
        </div>
      </div>
    </>
  )
}

// ─── General Section ────────────────────────────────────────────────────────

function GeneralSection() {
  const [keybinds, setKeybinds] = useState<KeyBind[]>(DEFAULT_KEYBINDS.map(k => ({ ...k })))
  const [recordingId, setRecordingId] = useState<string | null>(null)

  useEffect(() => {
    window.artemis.store.get('keybinds').then((saved: any) => {
      if (saved && typeof saved === 'object') {
        setKeybinds(prev => prev.map(kb => ({
          ...kb,
          currentKey: saved[kb.id] || kb.defaultKey,
        })))
      }
    }).catch(() => {})
  }, [])

  const saveKeybinds = (updated: KeyBind[]) => {
    const map: Record<string, string> = {}
    for (const kb of updated) {
      map[kb.id] = kb.currentKey
    }
    window.artemis.store.set('keybinds', map).catch(() => {})
    window.dispatchEvent(new CustomEvent('artemis:keybinds-changed', { detail: map }))
  }

  useEffect(() => {
    if (!recordingId) return

    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
      if (e.shiftKey) parts.push('Shift')
      if (e.altKey) parts.push('Alt')

      let key = e.key
      if (key === ' ') key = 'Space'
      else if (key === '`') key = '`'
      else if (key.length === 1) key = key.toUpperCase()
      else if (key === 'Escape') {
        setRecordingId(null)
        return
      }
      parts.push(key)

      const combo = parts.join('+')
      setKeybinds(prev => {
        const updated = prev.map(kb =>
          kb.id === recordingId ? { ...kb, currentKey: combo } : kb
        )
        saveKeybinds(updated)
        return updated
      })
      setRecordingId(null)
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recordingId])

  const resetKeybind = (id: string) => {
    setKeybinds(prev => {
      const updated = prev.map(kb =>
        kb.id === id ? { ...kb, currentKey: kb.defaultKey } : kb
      )
      saveKeybinds(updated)
      return updated
    })
  }

  const resetAll = () => {
    const updated = DEFAULT_KEYBINDS.map(k => ({ ...k }))
    setKeybinds(updated)
    saveKeybinds(updated)
  }

  return (
    <>
      <SectionHeader title="General" subtitle="Keyboard shortcuts and general preferences." />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Keyboard size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Keyboard Shortcuts</span>
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-100"
          style={{ color: 'var(--text-muted)', backgroundColor: 'transparent' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <RotateCcw size={10} />
          Reset All
        </button>
      </div>

      <div className="space-y-4">
        {KEYBIND_CATEGORIES.map(cat => {
          const categoryBinds = keybinds.filter(kb => kb.category === cat.id)
          if (categoryBinds.length === 0) return null
          return (
            <div key={cat.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <div className="px-5 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'rgba(var(--accent-rgb), 0.03)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>{cat.label}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{cat.description}</p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {categoryBinds.map(kb => {
                  const isRecording = recordingId === kb.id
                  const isModified = kb.currentKey !== kb.defaultKey
                  return (
                    <div
                      key={kb.id}
                      className="flex items-center justify-between px-5 py-3"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>{kb.label}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{kb.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setRecordingId(isRecording ? null : kb.id)}
                          className="px-3 py-1.5 rounded-md text-[11px] font-mono font-semibold transition-all duration-150"
                          style={{
                            backgroundColor: isRecording ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--bg-elevated)',
                            color: isRecording ? 'var(--accent)' : isModified ? 'var(--accent)' : 'var(--text-secondary)',
                            border: isRecording ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
                            minWidth: 80,
                            textAlign: 'center',
                          }}
                        >
                          {isRecording ? 'Press keys...' : kb.currentKey}
                        </button>
                        {isModified && (
                          <button
                            onClick={() => resetKeybind(kb.id)}
                            className="p-1 rounded-md transition-all duration-100"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                            title="Reset to default"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Agent Mode Default */}
      <div className="rounded-xl p-5 mt-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Agent Mode Default</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Default agent mode for new sessions</p>
          </div>
          <span className="px-3 py-1 rounded-md text-[11px] font-semibold" style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb), 0.12)' }}>
            Builder
          </span>
        </div>
      </div>

      {/* Available Tools */}
      <AgentToolsSection />
    </>
  )
}

// ─── Agent Tools Section ────────────────────────────────────────────────────

interface ToolInfo {
  id: string
  name: string
  description: string
  icon: typeof FileText
}

const TOOLS_DATA: ToolInfo[] = [
  { id: 'read_file', name: 'Read File', description: 'View file contents', icon: FileText },
  { id: 'write_file', name: 'Write File', description: 'Create or overwrite files', icon: Edit3 },
  { id: 'str_replace', name: 'String Replace', description: 'Edit files precisely', icon: Edit3 },
  { id: 'list_directory', name: 'List Directory', description: 'Browse folders', icon: FolderOpen },
  { id: 'search_files', name: 'Search Files', description: 'Find across files', icon: Search },
  { id: 'execute_command', name: 'Execute Command', description: 'Run shell commands', icon: Terminal },
  { id: 'get_git_diff', name: 'Git Diff', description: 'View code changes', icon: GitBranch },
  { id: 'list_code_definitions', name: 'Code Definitions', description: 'Analyze structure', icon: Code },
  { id: 'create_directory', name: 'Create Directory', description: 'Make new folders', icon: FolderPlus },
  { id: 'delete_file', name: 'Delete File', description: 'Remove files', icon: Trash2 },
  { id: 'move_file', name: 'Move File', description: 'Rename or move', icon: Move },
  { id: 'web_search', name: 'Web Search', description: 'Search the web (DDG)', icon: Search },
  { id: 'lint_file', name: 'Lint File', description: 'Run linter on files', icon: Eye },
  { id: 'fetch_url', name: 'Fetch URL', description: 'Fetch web page content', icon: ExternalLink },
]

const AGENT_MODES = [
  {
    id: 'builder' as const,
    name: 'Builder',
    description: 'Full read & write access',
    color: '#4ade80',
    icon: Zap,
    tools: ['read_file', 'write_file', 'str_replace', 'list_directory', 'search_files', 'execute_command', 'get_git_diff', 'list_code_definitions', 'create_directory', 'delete_file', 'move_file', 'web_search', 'lint_file', 'fetch_url'],
  },
  {
    id: 'planner' as const,
    name: 'Planner',
    description: 'Read-only analysis mode',
    color: '#fbbf24',
    icon: Layout,
    tools: ['read_file', 'list_directory', 'search_files', 'get_git_diff', 'list_code_definitions'],
  },
  {
    id: 'chat' as const,
    name: 'Chat',
    description: 'Common coding tasks',
    color: '#22d3ee',
    icon: MessageSquare,
    tools: ['read_file', 'write_file', 'str_replace', 'list_directory', 'search_files', 'execute_command', 'web_search', 'lint_file', 'fetch_url'],
  },
  {
    id: 'ask' as const,
    name: 'Ask',
    description: 'Read-only Q&A mode',
    color: '#f472b6',
    icon: Eye,
    tools: ['read_file', 'list_directory', 'search_files', 'get_git_diff', 'list_code_definitions'],
  },
]

function AgentToolsSection() {
  const [expandedMode, setExpandedMode] = useState<string | null>('builder')

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Available Tools by Agent</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Each agent mode has different capabilities</p>
        </div>
      </div>

      <div className="space-y-3">
        {AGENT_MODES.map((mode) => {
          const isExpanded = expandedMode === mode.id
          const Icon = mode.icon

          return (
            <div
              key={mode.id}
              className="rounded-xl overflow-hidden transition-all duration-200"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedMode(isExpanded ? null : mode.id)}
                className="w-full flex items-center justify-between p-4 text-left transition-colors duration-150 hover:bg-opacity-50"
                style={{ backgroundColor: isExpanded ? `${mode.color}08` : 'transparent' }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${mode.color}15` }}
                  >
                    <Icon size={18} style={{ color: mode.color }} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{mode.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{mode.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="px-2.5 py-1 rounded-md text-[10px] font-semibold"
                    style={{ backgroundColor: `${mode.color}12`, color: mode.color }}
                  >
                    {mode.tools.length} tools
                  </span>
                  <ChevronDown
                    size={16}
                    style={{
                      color: 'var(--text-muted)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </div>
              </button>

              {/* Tools Grid */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="mb-3" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {mode.tools.map((toolId) => {
                      const tool = TOOLS_DATA.find((t) => t.id === toolId)
                      if (!tool) return null
                      const ToolIcon = tool.icon

                      return (
                        <div
                          key={toolId}
                          className="flex items-center gap-2 p-2.5 rounded-lg transition-all duration-150"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                            e.currentTarget.style.borderColor = `${mode.color}30`
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                            e.currentTarget.style.borderColor = 'var(--border-subtle)'
                          }}
                        >
                          <ToolIcon size={14} style={{ color: mode.color, flexShrink: 0 }} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {tool.name}
                            </p>
                            <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>
                              {tool.description}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Inline Completion Section ───────────────────────────────────────────

function InlineCompletionSection({ apiKeys, onGoToProviders }: {
  apiKeys: Record<AIProvider, { key: string; isConfigured: boolean }>
  onGoToProviders: () => void
}) {
  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [maxTokens, setMaxTokens] = useState(128)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  // Model search / dropdown state
  const [modelSearch, setModelSearch] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [providerModels, setProviderModels] = useState<{ id: string; name: string }[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)

  // Load current config on mount
  useEffect(() => {
    window.artemis.inlineCompletion.getConfig().then((config) => {
      setEnabled(config.enabled)
      setProvider(config.provider)
      setModel(config.model)
      setMaxTokens(config.maxTokens)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const saveConfig = async (updates: { enabled?: boolean; provider?: string; model?: string; maxTokens?: number }) => {
    const newEnabled = updates.enabled ?? enabled
    const newProvider = updates.provider ?? provider
    const newModel = updates.model ?? model
    const newMaxTokens = updates.maxTokens ?? maxTokens
    if (updates.enabled !== undefined) setEnabled(newEnabled)
    if (updates.provider !== undefined) setProvider(newProvider)
    if (updates.model !== undefined) setModel(newModel)
    if (updates.maxTokens !== undefined) setMaxTokens(newMaxTokens)
    await window.artemis.inlineCompletion.setConfig({
      enabled: newEnabled, provider: newProvider, model: newModel, maxTokens: newMaxTokens,
    })
    invalidateInlineCompletionConfigCache()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const COMPLETION_PROVIDERS = PROVIDER_REGISTRY.map(p => ({ id: p.id, name: p.name }))

  // Providers that fetch models live from their API (have /models endpoint and many models)
  const LIVE_FETCH_PROVIDERS = new Set(['openrouter', 'ollama'])

  // Load models from models.json as static fallback
  const modelsFromJson = (pid: string): { id: string; name: string }[] => {
    const raw = (modelsConfig as Record<string, Array<{ id: string; name: string }>>)[pid]
    if (!raw) return []
    return raw.map(m => ({ id: m.id, name: m.name }))
  }

  // Fetch models when provider changes: live fetch for OpenRouter/Ollama, models.json for rest
  useEffect(() => {
    if (!provider) { setProviderModels([]); return }

    const isConfigured = provider === 'ollama' || (apiKeys as any)[provider]?.isConfigured

    if (LIVE_FETCH_PROVIDERS.has(provider) && isConfigured) {
      // Fetch live from the provider's API via main process
      setFetchingModels(true)
      window.artemis.inlineCompletion.fetchModels(provider).then(result => {
        if (result.models.length > 0) {
          setProviderModels(result.models)
        } else {
          // Fallback to models.json if fetch failed
          setProviderModels(modelsFromJson(provider))
        }
        setFetchingModels(false)
      }).catch(() => {
        setProviderModels(modelsFromJson(provider))
        setFetchingModels(false)
      })
    } else {
      // Use models.json directly
      setProviderModels(modelsFromJson(provider))
      setFetchingModels(false)
    }
  }, [provider, apiKeys])

  if (loading) return null

  // Determine which providers have API keys configured
  const configuredProviderIds = new Set<string>(
    PROVIDER_REGISTRY
      .filter(p => p.id === 'ollama' || (apiKeys as any)[p.id]?.isConfigured)
      .map(p => p.id)
  )
  const hasAnyConfigured = configuredProviderIds.size > 0

  // Filter models for dropdown search
  const filteredModels = modelSearch
    ? providerModels.filter(m => m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase()))
    : providerModels

  return (
    <>
      <SectionHeader title="Inline Code Completion" subtitle="AI-powered ghost text suggestions as you type. Uses a fast model to suggest completions — press Tab to accept." />

      {/* Master toggle */}
      <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(var(--accent-rgb), 0.12)' }}>
              <Sparkles size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Enable Code Completion</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Show AI suggestions as ghost text while typing</p>
            </div>
          </div>
          <button
            onClick={() => saveConfig({ enabled: !enabled })}
            className="w-10 rounded-full relative transition-all duration-200 shrink-0"
            style={{
              backgroundColor: enabled ? 'var(--accent)' : 'var(--bg-elevated)',
              border: `1px solid ${enabled ? 'var(--accent)' : 'var(--border-default)'}`,
              width: 40, height: 22,
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
              style={{
                backgroundColor: enabled ? '#000' : 'var(--text-muted)',
                left: enabled ? 20 : 2,
              }}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {/* Info banner: must configure API key first */}
          {!hasAnyConfigured && (
            <div className="rounded-xl p-4 mb-4 flex items-start gap-3" style={{ backgroundColor: 'rgba(251, 191, 36, 0.06)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
              <Key size={16} className="shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
              <div className="flex-1">
                <p className="text-[12px] font-semibold mb-1" style={{ color: '#fbbf24' }}>API Key Required</p>
                <p className="text-[11px] leading-relaxed mb-2.5" style={{ color: 'var(--text-muted)' }}>
                  To use code completion, you need to add an API key for at least one provider first.
                </p>
                <button
                  onClick={onGoToProviders}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
                  style={{ backgroundColor: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.25)' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(251, 191, 36, 0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(251, 191, 36, 0.12)' }}
                >
                  <Key size={12} />
                  Go to Providers
                  <ExternalLink size={10} />
                </button>
              </div>
            </div>
          )}

          {/* Provider selection */}
          <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Provider</p>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Select a provider for completions. Only providers with a configured API key can be selected.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {COMPLETION_PROVIDERS.map(p => {
                const isActive = provider === p.id
                const isConfigured = configuredProviderIds.has(p.id)
                const ProvIcon = getProviderIcon(p.id)
                return (
                  <button
                    key={p.id}
                    disabled={!isConfigured}
                    onClick={() => {
                      if (!isConfigured) return
                      const models = modelsFromJson(p.id)
                      setModelSearch('')
                      setModelDropdownOpen(false)
                      saveConfig({ provider: p.id, model: models?.[0]?.id || '' })
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-lg text-left transition-all relative"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                      border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                      opacity: isConfigured ? 1 : 0.4,
                      cursor: isConfigured ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <ProvIcon size={15} />
                    <span className="text-[11px] font-medium flex-1" style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {p.name}
                    </span>
                    {isConfigured && (
                      <Check size={10} style={{ color: '#4ade80' }} />
                    )}
                    {!isConfigured && (
                      <Shield size={10} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </button>
                )
              })}
            </div>
            {!hasAnyConfigured && (
              <button
                onClick={onGoToProviders}
                className="mt-3 w-full py-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--accent)', border: '1px solid var(--border-subtle)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              >
                <Key size={12} />
                Configure API Keys in Providers
              </button>
            )}
          </div>

          {/* Model selection — searchable dropdown */}
          {provider && configuredProviderIds.has(provider) && (
            <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Model</p>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                Select a model or search below. Fast, small models are recommended for low latency.
              </p>

              {/* Currently selected model chip */}
              {model && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-muted)' }}>Active:</span>
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-medium" style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb), 0.2)' }}>
                    {model}
                  </span>
                </div>
              )}

              {/* Searchable dropdown */}
              <div className="relative">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={modelSearch}
                    onChange={e => { setModelSearch(e.target.value); setModelDropdownOpen(true) }}
                    onFocus={() => setModelDropdownOpen(true)}
                    placeholder="Search models or type a custom model ID..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-[11px] outline-none transition-all font-mono"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: `1px solid ${modelDropdownOpen ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      color: 'var(--text-primary)',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && modelSearch.trim()) {
                        saveConfig({ model: modelSearch.trim() })
                        setModelDropdownOpen(false)
                      }
                      if (e.key === 'Escape') setModelDropdownOpen(false)
                    }}
                  />
                  {fetchingModels && (
                    <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>

                {/* Dropdown list */}
                {modelDropdownOpen && (
                  <div
                    className="absolute z-50 w-full mt-1 rounded-lg overflow-hidden shadow-lg max-h-[240px] overflow-y-auto"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                  >
                    {filteredModels.length === 0 && !modelSearch.trim() && (
                      <p className="px-3 py-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>No models available. Type a custom model ID and press Enter.</p>
                    )}
                    {filteredModels.length === 0 && modelSearch.trim() && (
                      <button
                        onClick={() => { saveConfig({ model: modelSearch.trim() }); setModelDropdownOpen(false) }}
                        className="w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <Code size={12} style={{ color: 'var(--accent)' }} />
                        <span className="text-[11px] font-mono">{modelSearch.trim()}</span>
                        <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>Use custom ID</span>
                      </button>
                    )}
                    {filteredModels.map(m => {
                      const isSelected = model === m.id
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            saveConfig({ model: m.id })
                            setModelSearch('')
                            setModelDropdownOpen(false)
                          }}
                          className="w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors"
                          style={{
                            backgroundColor: isSelected ? 'var(--accent-glow)' : 'transparent',
                            borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium truncate" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>{m.name}</p>
                            <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{m.id}</p>
                          </div>
                          {isSelected && <Check size={12} style={{ color: 'var(--accent)' }} />}
                        </button>
                      )
                    })}
                    {modelSearch.trim() && filteredModels.length > 0 && (
                      <button
                        onClick={() => { saveConfig({ model: modelSearch.trim() }); setModelDropdownOpen(false) }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
                        style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <Code size={11} />
                        <span className="text-[10px] font-mono">{modelSearch.trim()}</span>
                        <span className="text-[10px] ml-auto">Use as custom ID</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Click-away to close dropdown */}
              {modelDropdownOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
              )}
            </div>
          )}

          {/* Max Tokens */}
          <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>Max Completion Length</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Maximum tokens per completion (lower = faster + cheaper)</p>
              </div>
              <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{maxTokens} tokens</span>
            </div>
            <input
              type="range"
              min="32"
              max="512"
              step="32"
              value={maxTokens}
              onChange={e => setMaxTokens(Number(e.target.value))}
              onMouseUp={() => saveConfig({ maxTokens })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ backgroundColor: 'var(--bg-elevated)', accentColor: 'var(--accent)' }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Faster</span>
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Longer</span>
            </div>
          </div>

          {/* How it works info */}
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(96, 165, 250, 0.06)', border: '1px solid rgba(96, 165, 250, 0.1)' }}>
                <Info size={18} style={{ color: 'rgb(96, 165, 250)' }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>How it works</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  After you pause typing for 400ms, Artemis sends the surrounding code to your chosen AI model and displays the suggestion as ghost text. Press <strong style={{ color: 'var(--text-secondary)' }}>Tab</strong> to accept, or keep typing to dismiss. Requests are debounced and cancelled on new keystrokes to minimize API usage. A typical coding session uses only a few hundred requests.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {saved && (
        <div className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg" style={{ backgroundColor: 'rgba(74, 222, 128, 0.06)', border: '1px solid rgba(74, 222, 128, 0.12)' }}>
          <Check size={12} style={{ color: '#4ade80' }} />
          <span className="text-[11px] font-medium" style={{ color: '#4ade80' }}>Settings saved</span>
        </div>
      )}
    </>
  )
}

// ─── Source Control Settings Section ─────────────────────────────────────

function SourceControlSettingsSection({ apiKeys, onGoToProviders }: {
  apiKeys: Record<AIProvider, { key: string; isConfigured: boolean }>
  onGoToProviders: () => void
}) {
  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const [modelSearch, setModelSearch] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [providerModels, setProviderModels] = useState<{ id: string; name: string }[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)

  useEffect(() => {
    window.artemis.commitMessage.getConfig().then((config) => {
      setEnabled(config.enabled)
      setProvider(config.provider)
      setModel(config.model)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const saveConfig = async (updates: { enabled?: boolean; provider?: string; model?: string }) => {
    const newEnabled = updates.enabled ?? enabled
    const newProvider = updates.provider ?? provider
    const newModel = updates.model ?? model
    if (updates.enabled !== undefined) setEnabled(newEnabled)
    if (updates.provider !== undefined) setProvider(newProvider)
    if (updates.model !== undefined) setModel(newModel)
    await window.artemis.commitMessage.setConfig({
      enabled: newEnabled, provider: newProvider, model: newModel,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const SC_PROVIDERS = PROVIDER_REGISTRY.map(p => ({ id: p.id, name: p.name }))
  const LIVE_FETCH_PROVIDERS = new Set(['openrouter', 'ollama'])

  const modelsFromJson = (pid: string): { id: string; name: string }[] => {
    const raw = (modelsConfig as Record<string, Array<{ id: string; name: string }>>)[pid]
    if (!raw) return []
    return raw.map(m => ({ id: m.id, name: m.name }))
  }

  useEffect(() => {
    if (!provider) { setProviderModels([]); return }
    const isConfigured = provider === 'ollama' || (apiKeys as any)[provider]?.isConfigured
    if (LIVE_FETCH_PROVIDERS.has(provider) && isConfigured) {
      setFetchingModels(true)
      window.artemis.commitMessage.fetchModels(provider).then(result => {
        if (result.models.length > 0) {
          setProviderModels(result.models)
        } else {
          setProviderModels(modelsFromJson(provider))
        }
        setFetchingModels(false)
      }).catch(() => {
        setProviderModels(modelsFromJson(provider))
        setFetchingModels(false)
      })
    } else {
      setProviderModels(modelsFromJson(provider))
      setFetchingModels(false)
    }
  }, [provider, apiKeys])

  if (loading) return null

  const configuredProviderIds = new Set<string>(
    PROVIDER_REGISTRY
      .filter(p => p.id === 'ollama' || (apiKeys as any)[p.id]?.isConfigured)
      .map(p => p.id)
  )
  const hasAnyConfigured = configuredProviderIds.size > 0

  const filteredModels = modelSearch
    ? providerModels.filter(m => m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase()))
    : providerModels

  return (
    <>
      <SectionHeader title="Source Control — AI Commit Messages" subtitle="Auto-generate commit messages from staged diffs using an AI model. Click the sparkle button in the Source Control panel to generate." />

      {/* Master toggle */}
      <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(var(--accent-rgb), 0.12)' }}>
              <GitBranch size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Enable AI Commit Messages</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Generate commit messages from diffs using AI</p>
            </div>
          </div>
          <button
            onClick={() => saveConfig({ enabled: !enabled })}
            className="w-10 rounded-full relative transition-all duration-200 shrink-0"
            style={{
              backgroundColor: enabled ? 'var(--accent)' : 'var(--bg-elevated)',
              border: `1px solid ${enabled ? 'var(--accent)' : 'var(--border-default)'}`,
              width: 40, height: 22,
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
              style={{
                backgroundColor: enabled ? '#000' : 'var(--text-muted)',
                left: enabled ? 20 : 2,
              }}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {!hasAnyConfigured && (
            <div className="rounded-xl p-4 mb-4 flex items-start gap-3" style={{ backgroundColor: 'rgba(251, 191, 36, 0.06)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
              <Key size={16} className="shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
              <div className="flex-1">
                <p className="text-[12px] font-semibold mb-1" style={{ color: '#fbbf24' }}>API Key Required</p>
                <p className="text-[11px] leading-relaxed mb-2.5" style={{ color: 'var(--text-muted)' }}>
                  To use AI commit messages, you need to add an API key for at least one provider first.
                </p>
                <button
                  onClick={onGoToProviders}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
                  style={{ backgroundColor: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.25)' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(251, 191, 36, 0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(251, 191, 36, 0.12)' }}
                >
                  <Key size={12} />
                  Go to Providers
                  <ExternalLink size={10} />
                </button>
              </div>
            </div>
          )}

          {/* Provider selection */}
          <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Provider</p>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Select a provider for commit message generation. Only providers with a configured API key can be selected.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {SC_PROVIDERS.map(p => {
                const isActive = provider === p.id
                const isConfigured = configuredProviderIds.has(p.id)
                const ProvIcon = getProviderIcon(p.id)
                return (
                  <button
                    key={p.id}
                    disabled={!isConfigured}
                    onClick={() => {
                      if (!isConfigured) return
                      const models = modelsFromJson(p.id)
                      setModelSearch('')
                      setModelDropdownOpen(false)
                      saveConfig({ provider: p.id, model: models?.[0]?.id || '' })
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-lg text-left transition-all relative"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                      border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                      opacity: isConfigured ? 1 : 0.4,
                      cursor: isConfigured ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <ProvIcon size={15} />
                    <span className="text-[11px] font-medium flex-1" style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {p.name}
                    </span>
                    {isConfigured && <Check size={10} style={{ color: '#4ade80' }} />}
                    {!isConfigured && <Shield size={10} style={{ color: 'var(--text-muted)' }} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Model selection */}
          {provider && configuredProviderIds.has(provider) && (
            <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Model</p>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                Select a model for generating commit messages.
              </p>

              {model && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-muted)' }}>Active:</span>
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-medium" style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb), 0.2)' }}>
                    {model}
                  </span>
                </div>
              )}

              <div className="relative">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={modelSearch}
                    onChange={e => { setModelSearch(e.target.value); setModelDropdownOpen(true) }}
                    onFocus={() => setModelDropdownOpen(true)}
                    placeholder="Search models or type a custom model ID..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-[11px] outline-none transition-all font-mono"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: `1px solid ${modelDropdownOpen ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      color: 'var(--text-primary)',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && modelSearch.trim()) {
                        saveConfig({ model: modelSearch.trim() })
                        setModelDropdownOpen(false)
                      }
                      if (e.key === 'Escape') setModelDropdownOpen(false)
                    }}
                  />
                  {fetchingModels && (
                    <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>

                {modelDropdownOpen && (
                  <div
                    className="absolute z-50 w-full mt-1 rounded-lg overflow-hidden shadow-lg max-h-[240px] overflow-y-auto"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                  >
                    {filteredModels.length === 0 && !modelSearch.trim() && (
                      <p className="px-3 py-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>No models available. Type a custom model ID and press Enter.</p>
                    )}
                    {filteredModels.length === 0 && modelSearch.trim() && (
                      <button
                        onClick={() => { saveConfig({ model: modelSearch.trim() }); setModelDropdownOpen(false) }}
                        className="w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <Code size={12} style={{ color: 'var(--accent)' }} />
                        <span className="text-[11px] font-mono">{modelSearch.trim()}</span>
                        <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>Use custom ID</span>
                      </button>
                    )}
                    {filteredModels.map(m => {
                      const isSelected = model === m.id
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            saveConfig({ model: m.id })
                            setModelSearch('')
                            setModelDropdownOpen(false)
                          }}
                          className="w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors"
                          style={{
                            backgroundColor: isSelected ? 'var(--accent-glow)' : 'transparent',
                            borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium truncate" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>{m.name}</p>
                            <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{m.id}</p>
                          </div>
                          {isSelected && <Check size={12} style={{ color: 'var(--accent)' }} />}
                        </button>
                      )
                    })}
                    {modelSearch.trim() && filteredModels.length > 0 && (
                      <button
                        onClick={() => { saveConfig({ model: modelSearch.trim() }); setModelDropdownOpen(false) }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
                        style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <Code size={11} />
                        <span className="text-[10px] font-mono">{modelSearch.trim()}</span>
                        <span className="text-[10px] ml-auto">Use as custom ID</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {modelDropdownOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
              )}
            </div>
          )}

          {/* How it works */}
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(96, 165, 250, 0.06)', border: '1px solid rgba(96, 165, 250, 0.1)' }}>
                <Info size={18} style={{ color: 'rgb(96, 165, 250)' }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>How it works</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Click the <strong style={{ color: 'var(--text-secondary)' }}>sparkle button</strong> next to the commit input in the Source Control panel. Artemis will read your staged diff (or all changes if nothing is staged), send it to your chosen AI model, and populate the commit message field. The message follows the Conventional Commits format.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {saved && (
        <div className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg" style={{ backgroundColor: 'rgba(74, 222, 128, 0.06)', border: '1px solid rgba(74, 222, 128, 0.12)' }}>
          <Check size={12} style={{ color: '#4ade80' }} />
          <span className="text-[11px] font-medium" style={{ color: '#4ade80' }}>Settings saved</span>
        </div>
      )}
    </>
  )
}

// ─── Discord RPC Section ────────────────────────────────────────────────

function DiscordRPCSection() {
  const [enabled, setEnabled] = useState(false)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [discordDetected, setDiscordDetected] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [debugLog, setDebugLog] = useState(false)

  useEffect(() => {
    // Load initial state
    window.artemis.discord.getState().then((state) => {
      setEnabled(state.enabled)
      setConnected(state.connected)
      if (state.error) setError(state.error)
    }).catch(() => {})

    window.artemis.discord.detectDiscord().then(setDiscordDetected).catch(() => {})
  }, [])

  const handleToggle = async () => {
    setLoading(true)
    setError(null)
    try {
      const newState = await window.artemis.discord.toggle(!enabled)
      setEnabled(newState.enabled)
      setConnected(newState.connected)
      if (newState.error) setError(newState.error)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <SectionHeader title="Discord RPC" subtitle="Show your Artemis IDE activity as Discord Rich Presence." />

      {/* Detection Status */}
      <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(88, 101, 242, 0.1)', border: '1px solid rgba(88, 101, 242, 0.15)' }}>
              <Gamepad2 size={18} style={{ color: '#5865F2' }} />
            </div>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Enable Discord RPC</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {discordDetected === null ? 'Checking Discord...' :
                 discordDetected ? 'Discord detected on this system' :
                 'Discord not detected — install Discord first'}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={loading}
            className="w-10 rounded-full relative transition-all duration-200 shrink-0"
            style={{
              backgroundColor: enabled ? '#5865F2' : 'var(--bg-elevated)',
              border: `1px solid ${enabled ? '#5865F2' : 'var(--border-default)'}`,
              width: 40, height: 22,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
              style={{
                backgroundColor: enabled ? '#fff' : 'var(--text-muted)',
                left: enabled ? 20 : 2,
              }}
            />
          </button>
        </div>

        {/* Status */}
        {enabled && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <Circle
                size={8}
                fill={connected ? '#4ade80' : '#fbbf24'}
                stroke="none"
              />
              <span className="text-[11px] font-medium" style={{ color: connected ? 'var(--success)' : 'var(--warning)' }}>
                {connected ? 'Connected to Discord' : 'Connecting...'}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(192, 57, 43, 0.06)', border: '1px solid rgba(192, 57, 43, 0.12)' }}>
            <X size={11} style={{ color: 'var(--error)' }} />
            <span className="text-[10px]" style={{ color: 'var(--error)' }}>{error}</span>
          </div>
        )}
      </div>

      {/* Presence Details */}
      <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <p className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Presence Details</p>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Application Name</span>
            <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>Artemis IDE</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>App ID</span>
            <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>1470066535660785835</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Status Format</span>
            <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>Editing [file] | [elapsed]</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Updates On</span>
            <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>File open, idle</span>
          </div>
        </div>
      </div>

      {/* Debug Logging Toggle */}
      <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>Debug Logging</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Log Discord IPC events to DevTools console for troubleshooting</p>
          </div>
          <button
            onClick={() => {
              const next = !debugLog
              setDebugLog(next)
              window.artemis.discord.setDebug(next).catch(() => {})
            }}
            className="w-10 rounded-full relative transition-all duration-200 shrink-0"
            style={{
              backgroundColor: debugLog ? 'var(--accent)' : 'var(--bg-elevated)',
              border: `1px solid ${debugLog ? 'var(--accent)' : 'var(--border-default)'}`,
              width: 40, height: 22,
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
              style={{
                backgroundColor: debugLog ? '#fff' : 'var(--text-muted)',
                left: debugLog ? 20 : 2,
              }}
            />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(88, 101, 242, 0.06)', border: '1px solid rgba(88, 101, 242, 0.1)' }}>
            <Info size={18} style={{ color: '#5865F2' }} />
          </div>
          <div>
            <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>How it works</p>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Discord RPC connects to Discord via a local IPC socket — no credentials needed.
              Your status will show the current file, language icon, and elapsed time.
              Toggle off at any time to clear your presence. Enable Debug Logging to see
              connection events in the DevTools console (Ctrl+Shift+I).
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Rules Section ──────────────────────────────────────────────────────────

function RulesSection() {
  const [personalRules, setPersonalRules] = useState('')
  const [projectRules, setProjectRules] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [savedPersonal, setSavedPersonal] = useState(false)
  const [savingProject, setSavingProject] = useState(false)
  const [savedProject, setSavedProject] = useState(false)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [hasProject, setHasProject] = useState(false)
  const [activeTab, setActiveTab] = useState<'project' | 'personal'>('project')

  useEffect(() => {
    window.artemis.store.get('lastProject').then(async (project: any) => {
      if (!project?.path) { setLoading(false); return }
      setHasProject(true)
      const pPath = project.path.replace(/\\/g, '/')
      setProjectPath(pPath)
      try { const c = await window.artemis.fs.readFile(`${pPath}/.artemis/rules`); setPersonalRules(c) } catch { setPersonalRules('') }
      try { const c = await window.artemis.fs.readFile(`${pPath}/artemis.md`); setProjectRules(c) } catch { setProjectRules('') }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSavePersonal = async () => {
    if (!projectPath) return
    setSavingPersonal(true)
    try {
      try { await window.artemis.fs.createDir(`${projectPath}/.artemis`) } catch { /* exists */ }
      await window.artemis.fs.writeFile(`${projectPath}/.artemis/rules`, personalRules)
      setSavedPersonal(true); setTimeout(() => setSavedPersonal(false), 2000)
    } catch (err) { console.error('[Rules] Save personal failed:', err) }
    setSavingPersonal(false)
  }

  const handleSaveProject = async () => {
    if (!projectPath) return
    setSavingProject(true)
    try {
      await window.artemis.fs.writeFile(`${projectPath}/artemis.md`, projectRules)
      setSavedProject(true); setTimeout(() => setSavedProject(false), 2000)
    } catch (err) { console.error('[Rules] Save project failed:', err) }
    setSavingProject(false)
  }

  const PERSONAL_TEMPLATE = `# Personal Rules\n# Your personal AI preferences — NOT committed to git.\n\n## Preferences\n- Always explain changes before making them\n- Use verbose variable names\n- Add comments for complex logic\n\n## Restrictions\n- Do not auto-format files I didn't ask you to touch\n- Ask before deleting anything\n`

  const PROJECT_TEMPLATE = `# Project Rules (artemis.md)\n# Shared with the team — committed to git.\n# Like CLAUDE.md for Claude, this defines project-wide AI rules.\n\n## Project Overview\n- Describe your project here\n\n## Tech Stack\n- List frameworks, languages, libraries\n\n## Code Conventions\n- Follow existing patterns\n- Preserve comments and documentation\n\n## AI Instructions\n- Do not modify config files without asking\n- Always run tests after changes\n- Keep functions small and focused\n`

  if (loading) return null

  const isProject = activeTab === 'project'
  const content = isProject ? projectRules : personalRules
  const setContent = isProject ? setProjectRules : setPersonalRules
  const saving = isProject ? savingProject : savingPersonal
  const saved = isProject ? savedProject : savedPersonal
  const handleSave = isProject ? handleSaveProject : handleSavePersonal
  const template = isProject ? PROJECT_TEMPLATE : PERSONAL_TEMPLATE

  return (
    <>
      <SectionHeader title="Agent Rules" subtitle="Configure how the AI agent behaves in your project. Rules are injected as context in every conversation." />

      {!hasProject ? (
        <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(251, 191, 36, 0.06)', border: '1px solid rgba(251, 191, 36, 0.1)' }}>
              <Info size={18} style={{ color: '#fbbf24' }} />
            </div>
            <div>
              <p className="text-[12px] font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>No project open</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Open a project first to manage agent rules.</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Rules Hierarchy */}
          <div className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>How rules work</p>
            <p className="text-[11px] mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Artemis uses a layered rules system, like <code className="text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>CLAUDE.md</code> for Claude. Rules stack from general to specific — later rules take priority.
            </p>
            <div className="space-y-0">
              {([
                { num: '1', file: 'artemis.md', loc: 'Project root', desc: 'Shared project rules — committed to git, visible to the team', color: '#4ade80', tag: 'Shared' },
                { num: '2', file: 'artemis.md', loc: 'Any subfolder', desc: 'Folder-specific overrides — apply when AI works in that directory', color: '#60a5fa', tag: 'Per-folder' },
                { num: '3', file: '.artemis/rules', loc: 'Project root', desc: 'Your personal rules — local only, gitignored, highest priority', color: 'var(--accent)', tag: 'Personal' },
              ] as const).map((rule, i) => (
                <div key={rule.num} className="flex items-start gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: `${rule.color}15`, color: rule.color, border: `1.5px solid ${rule.color}30` }}>{rule.num}</div>
                    {i < 2 && <div className="w-px h-4" style={{ backgroundColor: 'var(--border-subtle)' }} />}
                  </div>
                  <div className="pb-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <code className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>{rule.file}</code>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${rule.color}12`, color: rule.color }}>{rule.tag}</span>
                      <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{rule.loc}</span>
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{rule.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-1 p-1 rounded-lg mb-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
            {([
              { id: 'project' as const, label: 'Project Rules', file: 'artemis.md', color: '#4ade80', hasContent: !!projectRules.trim() },
              { id: 'personal' as const, label: 'Personal Rules', file: '.artemis/rules', color: 'var(--accent)', hasContent: !!personalRules.trim() },
            ]).map(tab => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[11px] font-semibold transition-all duration-150"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: isActive ? 'var(--shadow-card)' : 'none',
                  }}
                >
                  {tab.label}
                  {tab.hasContent && (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tab.color }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab description */}
          <div className="rounded-xl p-3.5 mb-3 flex items-start gap-2.5" style={{ backgroundColor: isProject ? 'rgba(74, 222, 128, 0.04)' : 'rgba(var(--accent-rgb), 0.04)', border: `1px solid ${isProject ? 'rgba(74, 222, 128, 0.1)' : 'rgba(var(--accent-rgb), 0.1)'}` }}>
            <FileText size={14} className="shrink-0 mt-0.5" style={{ color: isProject ? '#4ade80' : 'var(--accent)' }} />
            <div className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {isProject ? (
                <span><strong style={{ color: 'var(--text-secondary)' }}>artemis.md</strong> — Shared project rules in your project root. Committed to git so your entire team follows the same AI conventions. You can also place <code className="px-1 py-0.5 rounded text-[9px]" style={{ backgroundColor: 'var(--bg-elevated)' }}>artemis.md</code> in any subfolder to define folder-specific rules.</span>
              ) : (
                <span><strong style={{ color: 'var(--text-secondary)' }}>.artemis/rules</strong> — Your personal rules, stored in the hidden <code className="px-1 py-0.5 rounded text-[9px]" style={{ backgroundColor: 'var(--bg-elevated)' }}>.artemis/</code> directory. Gitignored by default. These override project rules and are only for you.</span>
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <FileText size={13} style={{ color: isProject ? '#4ade80' : 'var(--accent)' }} />
                <span className="text-[12px] font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{isProject ? 'artemis.md' : '.artemis/rules'}</span>
                {content.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{content.split('\n').length} lines</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!content.trim() && (
                  <button
                    onClick={() => setContent(template)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-100"
                    style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-glow)' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(var(--accent-rgb), 0.15)' }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--accent-glow)' }}
                  >
                    <Sparkles size={10} />
                    Use Template
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-semibold transition-all duration-150"
                  style={{ backgroundColor: saved ? 'rgba(74, 222, 128, 0.12)' : 'var(--accent)', color: saved ? '#4ade80' : '#000', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? <Loader2 size={10} className="animate-spin" /> : saved ? <Check size={10} /> : null}
                  {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={isProject ? '# Write shared project rules here...\n\nThese apply to everyone on the team.' : '# Write your personal rules here...\n\nThese are private to you and override project rules.'}
              className="w-full bg-transparent border-none outline-none resize-none text-[12px] leading-relaxed font-mono px-5 py-4"
              style={{ color: 'var(--text-primary)', caretColor: isProject ? '#4ade80' : 'var(--accent)', minHeight: 240 }}
              spellCheck={false}
            />
          </div>

          {/* What to include */}
          <div className="rounded-xl p-5 mt-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>What to include in rules</p>
            <div className="space-y-2">
              {[
                { title: 'Project Context', desc: 'Brief description, tech stack, architecture overview' },
                { title: 'Code Style', desc: 'Naming conventions, formatting, patterns to follow' },
                { title: 'Restrictions', desc: 'Files/folders not to modify, actions to avoid' },
                { title: 'Preferences', desc: 'Language choice, framework patterns, testing approach' },
                { title: 'AI Behavior', desc: 'When to ask vs. act, verbosity, explanation style' },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--accent)' }} />
                  <div>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{item.title}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}> — {item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tip */}
          <div className="rounded-xl p-4 mt-3 flex items-start gap-2.5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <Info size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Tip:</strong> Use <code className="px-1 py-0.5 rounded text-[9px]" style={{ backgroundColor: 'var(--bg-elevated)' }}>/init</code> in chat to auto-generate an <code className="px-1 py-0.5 rounded text-[9px]" style={{ backgroundColor: 'var(--bg-elevated)' }}>artemis.md</code> from your project structure. Keep rules concise — they count against the AI context window.
            </p>
          </div>
        </>
      )}
    </>
  )
}

// ─── About Section ──────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <>
      <SectionHeader title="About" subtitle="About Artemis and its integrated AI providers." />

      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>
            <span className="text-[14px] font-black" style={{ color: '#000' }}>A</span>
          </div>
          <div>
            <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Artemis <span className="font-normal text-[11px]" style={{ color: 'var(--text-muted)' }}>v0.2.0</span>
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>AI-powered development environment</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-5">
          {[
            { url: 'https://opencode.ai', label: 'Zen' },
            { url: 'https://z.ai', label: 'Z.AI' },
            { url: 'https://docs.anthropic.com', label: 'Anthropic' },
            { url: 'https://platform.openai.com', label: 'OpenAI' },
            { url: 'https://openrouter.ai', label: 'OpenRouter' },
          ].map(link => (
            <a
              key={link.url}
              href="#"
              onClick={(e) => { e.preventDefault(); window.artemis.shell.openExternal(link.url) }}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all duration-100 cursor-pointer"
              style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-glow)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(var(--accent-rgb), 0.15)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent-glow)'}
            >
              {link.label} <ExternalLink size={11} />
            </a>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="pt-4 space-y-2.5">
          <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Integrated Providers</p>
          {PROVIDER_REGISTRY.map(p => {
            const ProvIcon = getProviderIcon(p.id)
            return (
              <div key={p.id} className="flex items-center gap-2.5">
                <ProvIcon size={14} />
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>{p.name}</strong> &mdash; {p.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── Shared Components ──────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-bold mb-1.5 tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h1>
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
    </div>
  )
}

function ProviderKeyInput({ name, description, icon, placeholder, helpUrl, config, onKeyChange, onSave, noKeyRequired }: {
  name: string; description: string; icon: React.ReactNode; placeholder: string
  helpUrl: string; config: ProviderConfig; onKeyChange: (key: string) => void; onSave: () => void
  noKeyRequired?: boolean
}) {
  const [inputFocused, setInputFocused] = useState(false)
  const canSubmit = noKeyRequired || config.key.trim()

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(var(--accent-rgb), 0.12)' }}>
          {icon}
        </div>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{description}</p>
        </div>
      </div>

      {config.isConfigured && (
        <div className="flex items-center gap-2.5 mb-4 px-4 py-2.5 rounded-lg" style={{ backgroundColor: 'rgba(74, 222, 128, 0.06)', border: '1px solid rgba(74, 222, 128, 0.12)' }}>
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)' }}>
            <Check size={11} style={{ color: 'var(--success)' }} />
          </div>
          <span className="text-[11px] font-medium" style={{ color: 'var(--success)' }}>{noKeyRequired ? 'Connected' : 'API key configured'}</span>
        </div>
      )}

      <div className="flex gap-2.5 mb-4">
        {!noKeyRequired && (
          <div className="flex-1 rounded-lg transition-all duration-200" style={{ border: `1.5px solid ${inputFocused ? 'rgba(var(--accent-rgb), 0.4)' : 'var(--border-default)'}`, boxShadow: inputFocused ? '0 0 0 3px rgba(var(--accent-rgb), 0.06)' : 'none' }}>
            <input
              type="password"
              value={config.key}
              onChange={e => onKeyChange(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={config.isConfigured ? 'Enter new key to update...' : placeholder}
              className="w-full px-4 py-2.5 rounded-lg text-[12px] outline-none bg-transparent"
              style={{ color: 'var(--text-primary)' }}
              onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onSave() }}
            />
          </div>
        )}
        <button
          onClick={onSave}
          disabled={!canSubmit || config.status === 'saving'}
          className={`${noKeyRequired ? 'flex-1' : ''} px-5 py-2.5 rounded-lg text-[12px] font-semibold transition-all duration-150 flex items-center justify-center gap-2 shrink-0`}
          style={{
            backgroundColor: config.status === 'saved' ? 'var(--success)' : config.status === 'error' ? 'var(--error)' : canSubmit ? 'var(--accent)' : 'var(--bg-elevated)',
            color: config.status === 'saved' || config.status === 'error' ? '#fff' : canSubmit ? '#000' : 'var(--text-muted)',
            opacity: !canSubmit && config.status === 'idle' ? 0.5 : 1,
          }}
        >
          {config.status === 'saving' ? (<><Loader2 size={13} className="animate-spin" /> {noKeyRequired ? 'Connecting...' : 'Validating...'}</>)
            : config.status === 'saved' ? (<><Check size={13} /> {noKeyRequired ? 'Connected' : 'Saved'}</>)
            : config.status === 'error' ? (<><X size={13} /> Failed</>)
            : noKeyRequired ? 'Test Connection' : 'Save Key'}
        </button>
      </div>

      {config.status === 'error' && config.errorMessage && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg mb-4" style={{ backgroundColor: 'rgba(192, 57, 43, 0.06)', border: '1px solid rgba(192, 57, 43, 0.12)' }}>
          <X size={12} style={{ color: 'var(--error)' }} />
          <p className="text-[11px]" style={{ color: 'var(--error)' }}>{config.errorMessage}</p>
        </div>
      )}

      <div className="flex items-center gap-3 p-3.5 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        <Key size={14} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {noKeyRequired ? (
            <>Make sure Ollama is running locally. Download from{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); window.artemis.shell.openExternal(helpUrl) }} className="inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--accent)' }}>
                ollama.com <ExternalLink size={10} />
              </a>
            </>
          ) : (
            <>Get your API key from{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); window.artemis.shell.openExternal(helpUrl) }} className="inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--accent)' }}>
                {helpUrl.replace('https://', '').split('/')[0]} <ExternalLink size={10} />
              </a>
              {' '}&mdash; free models available.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
