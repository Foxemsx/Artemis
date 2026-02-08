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
  cyberpunk: {
    background: '#0b0014',
    foreground: '#e0d0ff',
    cursor: '#ff2ecb',
    cursorAccent: '#0b0014',
    selectionBackground: '#ff2ecb40',
    selectionForeground: undefined,
    black: '#1a0030',
    red: '#ff2255',
    green: '#00ff88',
    yellow: '#ffaa00',
    blue: '#00f0ff',
    magenta: '#ff2ecb',
    cyan: '#00f0ff',
    white: '#e0d0ff',
    brightBlack: '#604090',
    brightRed: '#ff4477',
    brightGreen: '#33ffaa',
    brightYellow: '#ffcc33',
    brightBlue: '#33f0ff',
    brightMagenta: '#ff5ed5',
    brightCyan: '#66f5ff',
    brightWhite: '#f0e0ff',
  },
  nord: {
    background: '#2e3440',
    foreground: '#eceff4',
    cursor: '#88c0d0',
    cursorAccent: '#2e3440',
    selectionBackground: '#88c0d040',
    selectionForeground: undefined,
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
  },
  monokai: {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f92672',
    cursorAccent: '#272822',
    selectionBackground: '#f9267240',
    selectionForeground: undefined,
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#e6db74',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#e6db74',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5',
  },
  solarized: {
    background: '#002b36',
    foreground: '#fdf6e3',
    cursor: '#b58900',
    cursorAccent: '#002b36',
    selectionBackground: '#b5890040',
    selectionForeground: undefined,
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#586e75',
    brightRed: '#cb4b16',
    brightGreen: '#859900',
    brightYellow: '#b58900',
    brightBlue: '#268bd2',
    brightMagenta: '#6c71c4',
    brightCyan: '#2aa198',
    brightWhite: '#fdf6e3',
  },
  dracula: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#bd93f9',
    cursorAccent: '#282a36',
    selectionBackground: '#bd93f940',
    selectionForeground: undefined,
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
  rosepine: {
    background: '#191724',
    foreground: '#e0def4',
    cursor: '#ebbcba',
    cursorAccent: '#191724',
    selectionBackground: '#ebbcba40',
    selectionForeground: undefined,
    black: '#26233a',
    red: '#eb6f92',
    green: '#9ccfd8',
    yellow: '#f6c177',
    blue: '#31748f',
    magenta: '#c4a7e7',
    cyan: '#9ccfd8',
    white: '#e0def4',
    brightBlack: '#6e6a86',
    brightRed: '#eb6f92',
    brightGreen: '#9ccfd8',
    brightYellow: '#f6c177',
    brightBlue: '#31748f',
    brightMagenta: '#c4a7e7',
    brightCyan: '#9ccfd8',
    brightWhite: '#e0def4',
  },
  pine: {
    background: '#1c1917',
    foreground: '#fafaf9',
    cursor: '#65a30d',
    cursorAccent: '#1c1917',
    selectionBackground: '#65a30d40',
    selectionForeground: undefined,
    black: '#292524',
    red: '#dc2626',
    green: '#65a30d',
    yellow: '#d97706',
    blue: '#57534e',
    magenta: '#a16207',
    cyan: '#059669',
    white: '#fafaf9',
    brightBlack: '#78716c',
    brightRed: '#ef4444',
    brightGreen: '#84cc16',
    brightYellow: '#f59e0b',
    brightBlue: '#78716c',
    brightMagenta: '#ca8a04',
    brightCyan: '#10b981',
    brightWhite: '#ffffff',
  },
  catppuccin: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5c2e7',
    cursorAccent: '#1e1e2e',
    selectionBackground: '#f5c2e740',
    selectionForeground: undefined,
    black: '#302d41',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#cdd6f4',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#ffffff',
  },
  gruvbox: {
    background: '#282828',
    foreground: '#ebdbb2',
    cursor: '#fabd2f',
    cursorAccent: '#282828',
    selectionBackground: '#fabd2f40',
    selectionForeground: undefined,
    black: '#32302f',
    red: '#fb4934',
    green: '#b8bb26',
    yellow: '#fabd2f',
    blue: '#83a598',
    magenta: '#d3869b',
    cyan: '#8ec07c',
    white: '#ebdbb2',
    brightBlack: '#928374',
    brightRed: '#fb4934',
    brightGreen: '#b8bb26',
    brightYellow: '#fabd2f',
    brightBlue: '#83a598',
    brightMagenta: '#d3869b',
    brightCyan: '#8ec07c',
    brightWhite: '#fbf1c7',
  },
  materialocean: {
    background: '#0f1419',
    foreground: '#e2e8f0',
    cursor: '#22d3ee',
    cursorAccent: '#0f1419',
    selectionBackground: '#22d3ee40',
    selectionForeground: undefined,
    black: '#131d27',
    red: '#f43f5e',
    green: '#4ade80',
    yellow: '#fbbf24',
    blue: '#22d3ee',
    magenta: '#a855f7',
    cyan: '#22d3ee',
    white: '#e2e8f0',
    brightBlack: '#475569',
    brightRed: '#f43f5e',
    brightGreen: '#4ade80',
    brightYellow: '#fbbf24',
    brightBlue: '#22d3ee',
    brightMagenta: '#a855f7',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  },
  everforest: {
    background: '#2b3339',
    foreground: '#d3c6aa',
    cursor: '#a7c080',
    cursorAccent: '#2b3339',
    selectionBackground: '#a7c08040',
    selectionForeground: undefined,
    black: '#323c41',
    red: '#e67e80',
    green: '#a7c080',
    yellow: '#dbbc7f',
    blue: '#7fbbb3',
    magenta: '#d699b6',
    cyan: '#83c092',
    white: '#d3c6aa',
    brightBlack: '#7a6f5b',
    brightRed: '#e67e80',
    brightGreen: '#a7c080',
    brightYellow: '#dbbc7f',
    brightBlue: '#7fbbb3',
    brightMagenta: '#d699b6',
    brightCyan: '#83c092',
    brightWhite: '#f4f0e9',
  },
  sakura: {
    background: '#2a2527',
    foreground: '#f5e6d3',
    cursor: '#ffb7c5',
    cursorAccent: '#2a2527',
    selectionBackground: '#ffb7c540',
    selectionForeground: undefined,
    black: '#353031',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ffd700',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#8fbcbb',
    white: '#f5e6d3',
    brightBlack: '#a89486',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ffd700',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#fffbf0',
  },
  beach: {
    background: '#fef3e2',
    foreground: '#5d4e37',
    cursor: '#0ea5e9',
    cursorAccent: '#fef3e2',
    selectionBackground: '#0ea5e930',
    selectionForeground: undefined,
    black: '#5d4e37',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#f59e0b',
    blue: '#0ea5e9',
    magenta: '#f97316',
    cyan: '#06b6d4',
    white: '#fffbf0',
    brightBlack: '#8b7355',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#f59e0b',
    brightBlue: '#0ea5e9',
    brightMagenta: '#f97316',
    brightCyan: '#22d3ee',
    brightWhite: '#5d4e37',
  },
  space: {
    background: '#0a0a12',
    foreground: '#e8e8ff',
    cursor: '#a855f7',
    cursorAccent: '#0a0a12',
    selectionBackground: '#a855f740',
    selectionForeground: undefined,
    black: '#12121f',
    red: '#f472b6',
    green: '#4ade80',
    yellow: '#fbbf24',
    blue: '#a855f7',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e8e8ff',
    brightBlack: '#606080',
    brightRed: '#f472b6',
    brightGreen: '#4ade80',
    brightYellow: '#fbbf24',
    brightBlue: '#a855f7',
    brightMagenta: '#c084fc',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  },
} satisfies Record<Theme, any>

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
