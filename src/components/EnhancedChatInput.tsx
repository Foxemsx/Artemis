import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Command, FileText, Folder, Trash2, HelpCircle, Sparkles, AtSign, X, Terminal, Search, Globe, BookOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
}

// Parse content to find commands and mentions
function parseContent(content: string): Array<{ type: 'text' | 'command' | 'mention'; text: string }> {
  const parts: Array<{ type: 'text' | 'command' | 'mention'; text: string }> = []
  let remaining = content
  let consumed = 0
  
  while (remaining.length > 0) {
    // Find command (starts with / followed by word chars)
    // Only match if at the very beginning of input or after whitespace
    const commandMatch = remaining.match(/^(\s*)(\/\w+)/)
    if (commandMatch) {
      const posBeforeSlash = consumed + (commandMatch[1]?.length || 0)
      const charBefore = posBeforeSlash > 0 ? content[posBeforeSlash - 1] : null
      const isValidCommand = charBefore === null || charBefore === ' ' || charBefore === '\n' || charBefore === '\r' || charBefore === '\t'
      
      if (isValidCommand) {
        if (commandMatch[1]) {
          parts.push({ type: 'text', text: commandMatch[1] })
        }
        parts.push({ type: 'command', text: commandMatch[2] })
        consumed += commandMatch[0].length
        remaining = remaining.slice(commandMatch[0].length)
        continue
      }
    }
    
    // Find mention (starts with @ followed by word chars)
    // Only match if at the beginning or after whitespace
    const mentionMatch = remaining.match(/^(\s*)(@[\w./-]+)/)
    if (mentionMatch) {
      const posBeforeAt = consumed + (mentionMatch[1]?.length || 0)
      const charBefore = posBeforeAt > 0 ? content[posBeforeAt - 1] : null
      const isValidMention = charBefore === null || charBefore === ' ' || charBefore === '\n' || charBefore === '\r' || charBefore === '\t'
      
      if (isValidMention) {
        if (mentionMatch[1]) {
          parts.push({ type: 'text', text: mentionMatch[1] })
        }
        parts.push({ type: 'mention', text: mentionMatch[2] })
        consumed += mentionMatch[0].length
        remaining = remaining.slice(mentionMatch[0].length)
        continue
      }
    }
    
    // Take next char as text
    parts.push({ type: 'text', text: remaining[0] })
    consumed += 1
    remaining = remaining.slice(1)
  }
  
  // Merge consecutive text parts
  const merged: Array<{ type: 'text' | 'command' | 'mention'; text: string }> = []
  for (const part of parts) {
    if (merged.length > 0 && merged[merged.length - 1].type === 'text' && part.type === 'text') {
      merged[merged.length - 1].text += part.text
    } else {
      merged.push(part)
    }
  }
  
  return merged
}

interface SlashCommand {
  id: string
  name: string
  description: string
  icon: typeof Command
  shortcut?: string
}

interface MentionItem {
  id: string
  name: string
  path: string
  type: 'file' | 'directory' | 'special'
}

// Special mention items always shown at top
const SPECIAL_MENTIONS: MentionItem[] = [
  { id: '__codebase__', name: 'codebase', path: '__codebase__', type: 'special' },
]

// Recursively index all text files in a project for @codebase context
async function indexCodebase(rootPath: string, maxFiles = 80, maxFileSize = 30000): Promise<string> {
  const ignoreDirs = new Set([
    'node_modules', '.git', 'dist', 'dist-electron', 'build', '.next',
    '__pycache__', '.venv', 'venv', '.cache', 'coverage', '.idea', '.vscode',
  ])
  const ignoreExts = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp',
    'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'avi', 'mov',
    'zip', 'tar', 'gz', 'rar', 'exe', 'dll', 'so', 'dylib',
    'lock', 'map',
  ])

  const files: { path: string; content: string }[] = []

  async function walk(dir: string, depth: number) {
    if (depth > 6 || files.length >= maxFiles) return
    try {
      const entries = await window.artemis.fs.readDir(dir)
      for (const entry of entries) {
        if (files.length >= maxFiles) break
        const fullPath = `${dir}/${entry.name}`.replace(/\\/g, '/')

        if (entry.type === 'directory') {
          if (!ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
            await walk(fullPath, depth + 1)
          }
        } else {
          const ext = entry.name.split('.').pop()?.toLowerCase() || ''
          if (ignoreExts.has(ext)) continue
          if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
          try {
            const stat = await window.artemis.fs.stat(fullPath)
            if (stat.size > maxFileSize || stat.size === 0) continue
            const content = await window.artemis.fs.readFile(fullPath)
            // Skip binary-looking files
            if (content.includes('\0')) continue
            files.push({ path: fullPath, content })
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  await walk(rootPath, 0)

  // Build a compact representation
  const parts = [`[Codebase Index — ${files.length} files from ${rootPath}]\n`]
  for (const f of files) {
    const relPath = f.path.replace(rootPath.replace(/\\/g, '/'), '').replace(/^\//, '')
    // Truncate very long files
    const truncated = f.content.length > 8000
      ? f.content.slice(0, 8000) + '\n... (truncated)'
      : f.content
    parts.push(`\n━━━ ${relPath} ━━━\n${truncated}`)
  }
  return parts.join('\n')
}

// Find a file by name in the project tree (breadth-first)
async function findFileByName(rootPath: string, fileName: string, maxDepth = 4): Promise<string | null> {
  const queue: { path: string; depth: number }[] = [{ path: rootPath, depth: 0 }]
  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv'])
  
  while (queue.length > 0) {
    const { path: dir, depth } = queue.shift()!
    if (depth > maxDepth) continue
    
    try {
      const entries = await window.artemis.fs.readDir(dir)
      for (const entry of entries) {
        const fullPath = `${dir}/${entry.name}`.replace(/\\/g, '/')
        if (entry.name === fileName) return fullPath
        if (entry.type === 'directory' && !ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
          queue.push({ path: fullPath, depth: depth + 1 })
        }
      }
    } catch { /* ignore */ }
  }
  return null
}

interface Props {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  placeholder?: string
  disabled?: boolean
  projectPath: string | null
  /** Ref to expose mention resolution function */
  mentionResolverRef?: React.MutableRefObject<(() => Promise<{ text: string; mentions: { name: string; path: string; content: string }[] }>) | null>
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'new',
    name: 'new',
    description: 'Create a new chat session',
    icon: Sparkles,
    shortcut: 'Ctrl+N',
  },
  {
    id: 'clear',
    name: 'clear',
    description: 'Clear current conversation',
    icon: Trash2,
  },
  {
    id: 'terminal',
    name: 'terminal',
    description: 'Open a new terminal',
    icon: Terminal,
    shortcut: 'Ctrl+`',
  },
  {
    id: 'help',
    name: 'help',
    description: 'Show available commands',
    icon: HelpCircle,
  },
  {
    id: 'init',
    name: 'init',
    description: 'Analyze project and create AGENTS.md',
    icon: BookOpen,
  },
]

export default function EnhancedChatInput({
  value,
  onChange,
  onSend,
  onKeyDown,
  placeholder = 'Ask anything...',
  disabled = false,
  projectPath,
  mentionResolverRef,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mentionPathMapRef = useRef<Map<string, string>>(new Map())
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [mentionFilter, setMentionFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([])
  const [cursorPosition, setCursorPosition] = useState(0)

  // Filter slash commands
  const filteredSlashCommands = useMemo(() => {
    if (!slashFilter) return SLASH_COMMANDS
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(slashFilter.toLowerCase()) ||
        cmd.description.toLowerCase().includes(slashFilter.toLowerCase())
    )
  }, [slashFilter])

  // Filter mention items (with special mentions at top)
  const filteredMentionItems = useMemo(() => {
    const specials = SPECIAL_MENTIONS.filter(s =>
      !mentionFilter || s.name.toLowerCase().includes(mentionFilter.toLowerCase())
    )
    const files = mentionFilter
      ? mentionItems.filter(
          (item) =>
            item.name.toLowerCase().includes(mentionFilter.toLowerCase()) ||
            item.path.toLowerCase().includes(mentionFilter.toLowerCase())
        ).slice(0, 18)
      : mentionItems.slice(0, 18)
    return [...specials, ...files]
  }, [mentionItems, mentionFilter])

  // Load file tree for mentions
  const loadFileTree = useCallback(async () => {
    if (!projectPath) return
    
    try {
      const entries = await window.artemis.fs.readDir(projectPath)
      const items: MentionItem[] = []
      
      const processEntries = async (entries: { name: string; type: 'file' | 'directory' }[], parentPath: string) => {
        for (const entry of entries) {
          const fullPath = `${parentPath}/${entry.name}`.replace(/\\/g, '/')
          items.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            type: entry.type,
          })
          
          // Limit depth and total items
          if (items.length >= 100) break
          
          if (entry.type === 'directory' && items.length < 100) {
            try {
              const children = await window.artemis.fs.readDir(fullPath)
              await processEntries(children.slice(0, 10), fullPath)
            } catch {
              // Ignore errors for restricted directories
            }
          }
        }
      }
      
      await processEntries(entries, projectPath)
      setMentionItems(items)
    } catch {
      setMentionItems([])
    }
  }, [projectPath])

  // Detect context (slash command or mention)
  useEffect(() => {
    const textBeforeCursor = value.slice(0, cursorPosition)
    const lastWord = textBeforeCursor.split(/\s/).pop() || ''

    if (lastWord.startsWith('/') && !lastWord.includes('@')) {
      setShowSlashMenu(true)
      setShowMentionMenu(false)
      setSlashFilter(lastWord.slice(1))
      setSelectedIndex(0)
    } else if (lastWord.startsWith('@') && !lastWord.includes('/')) {
      setShowMentionMenu(true)
      setShowSlashMenu(false)
      setMentionFilter(lastWord.slice(1))
      setSelectedIndex(0)
      loadFileTree()
    } else {
      setShowSlashMenu(false)
      setShowMentionMenu(false)
    }
  }, [value, cursorPosition, loadFileTree])

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSlashMenu(false)
        setShowMentionMenu(false)
      }
    }
    
    if (showSlashMenu || showMentionMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSlashMenu, showMentionMenu])

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    setCursorPosition(e.target.selectionStart)
  }

  // Handle key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu || showMentionMenu) {
      const items = showSlashMenu ? filteredSlashCommands : filteredMentionItems
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % items.length)
          return
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
          return
        case 'Enter':
          e.preventDefault()
          if (items.length > 0) {
            if (showSlashMenu) {
              handleSlashCommandSelect(items[selectedIndex] as SlashCommand)
            } else {
              handleMentionSelect(items[selectedIndex] as MentionItem)
            }
          }
          return
        case 'Escape':
          setShowSlashMenu(false)
          setShowMentionMenu(false)
          return
        case 'Tab':
          e.preventDefault()
          if (items.length > 0) {
            if (showSlashMenu) {
              handleSlashCommandSelect(items[selectedIndex] as SlashCommand)
            } else {
              handleMentionSelect(items[selectedIndex] as MentionItem)
            }
          }
          return
      }
    }

    onKeyDown?.(e)
  }

  // Handle slash command selection
  const handleSlashCommandSelect = useCallback((command: SlashCommand) => {
    const textBeforeCursor = value.slice(0, cursorPosition)
    const textAfterCursor = value.slice(cursorPosition)
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/')
    
    const newValue = textBeforeCursor.slice(0, lastSlashIndex) + `/${command.name} ` + textAfterCursor
    onChange(newValue)
    setShowSlashMenu(false)
    setSlashFilter('')
    
    // Focus back on textarea and set cursor position after the command
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        const newPos = lastSlashIndex + command.name.length + 2 // +2 for '/' and ' '
        textareaRef.current.setSelectionRange(newPos, newPos)
        setCursorPosition(newPos)
      }
    }, 0)
  }, [value, cursorPosition, onChange])

  // Handle mention selection
  const handleMentionSelect = useCallback((item: MentionItem) => {
    const textBeforeCursor = value.slice(0, cursorPosition)
    const textAfterCursor = value.slice(cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    // Insert @name with the full path stored (use name for display, path is tracked)
    const mentionText = `@${item.name}`
    const newValue = textBeforeCursor.slice(0, lastAtIndex) + mentionText + ' ' + textAfterCursor
    onChange(newValue)
    setShowMentionMenu(false)
    setMentionFilter('')
    
    // Store the mapping from mention name to full path
    mentionPathMapRef.current.set(item.name, item.path)
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        const newPos = lastAtIndex + mentionText.length + 1
        textareaRef.current.setSelectionRange(newPos, newPos)
        setCursorPosition(newPos)
      }
    }, 0)
  }, [value, cursorPosition, onChange])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px'
    }
  }, [value])

  // Parse content for highlighting
  const parsedContent = useMemo(() => parseContent(value), [value])

  // Expose mention resolution function to parent
  useEffect(() => {
    if (mentionResolverRef) {
      mentionResolverRef.current = async () => {
        const mentions: { name: string; path: string; content: string }[] = []
        const parsed = parseContent(value)
        
        for (const part of parsed) {
          if (part.type === 'mention') {
            const name = part.text.slice(1) // Remove @ prefix

            // ─── @codebase: recursive project index ───────────────
            if (name === 'codebase' && projectPath) {
              try {
                const indexed = await indexCodebase(projectPath)
                mentions.push({
                  name: 'codebase',
                  path: projectPath,
                  content: indexed,
                })
              } catch {
                mentions.push({ name: 'codebase', path: projectPath, content: '[Failed to index codebase]' })
              }
              continue
            }

            const fullPath = mentionPathMapRef.current.get(name)
            
            if (fullPath) {
              try {
                const stat = await window.artemis.fs.stat(fullPath)
                if (!stat.isDirectory) {
                  const content = await window.artemis.fs.readFile(fullPath)
                  mentions.push({ name, path: fullPath, content })
                } else {
                  // For directories, list contents
                  const entries = await window.artemis.fs.readDir(fullPath)
                  const listing = entries.map(e => `${e.type === 'directory' ? '📁' : '📄'} ${e.name}`).join('\n')
                  mentions.push({ name, path: fullPath, content: `[Directory listing of ${fullPath}]\n${listing}` })
                }
              } catch {
                mentions.push({ name, path: fullPath, content: `[Could not read: ${fullPath}]` })
              }
            } else {
              // Try to find file by name in project
              if (projectPath) {
                try {
                  const found = await findFileByName(projectPath, name)
                  if (found) {
                    const content = await window.artemis.fs.readFile(found)
                    mentions.push({ name, path: found, content })
                    mentionPathMapRef.current.set(name, found)
                  } else {
                    mentions.push({ name, path: name, content: `[File not found: ${name}]` })
                  }
                } catch {
                  mentions.push({ name, path: name, content: `[File not found: ${name}]` })
                }
              }
            }
          }
        }
        
        return { text: value, mentions }
      }
    }
    
    return () => {
      if (mentionResolverRef) {
        mentionResolverRef.current = null
      }
    }
  }, [value, mentionResolverRef, projectPath])

  // Clear mention map entries that are no longer in the text
  useEffect(() => {
    const currentMentions = new Set<string>()
    const parsed = parseContent(value)
    for (const part of parsed) {
      if (part.type === 'mention') {
        currentMentions.add(part.text.slice(1))
      }
    }
    // Remove stale entries
    for (const key of mentionPathMapRef.current.keys()) {
      if (!currentMentions.has(key)) {
        mentionPathMapRef.current.delete(key)
      }
    }
  }, [value])

  return (
    <div ref={containerRef} className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => setCursorPosition(e.currentTarget.selectionStart)}
        onKeyUp={(e) => setCursorPosition(e.currentTarget.selectionStart)}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="w-full bg-transparent border-none outline-none resize-none text-[13px] leading-relaxed px-4 pt-3 pb-1"
        style={{
          color: 'var(--text-primary)',
          caretColor: 'var(--text-primary)',
          maxHeight: '150px',
          minHeight: '24px',
        }}
        spellCheck={false}
      />

      {/* Active mentions indicator — shown as compact chips below textarea */}
      {value && parsedContent.some(p => p.type === 'mention' || p.type === 'command') && (
        <div className="flex flex-wrap gap-1 px-4 pb-1">
          {parsedContent.filter(p => p.type === 'mention' || p.type === 'command').map((part, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium"
              style={{
                backgroundColor: part.type === 'command' ? 'rgba(212, 168, 83, 0.12)' : 'rgba(74, 222, 128, 0.1)',
                color: part.type === 'command' ? 'var(--accent)' : '#4ade80',
                border: `1px solid ${part.type === 'command' ? 'rgba(212, 168, 83, 0.2)' : 'rgba(74, 222, 128, 0.18)'}`,
              }}
            >
              {part.text}
            </span>
          ))}
        </div>
      )}

      {/* Slash Command Menu */}
      {showSlashMenu && filteredSlashCommands.length > 0 && (
        <div
          className="absolute bottom-full left-0 mb-2 w-72 rounded-xl overflow-hidden z-50"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
              Commands
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredSlashCommands.map((command, index) => {
              const Icon = command.icon
              const isSelected = index === selectedIndex
              
              return (
                <button
                  key={command.id}
                  onClick={() => handleSlashCommandSelect(command)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100"
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-glow)' : 'transparent',
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-elevated)',
                    }}
                  >
                    <Icon size={14} style={{ color: isSelected ? '#000' : 'var(--accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
                        /{command.name}
                      </span>
                      {command.shortcut && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)]" style={{ color: 'var(--text-muted)' }}>
                          {command.shortcut}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] block truncate" style={{ color: 'var(--text-muted)' }}>
                      {command.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="px-3 py-2 border-t border-[var(--border-subtle)]" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Use ↑↓ to navigate, Enter to select
            </span>
          </div>
        </div>
      )}

      {/* Mention Menu */}
      {showMentionMenu && (
        <div
          className="absolute bottom-full left-0 mb-2 w-80 rounded-xl overflow-hidden z-50"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
              Files & Folders
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Type to search
            </span>
          </div>
          
          {filteredMentionItems.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Search size={20} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', opacity: 0.5 }} />
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {mentionFilter ? 'No files found' : 'Start typing to search files'}
              </p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredMentionItems.map((item, index) => {
                const isSelected = index === selectedIndex
                const isSpecial = item.type === 'special'
                
                return (
                  <button
                    key={item.id}
                    onClick={() => handleMentionSelect(item)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100"
                    style={{
                      backgroundColor: isSelected ? 'var(--accent-glow)' : 'transparent',
                      borderBottom: isSpecial ? '1px solid var(--border-subtle)' : undefined,
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {isSpecial ? (
                      <Globe size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    ) : item.type === 'directory' ? (
                      <Folder size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    ) : (
                      <FileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-[12px] block truncate"
                        style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {isSpecial ? `@${item.name}` : item.name}
                      </span>
                      <span className="text-[10px] block truncate" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                        {isSpecial ? 'Search & index the entire project as context' : item.path.replace(projectPath || '', '').slice(1)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="px-3 py-2 border-t border-[var(--border-subtle)]" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              @ to reference files • Use ↑↓ to navigate
            </span>
          </div>
        </div>
      )}

      {/* Input Hints */}
      <div className="flex items-center justify-between px-3 pb-2.5">
        <div className="flex items-center gap-3">
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
            <span className="text-[var(--accent)]">/</span> commands
          </span>
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
            <AtSign size={9} style={{ color: 'var(--accent)' }} /> files &amp; @codebase
          </span>
        </div>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
          Shift+Enter for new line
        </span>
      </div>
    </div>
  )
}
