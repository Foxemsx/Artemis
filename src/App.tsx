import React, { useState, useEffect, useCallback, Component, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTheme } from './hooks/useTheme'
import { useOpenCode } from './hooks/useOpenCode'
import TitleBar from './components/TitleBar'
import ThemeSetup from './components/ThemeSetup'
import ActivityBar from './components/ActivityBar'
import Sidebar from './components/Sidebar'
import PanelLayout from './components/PanelLayout'
import StatusBar from './components/StatusBar'
import CommandPalette from './components/CommandPalette'
import type { ActivityView, Project, EditorTab, PtySession } from './types'
import { detectLanguage } from './types'

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

  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [activeView, setActiveView] = useState<ActivityView>('files')
  const [project, setProject] = useState<Project | null>(null)

  const opencode = useOpenCode(project?.id || null)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [keybindMap, setKeybindMap] = useState<Record<string, string>>({})

  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [chatVisible, setChatVisible] = useState(true)
  const [recentProjects, setRecentProjects] = useState<Project[]>([])

  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)

  const [ptyTerminals, setPtyTerminals] = useState<PtySession[]>([])

  const [fileRefreshTrigger, setFileRefreshTrigger] = useState(0)
  const prevStreamingRef = React.useRef(false)

  useEffect(() => {
    opencode.setProjectPath(project?.path || null)
  }, [project?.path, opencode.setProjectPath])

  useEffect(() => {
    if (prevStreamingRef.current && !opencode.isStreaming) {
      setFileRefreshTrigger(prev => prev + 1)
    }
    prevStreamingRef.current = opencode.isStreaming
  }, [opencode.isStreaming])

  useEffect(() => {
    if (activeTabPath) {
      const fileName = activeTabPath.split(/[\\/]/).pop() || activeTabPath
      const tab = editorTabs.find(t => t.path === activeTabPath)
      const language = tab?.language
      window.artemis.discord.updatePresence(fileName, language, project?.name).catch(() => {})
    } else {
      window.artemis.discord.updatePresence(undefined, undefined, project?.name).catch(() => {})
    }
  }, [activeTabPath, project?.name])

  useEffect(() => {
    Promise.all([
      window.artemis.store.get('setupComplete'),
      window.artemis.store.get('lastProject'),
      window.artemis.store.get('recentProjects'),
    ])
      .then(([setup, savedProject, savedRecentProjects]) => {
        console.log('[Artemis] Store loaded:', { setup, project: savedProject?.name || null })
        setSetupComplete(!!setup)
        if (savedProject && typeof savedProject === 'object' && savedProject.path) {
          setProject(savedProject as Project)
        }
        if (Array.isArray(savedRecentProjects)) {
          setRecentProjects(savedRecentProjects as Project[])
        }
      })
      .catch((err) => {
        console.error('[Artemis] Failed to load store:', err)
        setSetupComplete(false)
      })
  }, [])

  const { hasApiKey, projectSessions, createSession } = opencode

  useEffect(() => {
    if (hasApiKey && projectSessions.length === 0) {
      createSession()
    }
  }, [hasApiKey, projectSessions.length, project?.id, createSession])

  useEffect(() => {
    if (setupComplete && ptyTerminals.length === 0) {
      const timer = setTimeout(() => {
        createTerminal()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [setupComplete])

  useEffect(() => {
    window.artemis.store.get('keybinds').then((saved: any) => {
      if (saved && typeof saved === 'object') {
        setKeybindMap(saved)
      }
    }).catch(() => {})
  }, [])

  const handleSetupComplete = useCallback(
    async (selectedTheme: string, apiKeys?: { provider: 'zen' | 'zai'; key: string }[]) => {
      console.log('[Artemis] Setup complete, theme:', selectedTheme)
      setTheme(selectedTheme as 'dark' | 'light')
      setSetupComplete(true)
      await window.artemis.store.set('setupComplete', true)
      
      if (apiKeys && apiKeys.length > 0) {
        const pendingKeys: Record<string, string> = {}
        for (const { provider, key } of apiKeys) {
          pendingKeys[provider] = key
        }
        await window.artemis.store.set('pendingApiKeys', pendingKeys)
      }
    },
    [setTheme]
  )

  const addProject = useCallback(async () => {
    const result = await window.artemis.dialog.openFolder()
    if (!result) return

    if (project && project.path !== result.path) {
      setEditorTabs([])
      setActiveTabPath(null)
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

    setRecentProjects((prev) => {
      const filtered = prev.filter((p) => p.path !== newProject.path)
      const updated = [newProject, ...filtered].slice(0, 10)
      window.artemis.store.set('recentProjects', updated)
      return updated
    })
  }, [project, ptyTerminals])

  const selectProject = useCallback(async (selectedProject: Project) => {
    if (project && project.path !== selectedProject.path) {
      setEditorTabs([])
      setActiveTabPath(null)
      for (const term of ptyTerminals) {
        try { await window.artemis.session.kill(term.id) } catch {}
      }
      setPtyTerminals([])
    }

    const updated = { ...selectedProject, lastOpened: Date.now() }
    setProject(updated)
    window.artemis.store.set('lastProject', updated)

    setRecentProjects((prev) => {
      const filtered = prev.filter((p) => p.path !== updated.path)
      const next = [updated, ...filtered].slice(0, 10)
      window.artemis.store.set('recentProjects', next)
      return next
    })
  }, [project, ptyTerminals])

  const removeProject = useCallback((projectId: string) => {
    setRecentProjects((prev) => {
      const filtered = prev.filter((p) => p.id !== projectId)
      window.artemis.store.set('recentProjects', filtered)
      return filtered
    })
  }, [])

  const handleOpenProjectDirectory = useCallback(async (projectPath: string) => {
    try {
      await window.artemis.shell.openPath(projectPath)
    } catch (err) {
      console.error('Failed to open directory:', err)
    }
  }, [])

  const openFile = useCallback(async (filePath: string) => {
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
      if (activeTabPath === path) {
        setActiveTabPath(next.length > 0 ? next[next.length - 1].path : null)
      }
      return next
    })
  }, [activeTabPath])

  const closeOtherTabs = useCallback((keepPath: string) => {
    setEditorTabs((prev) => prev.filter((t) => t.path === keepPath || t.isPinned))
    setActiveTabPath(keepPath)
  }, [])

  const closeAllTabs = useCallback(() => {
    setEditorTabs((prev) => {
      const pinned = prev.filter(t => t.isPinned)
      return pinned
    })
    setActiveTabPath((prev) => {
      return prev
    })
  }, [])

  const closeTabsToRight = useCallback((path: string) => {
    setEditorTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path)
      const left = prev.slice(0, idx + 1)
      const rightPinned = prev.slice(idx + 1).filter(t => t.isPinned)
      const next = [...left, ...rightPinned]
      if (activeTabPath && !next.find(t => t.path === activeTabPath)) {
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

  const pinTab = useCallback((path: string) => {
    setEditorTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, isPinned: true } : t))
    )
  }, [])

  const unpinTab = useCallback((path: string) => {
    setEditorTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, isPinned: false } : t))
    )
  }, [])

  const reorderTabs = useCallback((fromPath: string, toPath: string) => {
    setEditorTabs((prev) => {
      const tabs = [...prev]
      const fromIndex = tabs.findIndex(t => t.path === fromPath)
      const toIndex = tabs.findIndex(t => t.path === toPath)
      if (fromIndex === -1 || toIndex === -1) return prev
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return tabs
    })
  }, [])

  const deletePath = useCallback(async (filePath: string) => {
    try {
      await window.artemis.fs.delete(filePath)
      setEditorTabs(prev => prev.filter(t => t.path !== filePath.replace(/\\/g, '/')))
    } catch (err) {
      console.error('[Artemis] Failed to delete:', err)
    }
  }, [])

  const renamePath = useCallback(async (oldPath: string, newName: string) => {
    try {
      const dir = oldPath.replace(/[\\/][^\\/]+$/, '')
      const newPath = `${dir}/${newName}`.replace(/\\/g, '/')
      await window.artemis.fs.rename(oldPath.replace(/\\/g, '/'), newPath)
      setEditorTabs(prev => prev.map(t =>
        t.path === oldPath.replace(/\\/g, '/') ? { ...t, path: newPath, name: newName } : t
      ))
      if (activeTabPath === oldPath.replace(/\\/g, '/')) {
        setActiveTabPath(newPath)
      }
    } catch (err) {
      console.error('[Artemis] Failed to rename:', err)
    }
  }, [project, activeTabPath])

  const createFileInDir = useCallback(async (dirPath: string, name: string) => {
    try {
      const fullPath = `${dirPath}/${name}`.replace(/\\/g, '/')
      await window.artemis.fs.writeFile(fullPath, '')
      openFile(fullPath)
    } catch (err) {
      console.error('[Artemis] Failed to create file:', err)
    }
  }, [openFile])

  const createFolderInDir = useCallback(async (dirPath: string, name: string) => {
    try {
      const fullPath = `${dirPath}/${name}`.replace(/\\/g, '/')
      await window.artemis.fs.createDir(fullPath)
    } catch (err) {
      console.error('[Artemis] Failed to create folder:', err)
    }
  }, [])

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

  const switchView = useCallback((view: ActivityView) => {
    setActiveView(view)
    setShowCommandPalette(false)
  }, [])

  const handleCreateSession = useCallback(() => {
    opencode.createSession()
  }, [opencode])

  const handleSendMessage = useCallback(async (text: string, fileContext?: string, modeOverride?: import('./types').AgentMode, planText?: string, images?: Array<{ id: string; url: string; name: string }>) => {
    await opencode.sendMessage(text, fileContext, modeOverride, planText, images)
  }, [opencode])

  const resetSetup = useCallback(async () => {
    await window.artemis.store.set('setupComplete', false)
    setSetupComplete(false)
  }, [])

  useEffect(() => {
    const defaults: Record<string, string> = {
      commandPalette: 'Ctrl+K',
      newSession: 'Ctrl+N',
      search: 'Ctrl+Shift+F',
      quickSearch: 'Ctrl+T',
      toggleSidebar: 'Ctrl+B',
      toggleChat: 'Ctrl+J',
      newTerminal: 'Ctrl+`',
      saveFile: 'Ctrl+S',
      closeTab: 'Ctrl+W',
      settings: 'Ctrl+,',
    }

    const getBinding = (id: string) => keybindMap[id] || defaults[id] || ''

    const matchesBinding = (e: KeyboardEvent, binding: string): boolean => {
      const parts = binding.split('+')
      const key = parts[parts.length - 1]
      const needsCtrl = parts.includes('Ctrl')
      const needsShift = parts.includes('Shift')
      const needsAlt = parts.includes('Alt')

      if (needsCtrl !== (e.ctrlKey || e.metaKey)) return false
      if (needsShift !== e.shiftKey) return false
      if (needsAlt !== e.altKey) return false

      let pressedKey = e.key
      if (pressedKey === ' ') pressedKey = 'Space'
      else if (pressedKey.length === 1) pressedKey = pressedKey.toUpperCase()

      return pressedKey === key || pressedKey.toLowerCase() === key.toLowerCase()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (e.key === 'Escape' && showCommandPalette) {
        setShowCommandPalette(false)
        return
      }

      if (matchesBinding(e, getBinding('commandPalette'))) {
        e.preventDefault()
        setShowCommandPalette(prev => !prev)
        return
      }

      if (matchesBinding(e, getBinding('saveFile'))) {
        e.preventDefault()
        if (activeTabPath) {
          const tab = editorTabs.find(t => t.path === activeTabPath)
          if (tab && tab.isDirty) {
            saveFile(activeTabPath, tab.content)
          }
        }
        return
      }

      if (isInput) return

      if (matchesBinding(e, getBinding('newSession'))) {
        e.preventDefault()
        opencode.createSession()
        return
      }

      if (matchesBinding(e, getBinding('search'))) {
        e.preventDefault()
        setActiveView('search')
        return
      }

      if (matchesBinding(e, getBinding('quickSearch'))) {
        e.preventDefault()
        setActiveView('search')
        return
      }

      if (matchesBinding(e, getBinding('toggleSidebar'))) {
        e.preventDefault()
        setSidebarVisible(prev => !prev)
        return
      }

      if (matchesBinding(e, getBinding('toggleChat'))) {
        e.preventDefault()
        setChatVisible(prev => !prev)
        return
      }

      if (matchesBinding(e, getBinding('newTerminal'))) {
        e.preventDefault()
        setActiveView('terminal')
        createTerminal()
        return
      }

      if (matchesBinding(e, getBinding('closeTab'))) {
        e.preventDefault()
        if (activeTabPath) {
          closeTab(activeTabPath)
        }
        return
      }

      if (matchesBinding(e, getBinding('settings'))) {
        e.preventDefault()
        setActiveView('settings')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCommandPalette, keybindMap, activeTabPath, editorTabs, saveFile, opencode, createTerminal, closeTab])


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

  if (!setupComplete) {
    return <ThemeSetup onComplete={handleSetupComplete} />
  }

  return (
    <ErrorBoundary>
      <div
        className="h-screen flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <TitleBar
          onToggleSidebar={() => setSidebarVisible(prev => !prev)}
          onToggleChat={() => setChatVisible(prev => !prev)}
          onNewTerminal={() => { setActiveView('terminal'); createTerminal() }}
          onOpenSettings={() => setActiveView('settings')}
          sidebarVisible={sidebarVisible}
          chatVisible={chatVisible}
        />

        <div className="flex flex-1 overflow-hidden">
          <ActivityBar
            activeView={activeView}
            onViewChange={switchView}
            isReady={opencode.isReady}
            hasApiKey={opencode.hasApiKey}
            activeModel={opencode.activeModel}
            sessionTokenUsage={opencode.sessionTokenUsage}
            totalTokenUsage={opencode.totalTokenUsage}
          />

          {sidebarVisible && (
            <Sidebar
              sessions={opencode.projectSessions}
              allSessions={opencode.sessions}
              activeSessionId={opencode.activeSessionId}
              streamingSessionIds={opencode.streamingSessionIds}
              onCreateSession={handleCreateSession}
              onSelectSession={opencode.selectSession}
              onDeleteSession={opencode.deleteSession}
              onRenameSession={opencode.renameSession}
              project={project}
              recentProjects={recentProjects}
              onAddProject={addProject}
              onSelectProject={selectProject}
              onRemoveProject={removeProject}
              onOpenProjectDirectory={handleOpenProjectDirectory}
              activeModel={opencode.activeModel}
              isReady={opencode.isReady}
              hasApiKey={opencode.hasApiKey}
              sessionTokenUsage={opencode.sessionTokenUsage}
              totalTokenUsage={opencode.totalTokenUsage}
            />
          )}

          <PanelLayout
            activeView={activeView}
            theme={theme}
            projectPath={project?.path || null}
            editorTabs={editorTabs}
            activeTabPath={activeTabPath}
            onOpenFile={openFile}
            onCloseTab={closeTab}
            onCloseOtherTabs={closeOtherTabs}
            onCloseAllTabs={closeAllTabs}
            onCloseTabsToRight={closeTabsToRight}
            onSelectTab={selectTab}
            onSaveFile={saveFile}
            onTabContentChange={handleTabContentChange}
            onPinTab={pinTab}
            onUnpinTab={unpinTab}
            onReorderTabs={reorderTabs}
            onDeletePath={deletePath}
            onRenamePath={renamePath}
            onCreateFile={createFileInDir}
            onCreateFolder={createFolderInDir}
            sessions={opencode.projectSessions}
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
            editApprovalMode={opencode.editApprovalMode}
            onEditApprovalModeChange={opencode.setEditApprovalMode}
            onClearMessages={opencode.clearMessages}
            checkpoints={opencode.checkpoints}
            onRestoreCheckpoint={opencode.restoreToCheckpoint}
            onOpenTerminal={() => {
              setActiveView('terminal')
              createTerminal()
            }}
            ptyTerminals={ptyTerminals}
            onNewTerminal={createTerminal}
            onCloseTerminal={closeTerminal}
            onToggleTheme={toggleTheme}
            onSetTheme={setTheme}
            apiKeys={opencode.apiKeys}
            onSetApiKey={opencode.setApiKey}
            soundSettings={opencode.soundSettings}
            onSetSoundSettings={opencode.setSoundSettings}
            fileRefreshTrigger={fileRefreshTrigger}
            chatVisible={chatVisible}
          />
        </div>

        <StatusBar
          projectName={project?.name || null}
          isReady={opencode.isReady}
          hasApiKey={opencode.hasApiKey}
          activeModel={opencode.activeModel}
          sessionTokenUsage={opencode.sessionTokenUsage}
          totalTokenUsage={opencode.totalTokenUsage}
          streamingSpeed={opencode.streamingSpeed}
          projectTokenCount={opencode.projectTokenCount}
        />

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
