import { useRef, useEffect } from 'react'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { Theme } from '../types'

// ─── B&W Terminal Color Themes ──────────────────────────────────────────────
const terminalThemes = {
  dark: {
    background: '#0a0a0a',
    foreground: '#f0f0f0',
    cursor: '#d4a853',
    cursorAccent: '#0a0a0a',
    selectionBackground: '#d4a85340',
    selectionForeground: undefined,
    black: '#1a1a1a',
    red: '#c0392b',
    green: '#4ade80',
    yellow: '#d4a853',
    blue: '#a0a0a0',
    magenta: '#c084fc',
    cyan: '#67e8f9',
    white: '#f0f0f0',
    brightBlack: '#555555',
    brightRed: '#e74c3c',
    brightGreen: '#6ee7b7',
    brightYellow: '#e8c97a',
    brightBlue: '#d0d0d0',
    brightMagenta: '#d8b4fe',
    brightCyan: '#a5f3fc',
    brightWhite: '#ffffff',
  },
  light: {
    background: '#fafafa',
    foreground: '#1a1a1a',
    cursor: '#b8860b',
    cursorAccent: '#ffffff',
    selectionBackground: '#b8860b30',
    selectionForeground: undefined,
    black: '#1a1a1a',
    red: '#c0392b',
    green: '#22c55e',
    yellow: '#b8860b',
    blue: '#666666',
    magenta: '#a855f7',
    cyan: '#06b6d4',
    white: '#f0f0f0',
    brightBlack: '#999999',
    brightRed: '#e74c3c',
    brightGreen: '#4ade80',
    brightYellow: '#d4a853',
    brightBlue: '#888888',
    brightMagenta: '#c084fc',
    brightCyan: '#22d3ee',
    brightWhite: '#1a1a1a',
  },
}

interface Props {
  sessionId: string
  theme: Theme
  isActive: boolean
}

export default function Terminal({ sessionId, theme, isActive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])

  // ─── Initialize Terminal ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerminal({
      theme: terminalThemes[theme],
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
      scrollback: 10000,
      tabStopWidth: 4,
      drawBoldTextInBrightColors: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Fit after initial render
    requestAnimationFrame(() => {
      try { fitAddon.fit() } catch {}
    })

    // Forward user input to the PTY
    const dataDisposable = term.onData((data) => {
      window.artemis.session.write(sessionId, data)
    })

    // Forward resize events to the PTY
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.artemis.session.resize(sessionId, cols, rows)
    })

    // Listen for PTY output
    const removeDataListener = window.artemis.session.onData(sessionId, (data) => {
      term.write(data)
    })

    // Listen for PTY exit
    const removeExitListener = window.artemis.session.onExit(sessionId, (code) => {
      term.write(`\r\n\x1b[90m--- Session ended (exit code ${code}) ---\x1b[0m\r\n`)
    })

    cleanupRef.current = [removeDataListener, removeExitListener]

    // Window resize -> refit
    const handleResize = () => {
      requestAnimationFrame(() => {
        try { fitAddon.fit() } catch {}
      })
    }
    window.addEventListener('resize', handleResize)

    // Container resize -> refit
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { fitAddon.fit() } catch {}
      })
    })
    observer.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      cleanupRef.current.forEach((fn) => fn())
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Sync Theme ───────────────────────────────────────────────────────
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = terminalThemes[theme]
    }
  }, [theme])

  // ─── Fit + Focus on Activate ──────────────────────────────────────────
  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => {
        try { fitAddonRef.current?.fit() } catch {}
        termRef.current?.focus()
      })
    }
  }, [isActive])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ backgroundColor: terminalThemes[theme].background }}
    />
  )
}
