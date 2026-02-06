import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon, ArrowRight, Key, Shield, SkipForward, ExternalLink, Zap, Code2, Users, Sparkles } from 'lucide-react'

interface Props {
  onComplete: (theme: string, apiKey?: string) => void
}

export default function ThemeSetup({ onComplete }: Props) {
  const [selected, setSelected] = useState<'dark' | 'light' | null>(null)
  const [step, setStep] = useState<'welcome' | 'theme' | 'apikey'>('welcome')
  const [apiKey, setApiKey] = useState('')

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
              An open-source AI agent for developers, inspired by{' '}
              <a
                href="https://opencode.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors"
                style={{ color: '#d4a853' }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                OpenCode
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
                  <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>Free Models</p>
                  <p className="text-[11px]" style={{ color: '#666' }}>Start without billing</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
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

            <div className="grid grid-cols-2 gap-6 mb-10 max-w-xl mx-auto">
              {/* Dark */}
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelected('dark')}
                className="rounded-2xl p-[2px] text-left transition-all duration-200"
                style={{
                  background: selected === 'dark' 
                    ? 'linear-gradient(135deg, #d4a853, #e8c97a)' 
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: selected === 'dark' ? '0 0 40px rgba(212, 168, 83, 0.2)' : 'none',
                }}
              >
                <div className="rounded-[14px] p-5" style={{ background: '#141414' }}>
                  {/* Preview window */}
                  <div 
                    className="rounded-lg overflow-hidden mb-4" 
                    style={{ 
                      background: '#0a0a0a', 
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                    }}
                  >
                    <div className="h-6 flex items-center px-3 gap-1.5" style={{ background: '#080808', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: '#c0392b' }} />
                      <div className="w-2 h-2 rounded-full" style={{ background: '#d4a853' }} />
                      <div className="w-2 h-2 rounded-full" style={{ background: '#4ade80' }} />
                    </div>
                    <div className="h-24 p-3 flex gap-3">
                      <div className="w-16 shrink-0" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6 }} />
                      <div className="flex-1 space-y-2">
                        <div className="w-full h-2 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
                        <div className="w-4/5 h-2 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                        <div className="w-3/5 h-2 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: selected === 'dark' ? 'rgba(212, 168, 83, 0.15)' : 'rgba(255,255,255,0.05)' }}
                    >
                      <Moon size={18} style={{ color: selected === 'dark' ? '#d4a853' : '#666' }} />
                    </div>
                    <div>
                      <p className="text-base font-bold" style={{ color: '#f0f0f0' }}>Dark Mode</p>
                      <p className="text-xs" style={{ color: '#888' }}>Easy on the eyes, perfect for coding</p>
                    </div>
                  </div>
                </div>
              </motion.button>

              {/* Light */}
              <motion.button
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelected('light')}
                className="rounded-2xl p-[2px] text-left transition-all duration-200"
                style={{
                  background: selected === 'light' 
                    ? 'linear-gradient(135deg, #d4a853, #e8c97a)' 
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: selected === 'light' ? '0 0 40px rgba(212, 168, 83, 0.2)' : 'none',
                }}
              >
                <div className="rounded-[14px] p-5" style={{ background: '#141414' }}>
                  {/* Preview window */}
                  <div 
                    className="rounded-lg overflow-hidden mb-4" 
                    style={{ 
                      background: '#fafafa', 
                      border: '1px solid rgba(0,0,0,0.08)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div className="h-6 flex items-center px-3 gap-1.5" style={{ background: '#eeeeee', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: '#c0392b' }} />
                      <div className="w-2 h-2 rounded-full" style={{ background: '#d4a853' }} />
                      <div className="w-2 h-2 rounded-full" style={{ background: '#4ade80' }} />
                    </div>
                    <div className="h-24 p-3 flex gap-3" style={{ background: '#ffffff' }}>
                      <div className="w-16 shrink-0" style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 6 }} />
                      <div className="flex-1 space-y-2">
                        <div className="w-full h-2 rounded" style={{ background: 'rgba(0,0,0,0.08)' }} />
                        <div className="w-4/5 h-2 rounded" style={{ background: 'rgba(0,0,0,0.05)' }} />
                        <div className="w-3/5 h-2 rounded" style={{ background: 'rgba(0,0,0,0.03)' }} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: selected === 'light' ? 'rgba(212, 168, 83, 0.15)' : 'rgba(255,255,255,0.05)' }}
                    >
                      <Sun size={18} style={{ color: selected === 'light' ? '#d4a853' : '#666' }} />
                    </div>
                    <div>
                      <p className="text-base font-bold" style={{ color: '#f0f0f0' }}>Light Mode</p>
                      <p className="text-xs" style={{ color: '#888' }}>Clean and bright workspace</p>
                    </div>
                  </div>
                </div>
              </motion.button>
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
              className="text-sm mb-8 leading-relaxed"
              style={{ color: '#a0a0a0' }}
            >
              Enter an API key to power Artemis. Get one from{' '}
              <a
                href="https://opencode.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
                style={{ color: '#d4a853' }}
              >
                OpenCode Zen
                <ExternalLink size={12} />
              </a>
              {' '}(recommended), or use your own from Anthropic, OpenAI, or other providers.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-6"
            >
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
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
                    OpenCode Zen offers free models like GPT 5 Nano and Big Pickle - no billing required to get started.
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
                onClick={() => onComplete(selected || 'dark')}
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
                onClick={() => onComplete(selected || 'dark', apiKey || undefined)}
                disabled={!apiKey.trim()}
                className="px-8 py-3 rounded-xl text-base font-bold flex items-center gap-2 transition-all duration-150"
                style={{
                  backgroundColor: apiKey.trim() ? '#d4a853' : '#1a1a1a',
                  color: apiKey.trim() ? '#000' : '#555',
                  boxShadow: apiKey.trim() ? '0 8px 30px rgba(212, 168, 83, 0.3)' : 'none',
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
