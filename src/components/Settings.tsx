import { useState } from 'react'
import { Sun, Moon, Key, Shield, ExternalLink, Check, X, Loader2 } from 'lucide-react'
import type { Theme } from '../types'

interface Props {
  theme: Theme
  onToggleTheme: () => void
  hasApiKey: boolean
  onSetApiKey: (key: string) => Promise<boolean>
}

export default function Settings({ theme, onToggleTheme, hasApiKey, onSetApiKey }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return
    setSaveStatus('saving')
    setErrorMessage('')
    
    const keyToSave = apiKey.trim()
    
    try {
      // Use the onSetApiKey prop which validates and stores the key
      const success = await onSetApiKey(keyToSave)
      
      if (success) {
        setSaveStatus('saved')
        setApiKey('')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('error')
        setErrorMessage('Invalid API key. Please check and try again.')
      }
    } catch (err: any) {
      console.error('[Settings] Error saving API key:', err)
      setSaveStatus('error')
      setErrorMessage(err.message || 'Failed to save API key')
    }
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-lg mx-auto py-8 px-6">
        {/* Header */}
        <h1
          className="text-xl font-bold mb-1 tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Settings
        </h1>
        <p className="text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
          Configure Artemis preferences and API keys.
        </p>

        {/* ─── Theme ──────────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            Appearance
          </h2>
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon size={16} style={{ color: 'var(--accent)' }} />
                ) : (
                  <Sun size={16} style={{ color: 'var(--accent)' }} />
                )}
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Toggle between dark and light themes
                  </p>
                </div>
              </div>
              <button
                onClick={onToggleTheme}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors duration-100"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              >
                Switch to {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </section>

        {/* ─── API Keys ───────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            Providers & API Keys
          </h2>
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Key size={14} style={{ color: 'var(--accent)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                API Key
              </p>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Enter an API key for OpenCode Zen, Anthropic, OpenAI, or another supported provider.
            </p>

            {hasApiKey && (
              <div
                className="flex items-center gap-2 mb-3 p-2 rounded-md"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
              >
                <Check size={12} style={{ color: 'var(--success)' }} />
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  API key is configured
                </span>
              </div>
            )}

            <div className="flex gap-2 mb-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasApiKey ? "Enter new key to update..." : "sk-... or zen-..."}
                className="flex-1 px-3 py-2 rounded-md text-xs outline-none transition-all duration-150"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && apiKey.trim()) {
                    handleSaveKey()
                  }
                }}
              />
              <button
                onClick={handleSaveKey}
                disabled={!apiKey.trim() || saveStatus === 'saving'}
                className="px-4 py-2 rounded-md text-xs font-medium transition-all duration-100 flex items-center gap-1.5"
                style={{
                  backgroundColor: saveStatus === 'saved' ? 'var(--success)' : saveStatus === 'error' ? 'var(--error)' : apiKey.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: saveStatus === 'saved' || saveStatus === 'error' ? '#fff' : apiKey.trim() ? '#000' : 'var(--text-muted)',
                }}
              >
                {saveStatus === 'saving' ? (
                  <><Loader2 size={12} className="animate-spin" /> Saving</>
                ) : saveStatus === 'saved' ? (
                  <><Check size={12} /> Saved</>
                ) : saveStatus === 'error' ? (
                  <><X size={12} /> Failed</>
                ) : (
                  'Save'
                )}
              </button>
            </div>

            {saveStatus === 'error' && errorMessage && (
              <p className="text-[10px] mt-2" style={{ color: 'var(--error)' }}>
                {errorMessage}
              </p>
            )}
          </div>
        </section>

        {/* ─── Security ───────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            Security
          </h2>
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-start gap-3">
              <Shield size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
              <div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  API keys are stored securely in your browser's local storage and validated with OpenCode Zen.
                </p>
                <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                  Your keys never leave your machine. All AI requests are made directly from your computer to the API.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── About ──────────────────────────────────────────────────── */}
        <section>
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            About
          </h2>
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Artemis <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>v0.1.0</span>
            </p>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-secondary)' }}>
              AI-powered development environment built on OpenCode.
            </p>
            <a
              href="https://opencode.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors duration-100"
              style={{ color: 'var(--accent)' }}
            >
              opencode.ai
              <ExternalLink size={11} />
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
