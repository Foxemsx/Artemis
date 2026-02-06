import { useState, useEffect, useCallback, Component, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTheme } from './hooks/useTheme'
import { useOpenCode } from './hooks/useOpenCode'
import TitleBar from './components/TitleBar'
import ThemeSetup from './components/ThemeSetup'
import ActivityBar from './components/ActivityBar'
import PanelLayout from './components/PanelLayout'
import StatusBar from './components/StatusBar'
import CommandPalette from './components/CommandPalette'
import type { ActivityView, Project, EditorTab, PtySession } from './types'
import { detectLanguage } from './types'

// ─── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: any) {
    console.error('[Artemis] React render error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a',
            color: '#f0f0f0',
            fontFamily: "'JetBrains Mono', 'Inter', system-ui, sans-serif",
            padding: 32,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: '#c0392b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <span style={{ color: '#fff', fontSize: 20, fontWeight: 900 }}>!</span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 12, color: '#888', maxWidth: 400, marginBottom: 16 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
            }}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              background: '#d4a853',
              color: '#000',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { theme, setTheme, toggleTheme, isLoaded } = useTheme()
  const opencode = useOpenCode()

  // ─── Core State ──────────────────────────────────────────────────────────
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [activeView, setActiveView] = useState<ActivityView>('files')
  const [project, setProject] = useState<Project | null>(null)
  const [showCommandPalette, setShowCommandPalette] = useState(false)

  // ─── Editor State ────────────────────────────────────────────────────────
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)

  // ─── Terminal State ──────────────────────────────────────────────────────
  const [ptyTerminals, setPtyTerminals] = useState<PtySession[]>([])

  // ─── Load Persisted State on Mount ───────────────────────────────────────
  useEffect(() => {
    Promise.all([
      window.artemis.store.get('setupComplete'),
      window.artemis.store.get('lastProject'),
    ])
      .then(([setup, savedProject]) => {
        console.log('[Artemis] Store loaded:', { setup, project: savedProject?.name || null })
        setSetupComplete(!!setup)
        if (savedProject && typeof savedProject === 'object' && savedProject.path) {
          setProject(savedProject as Project)
        }
      })
      .catch((err) => {
        console.error('[Artemis] Failed to load store:', err)
        setSetupComplete(false)
      })
  }, [])

  // Auto-create a chat session when ready and no sessions exist
  useEffect(() => {
    if (opencode.hasApiKey && opencode.sessions.length === 0) {
      opencode.createSession()
    }
  }, [opencode.hasApiKey, opencode.sessions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-create a terminal on startup (once app is loaded and setup is complete)
  useEffect(() => {
    if (setupComplete && ptyTerminals.length === 0) {
      // Small delay to ensure layout is ready
      const timer = setTimeout(() => {
        createTerminal()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [setupComplete]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Keyboard Shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette((prev) => !prev)
      }
      if (e.key === 'Escape' && showCommandPalette) {
        setShowCommandPalette(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCommandPalette])

  // ─── Setup Complete Handler ──────────────────────────────────────────────
  const handleSetupComplete = useCallback(
    async (selectedTheme: string, apiKey?: string) => {
      console.log('[Artemis] Setup complete, theme:', selectedTheme)
      setTheme(selectedTheme as 'dark' | 'light')
      setSetupComplete(true)
      await window.artemis.store.set('setupComplete', true)
      
      // Set API key directly via the Zen client
      if (apiKey) {
        await opencode.setApiKey(apiKey)
      }
    },
    [setTheme, opencode]
  )

  // ─── Project Management ─────────────────────────────────────────────────
  const addProject = useCallback(async () => {
    const result = await window.artemis.dialog.openFolder()
    if (!result) return

    // Clear editor/terminal state if switching projects
    if (project && project.path !== result.path) {
      setEditorTabs([])
      setActiveTabPath(null)
      // Kill existing terminals
      for (const term of ptyTerminals) {
        try { await window.artemis.session.kill(term.id) } catch {}
      }
      setPtyTerminals([])
    }

    const id = `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const newProject: Project = {
      id,
      name: result.name,
      path: result.path,
      lastOpened: Date.now(),
    }

    setProject(newProject)
    window.artemis.store.set('lastProject', newProject)
  }, [project, ptyTerminals])

  // ─── File Operations ──────────────────────────────────────────────────────
  const openFile = useCallback(async (filePath: string) => {
    // Check if tab already open
    const existing = editorTabs.find((t) => t.path === filePath)
    if (existing) {
      setActiveTabPath(filePath)
      return
    }

    try {
      const content = await window.artemis.fs.readFile(filePath)
      const name = filePath.split(/[\\/]/).pop() || filePath
      const language = detectLanguage(name)

      const newTab: EditorTab = {
        path: filePath,
        name,
        language,
        content,
        isDirty: false,
      }

      setEditorTabs((prev) => [...prev, newTab])
      setActiveTabPath(filePath)
    } catch (err) {
      console.error('[Artemis] Failed to read file:', err)
    }
  }, [editorTabs])

  const closeTab = useCallback((path: string) => {
    setEditorTabs((prev) => {
      const next = prev.filter((t) => t.path !== path)
      // If closing the active tab, switch to the last remaining tab
      if (activeTabPath === path) {
        setActiveTabPath(next.length > 0 ? next[next.length - 1].path : null)
      }
      return next
    })
  }, [activeTabPath])

  const selectTab = useCallback((path: string) => {
    setActiveTabPath(path)
  }, [])

  const saveFile = useCallback(async (path: string, content: string) => {
    try {
      await window.artemis.fs.writeFile(path, content)
      setEditorTabs((prev) =>
        prev.map((t) => (t.path === path ? { ...t, content, isDirty: false } : t))
      )
    } catch (err) {
      console.error('[Artemis] Failed to save file:', err)
    }
  }, [])

  const handleTabContentChange = useCallback((path: string, content: string) => {
    setEditorTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, content, isDirty: true } : t))
    )
  }, [])

  // ─── Terminal Operations ──────────────────────────────────────────────────
  const createTerminal = useCallback(async () => {
    const cwd = project?.path || '.'
    const id = `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const termNumber = ptyTerminals.length + 1

    const newTerm: PtySession = {
      id,
      name: `Terminal ${termNumber}`,
      status: 'running',
      createdAt: Date.now(),
    }

    const result = await window.artemis.session.create(id, cwd)
    if (result?.error) {
      console.error('[Artemis] Terminal creation failed:', result.error)
      return
    }

    setPtyTerminals((prev) => [...prev, newTerm])

    // Listen for exit
    const removeExitListener = window.artemis.session.onExit(id, (code) => {
      setPtyTerminals((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: (code === 0 ? 'exited' : 'error') as PtySession['status'], exitCode: code } : t
        )
      )
      removeExitListener()
    })
  }, [project, ptyTerminals])

  const closeTerminal = useCallback(async (id: string) => {
    try {
      await window.artemis.session.kill(id)
    } catch {}
    setPtyTerminals((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // ─── View Switching ──────────────────────────────────────────────────────
  const switchView = useCallback((view: ActivityView) => {
    setActiveView(view)
    setShowCommandPalette(false)
  }, [])

  // ─── Chat Wrappers ────────────────────────────────────────────────────────
  const handleCreateSession = useCallback(() => {
    opencode.createSession()
  }, [opencode])

  const handleSendMessage = useCallback(async (text: string) => {
    await opencode.sendMessage(text)
  }, [opencode])

  // ─── Reset Setup (show intro again) ───────────────────────────────────────
  const resetSetup = useCallback(async () => {
    await window.artemis.store.set('setupComplete', false)
    setSetupComplete(false)
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────

  // Loading: wait for theme + setup status
  if (!isLoaded || setupComplete === null) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: '#0a0a0a' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            backgroundColor: '#d4a853',
            boxShadow: '0 8px 40px rgba(212, 168, 83, 0.25)',
          }}
        >
          <span className="text-xl font-black text-black">A</span>
        </motion.div>
      </div>
    )
  }

  // First-time setup
  if (!setupComplete) {
    return <ThemeSetup onComplete={handleSetupComplete} />
  }

  // Main app layout
  return (
    <ErrorBoundary>
      <div
        className="h-screen flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <TitleBar />

        <div className="flex flex-1 overflow-hidden">
          <ActivityBar
            activeView={activeView}
            onViewChange={switchView}
            isReady={opencode.isReady}
            hasApiKey={opencode.hasApiKey}
          />

          <PanelLayout
            activeView={activeView}
            theme={theme}
            projectPath={project?.path || null}
            // Editor
            editorTabs={editorTabs}
            activeTabPath={activeTabPath}
            onOpenFile={openFile}
            onCloseTab={closeTab}
            onSelectTab={selectTab}
            onSaveFile={saveFile}
            onTabContentChange={handleTabContentChange}
            // Chat
            sessions={opencode.sessions}
            activeSessionId={opencode.activeSessionId}
            messages={opencode.messages}
            isStreaming={opencode.isStreaming}
            isReady={opencode.isReady}
            hasApiKey={opencode.hasApiKey}
            error={opencode.error}
            providers={opencode.providers}
            activeModel={opencode.activeModel}
            agentMode={opencode.agentMode}
            onCreateSession={handleCreateSession}
            onSelectSession={opencode.selectSession}
            onDeleteSession={opencode.deleteSession}
            onSendMessage={handleSendMessage}
            onAbortMessage={opencode.abortMessage}
            onSelectModel={opencode.setActiveModel}
            onAgentModeChange={opencode.setAgentMode}
            // Terminal
            ptyTerminals={ptyTerminals}
            onNewTerminal={createTerminal}
            onCloseTerminal={closeTerminal}
            // Settings
            onToggleTheme={toggleTheme}
            onSetApiKey={opencode.setApiKey}
          />
        </div>

        <StatusBar
          projectName={project?.name || null}
          isReady={opencode.isReady}
          hasApiKey={opencode.hasApiKey}
          activeModel={opencode.activeModel}
        />

        {/* Command Palette Overlay */}
        <AnimatePresence>
          {showCommandPalette && (
            <CommandPalette
              onClose={() => setShowCommandPalette(false)}
              activeView={activeView}
              projectName={project?.name || null}
              onAddProject={addProject}
              onToggleTheme={toggleTheme}
              onSwitchView={switchView}
              onResetSetup={resetSetup}
              theme={theme}
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  )
}
