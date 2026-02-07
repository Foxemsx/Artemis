/**
 * Sound System — Web Audio API-based notification sounds.
 * No external audio files needed; all sounds are synthesized.
 */

export type SoundType = 'task-done' | 'action-required' | 'error' | 'message-sent'

export interface SoundSettings {
  enabled: boolean
  volume: number // 0-1
  taskDone: boolean
  actionRequired: boolean
  errorSound: boolean
  messageSent: boolean
  notificationsEnabled: boolean
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.5,
  taskDone: true,
  actionRequired: true,
  errorSound: true,
  messageSent: false,
  notificationsEnabled: true,
}

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

// ─── Sound Generators ────────────────────────────────────────────────────────

function playTaskDone(volume: number) {
  const ctx = getAudioContext()
  const now = ctx.currentTime

  // Pleasant ascending chime: C5 → E5 → G5
  const notes = [523.25, 659.25, 783.99]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, now + i * 0.12)
    gain.gain.linearRampToValueAtTime(volume * 0.3, now + i * 0.12 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + i * 0.12)
    osc.stop(now + i * 0.12 + 0.5)
  })
}

function playActionRequired(volume: number) {
  const ctx = getAudioContext()
  const now = ctx.currentTime

  // Two-tone attention bell: A5 → E5 repeated
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = i % 2 === 0 ? 880 : 659.25
    gain.gain.setValueAtTime(0, now + i * 0.2)
    gain.gain.linearRampToValueAtTime(volume * 0.35, now + i * 0.2 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.25)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + i * 0.2)
    osc.stop(now + i * 0.2 + 0.3)
  }
}

function playError(volume: number) {
  const ctx = getAudioContext()
  const now = ctx.currentTime

  // Low descending buzz: E4 → C4
  const notes = [329.63, 261.63]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, now + i * 0.15)
    gain.gain.linearRampToValueAtTime(volume * 0.15, now + i * 0.15 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.2)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + i * 0.15)
    osc.stop(now + i * 0.15 + 0.25)
  })
}

function playMessageSent(volume: number) {
  const ctx = getAudioContext()
  const now = ctx.currentTime

  // Quick soft pop
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(600, now)
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.05)
  gain.gain.setValueAtTime(volume * 0.2, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.15)
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function playSound(type: SoundType, settings: SoundSettings): void {
  if (!settings.enabled) return

  switch (type) {
    case 'task-done':
      if (settings.taskDone) playTaskDone(settings.volume)
      break
    case 'action-required':
      if (settings.actionRequired) playActionRequired(settings.volume)
      break
    case 'error':
      if (settings.errorSound) playError(settings.volume)
      break
    case 'message-sent':
      if (settings.messageSent) playMessageSent(settings.volume)
      break
  }
}

export function showNotification(title: string, body: string, settings: SoundSettings): void {
  if (!settings.notificationsEnabled) return
  if (!('Notification' in window)) return

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: undefined })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        new Notification(title, { body, icon: undefined })
      }
    })
  }
}

/** Preview a sound at given volume */
export function previewSound(type: SoundType, volume: number): void {
  switch (type) {
    case 'task-done': playTaskDone(volume); break
    case 'action-required': playActionRequired(volume); break
    case 'error': playError(volume); break
    case 'message-sent': playMessageSent(volume); break
  }
}
