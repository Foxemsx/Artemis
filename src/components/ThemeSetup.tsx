import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, Key, Shield, SkipForward, ExternalLink, Zap, Code2, Users, Sparkles, Server, Check, Volume2, VolumeX, Bell, BellOff, Play, Terminal, Palette, Minus, X, Github, Heart, ChevronDown } from 'lucide-react'
import type { Theme, AIProvider } from '../types'
import { previewSound, type SoundSettings, DEFAULT_SOUND_SETTINGS } from '../lib/sounds'
import { PROVIDER_REGISTRY } from '../lib/zenClient'
import { getProviderIcon } from './ProviderIcons'
import logoUrl from '../../resources/icon.png'

type SetupStep = 'welcome' | 'theme' | 'sounds' | 'apikey'

interface Props {
  onComplete: (theme: string, apiKeys?: { provider: string; key: string }[]) => void
}

const SETUP_THEMES: { id: Theme; name: string; accent: string; bg: string; card: string; text: string; desc: string }[] = [
  { id: 'dark', name: 'Midnight', accent: '#d4a853', bg: '#0a0a0a', card: '#1a1a1a', text: '#f0f0f0', desc: 'Default dark' },
  { id: 'light', name: 'Daylight', accent: '#b8860b', bg: '#fafafa', card: '#ffffff', text: '#1a1a1a', desc: 'Clean & bright' },
  { id: 'cyberpunk', name: 'Cyberpunk', accent: '#ff2ecb', bg: '#0b0014', card: '#1a0030', text: '#e0d0ff', desc: 'Neon vibes' },
  { id: 'nord', name: 'Nord', accent: '#88c0d0', bg: '#2e3440', card: '#434c5e', text: '#eceff4', desc: 'Arctic calm' },
  { id: 'monokai', name: 'Monokai', accent: '#f92672', bg: '#272822', card: '#35362f', text: '#f8f8f2', desc: 'Classic editor' },
  { id: 'solarized', name: 'Solarized', accent: '#b58900', bg: '#002b36', card: '#0a3d49', text: '#fdf6e3', desc: 'Warm contrast' },
  { id: 'dracula', name: 'Dracula', accent: '#bd93f9', bg: '#282a36', card: '#343746', text: '#f8f8f2', desc: 'Purple haze' },
  { id: 'rosepine', name: 'Rose Pine', accent: '#ebbcba', bg: '#191724', card: '#26233a', text: '#e0def4', desc: 'Soft & dreamy' },
  { id: 'pine', name: 'Pine', accent: '#3cb371', bg: '#1a2421', card: '#243330', text: '#d4e8d0', desc: 'Forest green' },
  { id: 'catppuccin', name: 'Catppuccin', accent: '#cba6f7', bg: '#1e1e2e', card: '#313244', text: '#cdd6f4', desc: 'Pastel mocha' },
  { id: 'gruvbox', name: 'Gruvbox', accent: '#fabd2f', bg: '#282828', card: '#3c3836', text: '#ebdbb2', desc: 'Retro warm' },
  { id: 'materialocean', name: 'Material Ocean', accent: '#82aaff', bg: '#0f111a', card: '#1a1c2e', text: '#a6accd', desc: 'Deep ocean' },
  { id: 'everforest', name: 'Everforest', accent: '#a7c080', bg: '#2d353b', card: '#3d484d', text: '#d3c6aa', desc: 'Nature soft' },
  { id: 'sakura', name: 'Sakura', accent: '#ff7eb3', bg: '#1a1020', card: '#2a1830', text: '#f0d0e8', desc: 'Cherry blossom' },
  { id: 'beach', name: 'Beach', accent: '#f4a261', bg: '#1a1814', card: '#2a2620', text: '#ede0d0', desc: 'Sandy sunset' },
  { id: 'space', name: 'Space', accent: '#7c3aed', bg: '#050510', card: '#10102a', text: '#c8c0e0', desc: 'Deep cosmos' },
]

const STEPS: SetupStep[] = ['welcome', 'theme', 'sounds', 'apikey']

// ─── Color Palette (matches logo: warm peach/sand + black) ──────────────────
const ONBOARD = {
  bg: '#1a1410',
  card: '#241e17',
  accent: '#e8c4a0',
  accentDark: '#c9a07a',
  accentGlow: 'rgba(232,196,160,0.25)',
  text: '#f5ece4',
  textMuted: '#a08e7c',
  textDim: '#6b5d4f',
  border: 'rgba(232,196,160,0.12)',
  borderActive: 'rgba(232,196,160,0.35)',
}

// ─── Step Progress Indicator ─────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <motion.div
          key={i}
          className="h-1 rounded-full"
          style={{
            width: i === current ? 32 : 12,
            backgroundColor: i === current ? ONBOARD.accent : i < current ? 'rgba(232,196,160,0.4)' : 'rgba(255,255,255,0.1)',
          }}
          layout
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      ))}
    </div>
  )
}

// ─── Window Controls for Onboarding ─────────────────────────────────────────
function OnboardingWindowControls() {
  return (
    <div className="fixed top-0 right-0 z-50 flex items-center titlebar-no-drag" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => window.artemis.window.minimize()}
        className="w-10 h-8 flex items-center justify-center transition-colors duration-100"
        style={{ color: ONBOARD.textMuted }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(232,196,160,0.1)'; e.currentTarget.style.color = ONBOARD.text }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = ONBOARD.textMuted }}
      >
        <Minus size={13} strokeWidth={1.5} />
      </button>
      <button
        onClick={() => window.artemis.window.close()}
        className="w-10 h-8 flex items-center justify-center transition-colors duration-100"
        style={{ color: ONBOARD.textMuted }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#c0392b'; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = ONBOARD.textMuted }}
      >
        <X size={13} strokeWidth={1.5} />
      </button>
    </div>
  )
}

export default function ThemeSetup({ onComplete }: Props) {
  const [selected, setSelected] = useState<Theme>('dark')
  const [step, setStep] = useState<SetupStep>('welcome')
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('zen')
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({})
  const [soundSettings, setSoundSettings] = useState<SoundSettings>({ ...DEFAULT_SOUND_SETTINGS })

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }, [step])

  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }, [step])

  const handleFinish = useCallback(() => {
    const apiKeys: { provider: string; key: string }[] = []
    for (const [providerId, key] of Object.entries(providerKeys)) {
      if (key.trim()) apiKeys.push({ provider: providerId, key: key.trim() })
    }
    // Save sound settings
    window.artemis.store.set('soundSettings', soundSettings).catch(() => {})
    onComplete(selected || 'dark', apiKeys.length > 0 ? apiKeys : undefined)
  }, [providerKeys, selected, soundSettings, onComplete])

  return (
    <div
      className="h-screen flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: ONBOARD.bg }}
    >
      {/* Draggable title bar region */}
      <div className="fixed top-0 left-0 right-0 h-8 z-40 titlebar-drag" />

      {/* Window Controls */}
      <OnboardingWindowControls />

      {/* GitHub + Support links — fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 titlebar-no-drag">
        <button
          onClick={() => window.artemis.shell.openExternal('https://github.com/Foxemsx/Artemis')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150"
          style={{ color: ONBOARD.textMuted, backgroundColor: 'rgba(232,196,160,0.06)', border: `1px solid ${ONBOARD.border}` }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(232,196,160,0.12)'; e.currentTarget.style.color = ONBOARD.text }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(232,196,160,0.06)'; e.currentTarget.style.color = ONBOARD.textMuted }}
        >
          <Github size={13} />
          GitHub
        </button>
        <button
          onClick={() => window.artemis.shell.openExternal('https://buymeacoffee.com/foxemsx')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150"
          style={{ color: ONBOARD.textMuted, backgroundColor: 'rgba(232,196,160,0.06)', border: `1px solid ${ONBOARD.border}` }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(232,196,160,0.12)'; e.currentTarget.style.color = ONBOARD.text }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(232,196,160,0.06)'; e.currentTarget.style.color = ONBOARD.textMuted }}
        >
          <Heart size={13} />
          Support
        </button>
      </div>

      {/* Subtle background texture */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, ${ONBOARD.accent} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Ambient glow - warm peach matching the logo */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute w-[700px] h-[700px] rounded-full opacity-[0.08] blur-[180px]"
          style={{ background: `linear-gradient(135deg, ${ONBOARD.accent}, ${ONBOARD.accentDark})`, top: '-20%', right: '-15%' }}
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full opacity-[0.05] blur-[140px]"
          style={{ background: `linear-gradient(135deg, ${ONBOARD.accentDark}, #f0d8c0)`, bottom: '-15%', left: '-10%' }}
          animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[300px] h-[300px] rounded-full opacity-[0.03] blur-[100px]"
          style={{ background: '#ffffff', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <AnimatePresence mode="wait">
        {/* ─── Step 1: Welcome ────────────────────────────────────────── */}
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 text-center max-w-3xl px-8"
          >
            {/* Logo with glow */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 12, stiffness: 150, delay: 0.2 }}
              className="relative mx-auto mb-8"
              style={{ width: 100, height: 100 }}
            >
              {/* Glow ring */}
              <motion.div
                className="absolute inset-0 rounded-2xl"
                style={{ boxShadow: `0 0 60px ${ONBOARD.accentGlow}, 0 0 120px rgba(232,196,160,0.1)` }}
                animate={{ boxShadow: [`0 0 60px ${ONBOARD.accentGlow}, 0 0 120px rgba(232,196,160,0.1)`, `0 0 80px rgba(232,196,160,0.35), 0 0 150px rgba(232,196,160,0.15)`, `0 0 60px ${ONBOARD.accentGlow}, 0 0 120px rgba(232,196,160,0.1)`] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />
              <img
                src={logoUrl}
                alt="Artemis"
                className="w-full h-full rounded-2xl object-cover relative z-10"
                style={{ border: `2px solid ${ONBOARD.borderActive}` }}
              />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="text-5xl font-black mb-3 tracking-tight"
              style={{ color: ONBOARD.text }}
            >
              Welcome to{' '}
              <span
                style={{
                  background: `linear-gradient(135deg, ${ONBOARD.accent}, #f0d8c0)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Artemis
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="text-lg mb-2"
              style={{ color: ONBOARD.textMuted }}
            >
              The open-source AI-powered IDE for developers
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-sm mb-8"
              style={{ color: ONBOARD.textDim }}
            >
              Powered by{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); window.artemis.shell.openExternal('https://opencode.ai') }} style={{ color: ONBOARD.accent, cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >OpenCode Zen</a>{' '}and{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); window.artemis.shell.openExternal('https://z.ai') }} style={{ color: ONBOARD.accent, cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >Z.AI</a>
            </motion.p>

            {/* Feature cards with staggered animation */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
              className="grid grid-cols-3 gap-4 mb-10 max-w-2xl mx-auto"
            >
              {[
                { icon: Code2, title: 'AI Agent', desc: 'Edit files, run commands, build features autonomously' },
                { icon: Terminal, title: 'Built-in Terminal', desc: 'Full integrated terminal with PTY support' },
                { icon: Sparkles, title: 'Smart Planner', desc: 'Discuss ideas before writing a single line of code' },
                { icon: Palette, title: '16 Themes', desc: 'From Midnight to Sakura — find your perfect look' },
                { icon: Users, title: 'Multi-Session', desc: 'Work on multiple tasks in parallel sessions' },
                { icon: Zap, title: 'Free Models', desc: 'Both providers offer free models to get started' },
              ].map(({ icon: Icon, title, desc }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + i * 0.06 }}
                  className="p-4 rounded-xl text-left group"
                  style={{
                    backgroundColor: 'rgba(232, 196, 160, 0.03)',
                    border: `1px solid ${ONBOARD.border}`,
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center mb-2.5"
                    style={{ backgroundColor: 'rgba(232, 196, 160, 0.1)' }}
                  >
                    <Icon size={17} style={{ color: ONBOARD.accent }} />
                  </div>
                  <p className="text-[13px] font-bold mb-1" style={{ color: ONBOARD.text }}>{title}</p>
                  <p className="text-[11px] leading-snug" style={{ color: ONBOARD.textDim }}>{desc}</p>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="flex flex-col items-center gap-4"
            >
              <motion.button
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={goNext}
                className="px-12 py-4 rounded-xl text-black font-bold text-base flex items-center gap-2.5"
                style={{
                  background: `linear-gradient(135deg, ${ONBOARD.accent}, #f0d8c0)`,
                  boxShadow: `0 8px 40px ${ONBOARD.accentGlow}, 0 2px 10px rgba(232,196,160,0.15)`,
                }}
              >
                Get Started
                <ArrowRight size={18} />
              </motion.button>

              <p className="text-[11px]" style={{ color: ONBOARD.textDim }}>
                Free & open source forever
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* ─── Step 2: Theme Selection ────────────────────────────────── */}
        {step === 'theme' && (
          <motion.div
            key="theme"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 text-center max-w-3xl w-full px-8"
          >
            <StepIndicator current={0} total={3} />

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-xs font-semibold tracking-widest uppercase mb-3"
              style={{ color: ONBOARD.accent }}
            >
              Step 1 of 3 &mdash; Appearance
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-3xl font-black mb-2 tracking-tight"
              style={{ color: ONBOARD.text }}
            >
              Choose your workspace theme
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-sm mb-8"
              style={{ color: ONBOARD.textMuted }}
            >
              Pick the vibe that suits you. You can always change this later in settings.
            </motion.p>

            <div className="grid grid-cols-4 gap-3 mb-8 max-w-3xl mx-auto">
              {SETUP_THEMES.map((t, i) => {
                const isActive = selected === t.id
                return (
                  <motion.button
                    key={t.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + i * 0.03 }}
                    whileHover={{ y: -4, scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelected(t.id)}
                    className="rounded-xl p-[2px] text-left transition-all duration-200"
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, ${t.accent}, ${t.accent}88)`
                        : 'rgba(255,255,255,0.06)',
                      boxShadow: isActive ? `0 0 25px ${t.accent}30, 0 4px 15px rgba(0,0,0,0.3)` : '0 2px 8px rgba(0,0,0,0.2)',
                    }}
                  >
                    <div className="rounded-[10px] overflow-hidden" style={{ background: '#111' }}>
                      {/* Mini IDE preview */}
                      <div className="h-16 relative" style={{ backgroundColor: t.bg }}>
                        {/* Sidebar hint */}
                        <div className="absolute left-0 top-0 bottom-0 w-4" style={{ backgroundColor: t.card, opacity: 0.6 }} />
                        {/* Editor area */}
                        <div className="absolute top-2 left-6 right-2 space-y-1.5">
                          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: t.accent, opacity: 0.6 }} />
                          <div className="h-0.5 w-14 rounded-full" style={{ backgroundColor: t.text, opacity: 0.25 }} />
                          <div className="h-0.5 w-8 rounded-full" style={{ backgroundColor: t.text, opacity: 0.15 }} />
                          <div className="h-0.5 w-12 rounded-full" style={{ backgroundColor: t.text, opacity: 0.2 }} />
                        </div>
                        {/* Status bar hint */}
                        <div className="absolute bottom-0 left-0 right-0 h-2" style={{ backgroundColor: t.card, opacity: 0.8 }}>
                          <div className="h-0.5 w-4 mt-0.5 ml-1.5 rounded-full" style={{ backgroundColor: t.accent, opacity: 0.6 }} />
                        </div>
                        {isActive && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: t.accent, boxShadow: `0 0 10px ${t.accent}60` }}
                          >
                            <Check size={10} strokeWidth={3} style={{ color: '#000' }} />
                          </motion.div>
                        )}
                      </div>
                      {/* Label */}
                      <div className="px-2.5 py-2">
                        <p className="text-[11px] font-semibold" style={{ color: isActive ? ONBOARD.text : '#ccc' }}>{t.name}</p>
                        <p className="text-[9px]" style={{ color: ONBOARD.textDim }}>{t.desc}</p>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </div>

            <div className="flex items-center gap-3 justify-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={goBack}
                className="px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2"
                style={{ color: ONBOARD.textMuted, border: `1px solid ${ONBOARD.border}` }}
              >
                <ArrowLeft size={16} />
                Back
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={goNext}
                className="px-10 py-3 rounded-xl text-black font-bold text-base flex items-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${ONBOARD.accent}, #f0d8c0)`,
                  boxShadow: `0 8px 30px ${ONBOARD.accentGlow}`,
                }}
              >
                Continue
                <ArrowRight size={18} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ─── Step 3: Sound Settings ─────────────────────────────────── */}
        {step === 'sounds' && (
          <motion.div
            key="sounds"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 text-center max-w-lg w-full px-8"
          >
            <StepIndicator current={1} total={3} />

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-xs font-semibold tracking-widest uppercase mb-3"
              style={{ color: ONBOARD.accent }}
            >
              Step 2 of 3 &mdash; Sounds & Notifications
            </motion.p>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15, delay: 0.15 }}
              className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: 'rgba(232,196,160,0.1)', border: `1px solid ${ONBOARD.borderActive}` }}
            >
              <Volume2 size={28} style={{ color: ONBOARD.accent }} />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-black mb-2 tracking-tight"
              style={{ color: ONBOARD.text }}
            >
              Sound & Notifications
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="text-sm mb-8"
              style={{ color: ONBOARD.textMuted }}
            >
              Artemis uses synthesized sounds for events. Customize what you hear.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-3 mb-8"
            >
              {/* Master toggle */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ backgroundColor: 'rgba(232,196,160,0.05)', border: `1px solid ${ONBOARD.border}` }}
              >
                <div className="flex items-center gap-3">
                  {soundSettings.enabled ? <Volume2 size={18} style={{ color: ONBOARD.accent }} /> : <VolumeX size={18} style={{ color: ONBOARD.textDim }} />}
                  <div className="text-left">
                    <p className="text-sm font-semibold" style={{ color: ONBOARD.text }}>Sound Effects</p>
                    <p className="text-[11px]" style={{ color: ONBOARD.textDim }}>Master toggle for all sounds</p>
                  </div>
                </div>
                <button
                  onClick={() => setSoundSettings(s => ({ ...s, enabled: !s.enabled }))}
                  className="w-12 h-6 rounded-full relative transition-all duration-200"
                  style={{
                    backgroundColor: soundSettings.enabled ? ONBOARD.accent : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <motion.div
                    className="w-5 h-5 rounded-full absolute top-0.5"
                    style={{ backgroundColor: '#fff' }}
                    animate={{ left: soundSettings.enabled ? 26 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>

              {/* Volume slider */}
              {soundSettings.enabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 py-3 rounded-xl"
                  style={{ backgroundColor: ONBOARD.card, border: `1px solid ${ONBOARD.border}` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-medium" style={{ color: ONBOARD.text }}>Volume</span>
                    <span className="text-[11px] font-mono" style={{ color: ONBOARD.accent }}>{Math.round(soundSettings.volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={soundSettings.volume}
                    onChange={e => setSoundSettings(s => ({ ...s, volume: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, ${ONBOARD.accent} 0%, ${ONBOARD.accent} ${soundSettings.volume * 100}%, rgba(255,255,255,0.1) ${soundSettings.volume * 100}%, rgba(255,255,255,0.1) 100%)`,
                      accentColor: ONBOARD.accent,
                    }}
                  />
                </motion.div>
              )}

              {/* Individual sound toggles */}
              {soundSettings.enabled && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-1.5"
                >
                  {([
                    { key: 'taskDone' as const, label: 'Task Complete', desc: 'When AI finishes a task', sound: 'task-done' as const },
                    { key: 'actionRequired' as const, label: 'Action Required', desc: 'When approval is needed', sound: 'action-required' as const },
                    { key: 'errorSound' as const, label: 'Error', desc: 'When something goes wrong', sound: 'error' as const },
                    { key: 'messageSent' as const, label: 'Message Sent', desc: 'When you send a message', sound: 'message-sent' as const },
                  ]).map(({ key, label, desc, sound }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded-xl"
                      style={{ backgroundColor: ONBOARD.card, border: `1px solid ${ONBOARD.border}` }}
                    >
                      <div className="text-left">
                        <p className="text-[12px] font-medium" style={{ color: ONBOARD.text }}>{label}</p>
                        <p className="text-[10px]" style={{ color: ONBOARD.textDim }}>{desc}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => previewSound(sound, soundSettings.volume)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                          style={{ backgroundColor: 'rgba(232,196,160,0.1)' }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(232,196,160,0.2)' }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(232,196,160,0.1)' }}
                          title="Preview sound"
                        >
                          <Play size={11} style={{ color: ONBOARD.accent }} />
                        </button>
                        <button
                          onClick={() => setSoundSettings(s => ({ ...s, [key]: !s[key] }))}
                          className="w-10 h-5 rounded-full relative transition-all duration-200"
                          style={{
                            backgroundColor: soundSettings[key] ? ONBOARD.accent : 'rgba(255,255,255,0.1)',
                          }}
                        >
                          <motion.div
                            className="w-4 h-4 rounded-full absolute top-0.5"
                            style={{ backgroundColor: '#fff' }}
                            animate={{ left: soundSettings[key] ? 22 : 2 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Notifications toggle */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ backgroundColor: ONBOARD.card, border: `1px solid ${ONBOARD.border}` }}
              >
                <div className="flex items-center gap-3">
                  {soundSettings.notificationsEnabled ? <Bell size={16} style={{ color: ONBOARD.accent }} /> : <BellOff size={16} style={{ color: ONBOARD.textDim }} />}
                  <div className="text-left">
                    <p className="text-sm font-semibold" style={{ color: ONBOARD.text }}>Desktop Notifications</p>
                    <p className="text-[11px]" style={{ color: ONBOARD.textDim }}>Show system notifications</p>
                  </div>
                </div>
                <button
                  onClick={() => setSoundSettings(s => ({ ...s, notificationsEnabled: !s.notificationsEnabled }))}
                  className="w-12 h-6 rounded-full relative transition-all duration-200"
                  style={{
                    backgroundColor: soundSettings.notificationsEnabled ? ONBOARD.accent : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <motion.div
                    className="w-5 h-5 rounded-full absolute top-0.5"
                    style={{ backgroundColor: '#fff' }}
                    animate={{ left: soundSettings.notificationsEnabled ? 26 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            </motion.div>

            <div className="flex items-center gap-3 justify-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={goBack}
                className="px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2"
                style={{ color: ONBOARD.textMuted, border: `1px solid ${ONBOARD.border}` }}
              >
                <ArrowLeft size={16} />
                Back
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={goNext}
                className="px-10 py-3 rounded-xl text-black font-bold text-base flex items-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${ONBOARD.accent}, #f0d8c0)`,
                  boxShadow: `0 8px 30px ${ONBOARD.accentGlow}`,
                }}
              >
                Continue
                <ArrowRight size={18} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ─── Step 4: API Key ────────────────────────────────────────── */}
        {step === 'apikey' && (
          <motion.div
            key="apikey"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 text-center max-w-xl w-full px-8"
          >
            <StepIndicator current={2} total={3} />

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-xs font-semibold tracking-widest uppercase mb-3"
              style={{ color: ONBOARD.accent }}
            >
              Step 3 of 3 &mdash; Connect AI
            </motion.p>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15, delay: 0.15 }}
              className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: 'rgba(232,196,160,0.1)', border: `1px solid ${ONBOARD.borderActive}` }}
            >
              <Key size={28} style={{ color: ONBOARD.accent }} />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-black mb-2 tracking-tight"
              style={{ color: ONBOARD.text }}
            >
              Connect your AI
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="text-sm mb-5 leading-relaxed"
              style={{ color: ONBOARD.textMuted }}
            >
              Pick a provider and enter your API key. You can add more later in Settings.
            </motion.p>

            {/* Provider Selection — scrollable grid of all providers */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="grid grid-cols-3 gap-2 mb-4 max-h-[180px] overflow-y-auto pr-1"
            >
              {PROVIDER_REGISTRY.map(info => {
                const isActive = selectedProvider === info.id
                const ProvIcon = getProviderIcon(info.id)
                return (
                  <button
                    key={info.id}
                    onClick={() => setSelectedProvider(info.id)}
                    className="flex items-center gap-2.5 p-3 rounded-xl text-left transition-all duration-200"
                    style={{
                      backgroundColor: isActive ? 'rgba(232,196,160,0.12)' : ONBOARD.card,
                      border: `2px solid ${isActive ? ONBOARD.accent : ONBOARD.border}`,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: isActive ? 'rgba(232,196,160,0.2)' : 'rgba(255,255,255,0.05)' }}
                    >
                      <ProvIcon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold truncate" style={{ color: ONBOARD.text }}>{info.name}</p>
                      <p className="text-[9px] truncate" style={{ color: ONBOARD.textMuted }}>{info.description.split('—')[0].trim()}</p>
                    </div>
                  </button>
                )
              })}
            </motion.div>

            {/* API Key Input for selected provider */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-4"
            >
              {(() => {
                const info = PROVIDER_REGISTRY.find(p => p.id === selectedProvider)
                if (!info) return null
                const isOllama = info.id === 'ollama'
                return (
                  <>
                    <input
                      type="password"
                      value={providerKeys[selectedProvider] || ''}
                      onChange={(e) => setProviderKeys(prev => ({ ...prev, [selectedProvider]: e.target.value }))}
                      placeholder={isOllama ? 'No key needed (leave empty)' : info.placeholder}
                      disabled={isOllama}
                      className="w-full px-5 py-3.5 rounded-xl text-sm outline-none transition-all duration-150"
                      style={{ backgroundColor: ONBOARD.card, color: ONBOARD.text, border: `2px solid ${ONBOARD.border}`, opacity: isOllama ? 0.5 : 1 }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = ONBOARD.accent; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(232,196,160,0.1)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = ONBOARD.border; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <p className="text-[11px] mt-2" style={{ color: ONBOARD.textDim }}>
                      {isOllama ? 'Ollama runs locally — no API key required.' : (
                        <>Get your key from{' '}
                        <a href="#" onClick={(e) => { e.preventDefault(); window.artemis.shell.openExternal(info.helpUrl) }} style={{ color: ONBOARD.accent, cursor: 'pointer' }}>{info.name}</a></>
                      )}
                    </p>
                  </>
                )
              })()}
            </motion.div>

            {/* Security & feature notices */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="mb-6 space-y-2"
            >
              <div
                className="flex items-start gap-3 text-left p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(232,196,160,0.03)', border: `1px solid ${ONBOARD.border}` }}
              >
                <Shield size={14} className="shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
                <p className="text-[11px] leading-relaxed" style={{ color: ONBOARD.textMuted }}>
                  <strong style={{ color: ONBOARD.text }}>Keys stay local.</strong> Encrypted on your machine; API calls go direct.
                </p>
              </div>
              <div
                className="flex items-start gap-3 text-left p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(232,196,160,0.03)', border: `1px solid ${ONBOARD.border}` }}
              >
                <Sparkles size={14} className="shrink-0 mt-0.5" style={{ color: ONBOARD.accent }} />
                <p className="text-[11px] leading-relaxed" style={{ color: ONBOARD.textMuted }}>
                  <strong style={{ color: ONBOARD.text }}>Inline Code Completion</strong> — AI ghost-text as you type. Configure in Settings &gt; Code Completion after setup.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-3 justify-center"
            >
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={goBack}
                className="h-11 px-5 rounded-xl text-sm font-medium flex items-center gap-2"
                style={{ color: ONBOARD.textMuted, border: `1px solid ${ONBOARD.border}` }}
              >
                <ArrowLeft size={16} />
                Back
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleFinish()}
                className="h-11 px-6 rounded-xl text-sm font-medium flex items-center gap-2 transition-all duration-150"
                style={{ color: ONBOARD.textMuted, border: `1px solid ${ONBOARD.border}` }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = ONBOARD.borderActive; e.currentTarget.style.color = ONBOARD.text }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = ONBOARD.border; e.currentTarget.style.color = ONBOARD.textMuted }}
              >
                <SkipForward size={16} />
                Skip for now
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleFinish}
                disabled={Object.values(providerKeys).every(k => !k.trim())}
                className="h-11 px-8 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-150"
                style={{
                  background: Object.values(providerKeys).some(k => k.trim()) ? `linear-gradient(135deg, ${ONBOARD.accent}, #f0d8c0)` : ONBOARD.card,
                  color: Object.values(providerKeys).some(k => k.trim()) ? '#000' : ONBOARD.textDim,
                  boxShadow: Object.values(providerKeys).some(k => k.trim()) ? `0 8px 30px ${ONBOARD.accentGlow}` : 'none',
                }}
              >
                Launch Artemis
                <ArrowRight size={18} />
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
