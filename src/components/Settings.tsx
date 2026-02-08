import { useState, useEffect } from 'react'
import { Key, Shield, ExternalLink, Check, X, Loader2, Zap, Server, Sparkles, Palette, Settings2, Info, Volume2, Bell, Play, RotateCcw, Keyboard, ChevronDown, FileText, FolderOpen, Search, Terminal, GitBranch, Code, FolderPlus, Trash2, Move, Edit3, MessageSquare, Layout, Eye, Gamepad2, Circle } from 'lucide-react'
import type { Theme, AIProvider } from '../types'
import { type SoundSettings, DEFAULT_SOUND_SETTINGS, previewSound, type SoundType } from '../lib/sounds'

interface KeyBind {
  id: string
  label: string
  description: string
  defaultKey: string
  currentKey: string
}

const DEFAULT_KEYBINDS: KeyBind[] = [
  { id: 'commandPalette', label: 'Command Palette', description: 'Open the command palette', defaultKey: 'Ctrl+K', currentKey: 'Ctrl+K' },
  { id: 'newSession', label: 'New Session', description: 'Create a new chat session', defaultKey: 'Ctrl+N', currentKey: 'Ctrl+N' },
  { id: 'search', label: 'Search Files', description: 'Open file search', defaultKey: 'Ctrl+Shift+F', currentKey: 'Ctrl+Shift+F' },
  { id: 'quickSearch', label: 'Quick Search', description: 'Quick file search', defaultKey: 'Ctrl+T', currentKey: 'Ctrl+T' },
  { id: 'toggleSidebar', label: 'Toggle Sidebar', description: 'Show/hide the sidebar', defaultKey: 'Ctrl+B', currentKey: 'Ctrl+B' },
  { id: 'toggleChat', label: 'Toggle Chat', description: 'Show/hide the chat panel', defaultKey: 'Ctrl+J', currentKey: 'Ctrl+J' },
  { id: 'newTerminal', label: 'New Terminal', description: 'Open a new terminal', defaultKey: 'Ctrl+`', currentKey: 'Ctrl+`' },
  { id: 'saveFile', label: 'Save File', description: 'Save the current file', defaultKey: 'Ctrl+S', currentKey: 'Ctrl+S' },
  { id: 'closeTab', label: 'Close Tab', description: 'Close the active tab', defaultKey: 'Ctrl+W', currentKey: 'Ctrl+W' },
  { id: 'settings', label: 'Settings', description: 'Open settings', defaultKey: 'Ctrl+,', currentKey: 'Ctrl+,' },
]

type SettingsCategory = 'providers' | 'appearance' | 'sounds' | 'discord' | 'general' | 'about'

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
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'sounds', label: 'Sounds & Alerts', icon: Volume2 },
  { id: 'discord', label: 'Discord RPC', icon: Gamepad2 },
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'about', label: 'About', icon: Info },
]

export default function Settings({ theme, onSetTheme, apiKeys, onSetApiKey, soundSettings, onSetSoundSettings }: Props) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('providers')
  const [providers, setProviders] = useState<Record<AIProvider, ProviderConfig>>({
    zen: { key: '', status: 'idle', errorMessage: '', isConfigured: apiKeys.zen?.isConfigured || false },
    zai: { key: '', status: 'idle', errorMessage: '', isConfigured: apiKeys.zai?.isConfigured || false },
  })

  const handleSaveKey = async (provider: AIProvider) => {
    const config = providers[provider]
    if (!config.key.trim()) return
    setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'saving', errorMessage: '' } }))
    try {
      const success = await onSetApiKey(provider, config.key.trim())
      if (success) {
        setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'saved', key: '', isConfigured: true } }))
        setTimeout(() => { setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'idle' } })) }, 2000)
      } else {
        setProviders(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'error', errorMessage: 'Invalid API key. Please check and try again.' } }))
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
          {activeCategory === 'appearance' && (
            <AppearanceSection theme={theme} onSetTheme={onSetTheme} />
          )}
          {activeCategory === 'sounds' && (
            <SoundsSection settings={soundSettings} onChange={onSetSoundSettings} />
          )}
          {activeCategory === 'discord' && <DiscordRPCSection />}
          {activeCategory === 'general' && <GeneralSection />}
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

// ─── Providers Section ──────────────────────────────────────────────────────

function ProvidersSection({ providers, onKeyChange, onSave }: {
  providers: Record<AIProvider, ProviderConfig>
  onKeyChange: (provider: AIProvider, key: string) => void
  onSave: (provider: AIProvider) => void
}) {
  const hasAny = providers.zen.isConfigured || providers.zai.isConfigured
  return (
    <>
      <SectionHeader title="AI Providers" subtitle="Connect your AI provider API keys to start using Artemis." />

      <ProviderKeyInput
        name="OpenCode Zen"
        description="GPT, Claude, Gemini, DeepSeek, and 20+ models via OpenCode"
        icon={<Server size={18} style={{ color: 'var(--accent)' }} />}
        placeholder="zen-... or sk-..."
        helpUrl="https://opencode.ai"
        config={providers.zen}
        onKeyChange={k => onKeyChange('zen', k)}
        onSave={() => onSave('zen')}
      />

      <div className="mt-4">
        <ProviderKeyInput
          name="Z.AI (Coding Plan)"
          description="GLM 4.7 via Z.AI Coding Plan (Lite/Pro/Max). Uses Anthropic-compatible endpoint."
          icon={<Sparkles size={18} style={{ color: 'var(--accent)' }} />}
          placeholder="your Z.AI API key"
          helpUrl="https://z.ai/manage-apikey/apikey-list"
          config={providers.zai}
          onKeyChange={k => onKeyChange('zai', k)}
          onSave={() => onSave('zai')}
        />
      </div>

      {!hasAny && (
        <div className="mt-4 flex items-center gap-3 p-3.5 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <Zap size={14} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Add at least one API key to start using AI features. Both providers offer free models.
          </p>
        </div>
      )}

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

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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

        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {keybinds.map(kb => {
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

// ─── Discord RPC Section ────────────────────────────────────────────────────

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

// ─── About Section ──────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <>
      <SectionHeader title="About" subtitle="About Artemis and its providers." />

      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>
            <span className="text-[14px] font-black" style={{ color: '#000' }}>A</span>
          </div>
          <div>
            <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Artemis <span className="font-normal text-[11px]" style={{ color: 'var(--text-muted)' }}>v0.1.0</span>
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>AI-powered development environment</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-5">
          {[{ url: 'https://opencode.ai', label: 'opencode.ai' }, { url: 'https://z.ai', label: 'z.ai' }].map(link => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all duration-100"
              style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-glow)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(var(--accent-rgb), 0.15)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent-glow)'}
            >
              {link.label} <ExternalLink size={11} />
            </a>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="pt-4 space-y-3">
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>OpenCode Zen</strong> &mdash; Curated AI models from OpenAI, Anthropic, Google, DeepSeek, Meta, and more. Pay-as-you-go with free models available.
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Z.AI Coding Plan</strong> &mdash; GLM 4.7 access via Lite/Pro/Max plans. Uses Anthropic-compatible endpoint. ~120 prompts per 5 hours on Lite.
          </p>
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

function ProviderKeyInput({ name, description, icon, placeholder, helpUrl, config, onKeyChange, onSave }: {
  name: string; description: string; icon: React.ReactNode; placeholder: string
  helpUrl: string; config: ProviderConfig; onKeyChange: (key: string) => void; onSave: () => void
}) {
  const [inputFocused, setInputFocused] = useState(false)

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
          <span className="text-[11px] font-medium" style={{ color: 'var(--success)' }}>API key configured</span>
        </div>
      )}

      <div className="flex gap-2.5 mb-4">
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
            onKeyDown={e => { if (e.key === 'Enter' && config.key.trim()) onSave() }}
          />
        </div>
        <button
          onClick={onSave}
          disabled={!config.key.trim() || config.status === 'saving'}
          className="px-5 py-2.5 rounded-lg text-[12px] font-semibold transition-all duration-150 flex items-center gap-2 shrink-0"
          style={{
            backgroundColor: config.status === 'saved' ? 'var(--success)' : config.status === 'error' ? 'var(--error)' : config.key.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
            color: config.status === 'saved' || config.status === 'error' ? '#fff' : config.key.trim() ? '#000' : 'var(--text-muted)',
            opacity: !config.key.trim() && config.status === 'idle' ? 0.5 : 1,
          }}
        >
          {config.status === 'saving' ? (<><Loader2 size={13} className="animate-spin" /> Validating...</>)
            : config.status === 'saved' ? (<><Check size={13} /> Saved</>)
            : config.status === 'error' ? (<><X size={13} /> Failed</>)
            : 'Save Key'}
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
          Get your API key from{' '}
          <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
            {helpUrl.replace('https://', '').split('/')[0]} <ExternalLink size={10} />
          </a>
          {' '}&mdash; free models available.
        </p>
      </div>
    </div>
  )
}
