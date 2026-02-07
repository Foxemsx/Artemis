import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Key, Shield, SkipForward, ExternalLink, Zap, Code2, Users, Sparkles, Server, Check } from 'lucide-react'
import type { Theme } from '../types'

type Provider = 'zen' | 'zai'

interface Props {
  onComplete: (theme: string, apiKeys?: { provider: Provider; key: string }[]) => void
}

const SETUP_THEMES: { id: Theme; name: string; accent: string; bg: string; card: string; text: string }[] = [
  { id: 'dark', name: 'Midnight', accent: '#d4a853', bg: '#0a0a0a', card: '#1a1a1a', text: '#f0f0f0' },
  { id: 'light', name: 'Daylight', accent: '#b8860b', bg: '#fafafa', card: '#ffffff', text: '#1a1a1a' },
  { id: 'cyberpunk', name: 'Cyberpunk', accent: '#ff2ecb', bg: '#0b0014', card: '#1a0030', text: '#e0d0ff' },
  { id: 'nord', name: 'Nord', accent: '#88c0d0', bg: '#2e3440', card: '#434c5e', text: '#eceff4' },
  { id: 'monokai', name: 'Monokai', accent: '#f92672', bg: '#272822', card: '#35362f', text: '#f8f8f2' },
  { id: 'solarized', name: 'Solarized', accent: '#b58900', bg: '#002b36', card: '#0a3d49', text: '#fdf6e3' },
  { id: 'dracula', name: 'Dracula', accent: '#bd93f9', bg: '#282a36', card: '#343746', text: '#f8f8f2' },
  { id: 'rosepine', name: 'Rose Pine', accent: '#ebbcba', bg: '#191724', card: '#26233a', text: '#e0def4' },
]

export default function ThemeSetup({ onComplete }: Props) {
  const [selected, setSelected] = useState<Theme | null>(null)
  const [step, setStep] = useState<'welcome' | 'theme' | 'apikey'>('welcome')
  const [selectedProvider, setSelectedProvider] = useState<Provider>('zen')
  const [zenApiKey, setZenApiKey] = useState('')
  const [zaiApiKey, setZaiApiKey] = useState('')

  return (
    <div
      className="h-screen flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      {/* Subtle background texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, #ffffff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full opacity-[0.06] blur-[150px]"
          style={{ background: '#d4a853', top: '-15%', right: '-10%' }}
          animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full opacity-[0.04] blur-[120px]"
          style={{ background: '#ffffff', bottom: '-15%', left: '-10%' }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <AnimatePresence mode="wait">
        {/* ─── Step 1: Welcome ────────────────────────────────────────── */}
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 text-center max-w-2xl px-8"
          >
            {/* Logo */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.2 }}
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8"
              style={{
                backgroundColor: '#d4a853',
                boxShadow: '0 12px 50px rgba(212, 168, 83, 0.3)',
              }}
            >
              <span className="text-3xl font-black text-black">A</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-5xl font-black mb-4 tracking-tight"
              style={{ color: '#f0f0f0' }}
            >
              Welcome to{' '}
              <span style={{ color: '#d4a853' }}>Artemis</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-lg mb-6"
              style={{ color: '#a0a0a0' }}
            >
              An open-source AI agent for developers powered by{' '}
              <a
                href="https://opencode.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors"
                style={{ color: '#d4a853' }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                OpenCode Zen
                <ExternalLink size={14} />
              </a>{' '}
              and{' '}
              <a
                href="https://z.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors"
                style={{ color: '#d4a853' }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                Z.AI
                <ExternalLink size={14} />
              </a>
            </motion.p>

            {/* Feature highlights */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="grid grid-cols-2 gap-4 mb-10 max-w-lg mx-auto"
            >
              <div
                className="flex items-center gap-3 p-4 rounded-xl text-left"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(212, 168, 83, 0.1)' }}>
                  <Code2 size={18} style={{ color: '#d4a853' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>Builder Agent</p>
                  <p className="text-[11px]" style={{ color: '#666' }}>Edit files & run commands</p>
                </div>
              </div>

              <div
                className="flex items-center gap-3 p-4 rounded-xl text-left"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(212, 168, 83, 0.1)' }}>
                  <Sparkles size={18} style={{ color: '#d4a853' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>Planner Mode</p>
                  <p className="text-[11px]" style={{ color: '#666' }}>Discuss & plan features</p>
                </div>
              </div>

              <div
                className="flex items-center gap-3 p-4 rounded-xl text-left"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(212, 168, 83, 0.1)' }}>
                  <Users size={18} style={{ color: '#d4a853' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>Multi-Session</p>
                  <p className="text-[11px]" style={{ color: '#666' }}>Work on multiple tasks</p>
                </div>
              </div>

              <div
                className="flex items-center gap-3 p-4 rounded-xl text-left"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(212, 168, 83, 0.1)' }}>
                  <Zap size={18} style={{ color: '#d4a853' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>Multiple Providers</p>
                  <p className="text-[11px]" style={{ color: '#666' }}>OpenCode Zen + Z.AI GLM</p>
                </div>
              </div>
            </motion.div>

             <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="max-w-md mx-auto mb-6"
            >
              <p className="text-sm px-6 py-3 rounded-xl" style={{ color: '#888', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: '#f0f0f0' }}>Artemis is free & open source.</strong>{' '}
                We support multiple AI providers. Both OpenCode Zen and Z.AI offer free models—check their pricing before you start.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.button
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setStep('theme')}
                className="px-10 py-4 rounded-xl text-black font-bold text-base flex items-center gap-2"
                style={{
                  backgroundColor: '#d4a853',
                  boxShadow: '0 8px 30px rgba(212, 168, 83, 0.3)',
                }}
              >
                Get Started
                <ArrowRight size={18} />
              </motion.button>
              
              <p className="text-[11px]" style={{ color: '#555' }}>
                Free & open source forever
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* ─── Step 2: Theme Selection ────────────────────────────────── */}
        {step === 'theme' && (
          <motion.div
            key="theme"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 text-center max-w-2xl w-full px-8"
          >
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: '#d4a853' }}
            >
              Step 1 of 2
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-black mb-3 tracking-tight"
              style={{ color: '#f0f0f0' }}
            >
              Choose your workspace theme
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-sm mb-10"
              style={{ color: '#a0a0a0' }}
            >
              Select your preferred appearance. You can always change this later in settings.
            </motion.p>

            <div className="grid grid-cols-4 gap-4 mb-10 max-w-2xl mx-auto">
              {SETUP_THEMES.map((t, i) => {
                const isActive = selected === t.id
                return (
                  <motion.button
                    key={t.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 + i * 0.05 }}
                    whileHover={{ y: -3, scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelected(t.id)}
                    className="rounded-xl p-[2px] text-left transition-all duration-200"
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, ${t.accent}, ${t.accent}88)`
                        : 'rgba(255,255,255,0.08)',
                      boxShadow: isActive ? `0 0 30px ${t.accent}33` : 'none',
                    }}
                  >
                    <div className="rounded-[10px] overflow-hidden" style={{ background: '#141414' }}>
                      {/* Mini preview */}
                      <div className="h-14 relative" style={{ backgroundColor: t.bg }}>
                        <div className="absolute top-2 left-2 space-y-1">
                          <div className="h-1 w-8 rounded-full" style={{ backgroundColor: t.text, opacity: 0.4 }} />
                          <div className="h-1 w-5 rounded-full" style={{ backgroundColor: t.text, opacity: 0.2 }} />
                        </div>
                        <div className="absolute bottom-1.5 inset-x-2 h-4 rounded-sm" style={{ backgroundColor: t.card }}>
                          <div className="h-1 w-1/2 mt-1.5 ml-1.5 rounded-full" style={{ backgroundColor: t.accent, opacity: 0.5 }} />
                        </div>
                        <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.accent }} />
                        {isActive && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: t.accent }}>
                            <Check size={9} strokeWidth={3} style={{ color: '#000' }} />
                          </div>
                        )}
                      </div>
                      {/* Label */}
                      <div className="px-2.5 py-2">
                        <p className="text-[11px] font-semibold" style={{ color: '#f0f0f0' }}>{t.name}</p>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </div>

            <AnimatePresence>
              {selected && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setStep('apikey')}
                  className="px-10 py-4 rounded-xl text-black font-bold text-base flex items-center gap-2 mx-auto"
                  style={{
                    backgroundColor: '#d4a853',
                    boxShadow: '0 8px 30px rgba(212, 168, 83, 0.3)',
                  }}
                >
                  Continue
                  <ArrowRight size={18} />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ─── Step 3: API Key ────────────────────────────────────────── */}
        {step === 'apikey' && (
          <motion.div
            key="apikey"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 text-center max-w-lg w-full px-8"
          >
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: '#d4a853' }}
            >
              Step 2 of 2
            </motion.p>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15, delay: 0.15 }}
              className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: 'rgba(212, 168, 83, 0.1)', border: '1px solid rgba(212, 168, 83, 0.2)' }}
            >
              <Key size={28} style={{ color: '#d4a853' }} />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-black mb-3 tracking-tight"
              style={{ color: '#f0f0f0' }}
            >
              Connect your AI
            </motion.h2>

             <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-sm mb-6 leading-relaxed"
              style={{ color: '#a0a0a0' }}
            >
              Choose your AI provider and enter your API key. Both OpenCode Zen and Z.AI are supported.
            </motion.p>

            {/* Provider Selection */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-2 gap-3 mb-6"
            >
              <button
                onClick={() => setSelectedProvider('zen')}
                className="flex items-center gap-3 p-4 rounded-xl text-left transition-all duration-200"
                style={{
                  backgroundColor: selectedProvider === 'zen' ? 'rgba(212, 168, 83, 0.15)' : '#141414',
                  border: `2px solid ${selectedProvider === 'zen' ? '#d4a853' : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ 
                    backgroundColor: selectedProvider === 'zen' ? 'rgba(212, 168, 83, 0.2)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <Server size={20} style={{ color: selectedProvider === 'zen' ? '#d4a853' : '#666' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>OpenCode Zen</p>
                  <p className="text-[11px]" style={{ color: '#888' }}>Multiple AI models</p>
                </div>
              </button>

              <button
                onClick={() => setSelectedProvider('zai')}
                className="flex items-center gap-3 p-4 rounded-xl text-left transition-all duration-200"
                style={{
                  backgroundColor: selectedProvider === 'zai' ? 'rgba(212, 168, 83, 0.15)' : '#141414',
                  border: `2px solid ${selectedProvider === 'zai' ? '#d4a853' : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ 
                    backgroundColor: selectedProvider === 'zai' ? 'rgba(212, 168, 83, 0.2)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <Sparkles size={20} style={{ color: selectedProvider === 'zai' ? '#d4a853' : '#666' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>Z.AI</p>
                  <p className="text-[11px]" style={{ color: '#888' }}>GLM models</p>
                </div>
              </button>
            </motion.div>

            {/* API Key Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mb-6"
            >
              {selectedProvider === 'zen' ? (
                <>
                  <input
                    type="password"
                    value={zenApiKey}
                    onChange={(e) => setZenApiKey(e.target.value)}
                    placeholder="zen-... or sk-..."
                    className="w-full px-5 py-4 rounded-xl text-base outline-none transition-all duration-150"
                    style={{
                      backgroundColor: '#141414',
                      color: '#f0f0f0',
                      border: '2px solid rgba(255,255,255,0.1)',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#d4a853'
                      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(212, 168, 83, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <p className="text-[11px] mt-2 text-center" style={{ color: '#666' }}>
                    Get your key from{' '}
                    <a href="https://opencode.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#d4a853' }}>
                      opencode.ai
                    </a>
                  </p>
                </>
              ) : (
                <>
                  <input
                    type="password"
                    value={zaiApiKey}
                    onChange={(e) => setZaiApiKey(e.target.value)}
                    placeholder="zai-..."
                    className="w-full px-5 py-4 rounded-xl text-base outline-none transition-all duration-150"
                    style={{
                      backgroundColor: '#141414',
                      color: '#f0f0f0',
                      border: '2px solid rgba(255,255,255,0.1)',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#d4a853'
                      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(212, 168, 83, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <p className="text-[11px] mt-2 text-center" style={{ color: '#666' }}>
                    Get your key from{' '}
                    <a href="https://z.ai/manage-apikey/apikey-list" target="_blank" rel="noopener noreferrer" style={{ color: '#d4a853' }}>
                      z.ai
                    </a>
                  </p>
                </>
              )}
            </motion.div>

            {/* Security & info notice */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mb-8 space-y-3"
            >
              <div
                className="flex items-start gap-3 text-left p-4 rounded-xl"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <Shield size={18} className="shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
                <div>
                  <p className="text-sm font-medium mb-1" style={{ color: '#f0f0f0' }}>Your key stays local</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#888' }}>
                    Stored securely on your machine. All API calls go directly from your computer - we never see your key.
                  </p>
                </div>
              </div>

               <div
                className="flex items-start gap-3 text-left p-4 rounded-xl"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <Zap size={18} className="shrink-0 mt-0.5" style={{ color: '#d4a853' }} />
                <div>
                  <p className="text-sm font-medium mb-1" style={{ color: '#f0f0f0' }}>Free models available</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#888' }}>
                    Both providers offer free models — OpenCode Zen (GPT 5 Nano, Big Pickle) and Z.AI (GLM 4.7 Free). Check current pricing before you start.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex items-center gap-4 justify-center"
            >
              <button
                onClick={() => onComplete(selected || 'dark', undefined)}
                className="px-6 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all duration-150"
                style={{
                  backgroundColor: 'transparent',
                  color: '#888',
                  border: '2px solid rgba(255,255,255,0.1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                  e.currentTarget.style.color = '#f0f0f0'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.color = '#888'
                }}
              >
                <SkipForward size={16} />
                Skip for now
              </button>

               <button
                onClick={() => {
                  const apiKeys: { provider: Provider; key: string }[] = []
                  if (zenApiKey.trim()) apiKeys.push({ provider: 'zen', key: zenApiKey.trim() })
                  if (zaiApiKey.trim()) apiKeys.push({ provider: 'zai', key: zaiApiKey.trim() })
                  onComplete(selected || 'dark', apiKeys.length > 0 ? apiKeys : undefined)
                }}
                disabled={!zenApiKey.trim() && !zaiApiKey.trim()}
                className="px-8 py-3 rounded-xl text-base font-bold flex items-center gap-2 transition-all duration-150"
                style={{
                  backgroundColor: (zenApiKey.trim() || zaiApiKey.trim()) ? '#d4a853' : '#1a1a1a',
                  color: (zenApiKey.trim() || zaiApiKey.trim()) ? '#000' : '#555',
                  boxShadow: (zenApiKey.trim() || zaiApiKey.trim()) ? '0 8px 30px rgba(212, 168, 83, 0.3)' : 'none',
                }}
              >
                Finish Setup
                <ArrowRight size={18} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
