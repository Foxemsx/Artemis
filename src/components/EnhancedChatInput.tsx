import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Command, FileText, Folder, Trash2, HelpCircle, Sparkles, AtSign, X, Terminal, Search, Globe, BookOpen, Image as ImageIcon, Plus, Paperclip } from 'lucide-react'
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

interface AttachedImage {
  id: string
  url: string
  name: string
}

export interface AttachedFile {
  id: string
  name: string
  path: string
  content: string
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
  /** Controlled attached images from parent */
  attachedImages: AttachedImage[]
  /** Callback when attached images change */
  onImagesChange: (images: AttachedImage[]) => void
  /** Ref to expose attach image trigger to parent */
  attachImageRef?: React.MutableRefObject<(() => void) | null>
  /** Controlled attached code files from parent */
  attachedFiles: AttachedFile[]
  /** Callback when attached code files change */
  onFilesChange: (files: AttachedFile[]) => void
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

// Binary/large file extensions to reject from drag-and-drop
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp', 'tiff', 'heic',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp3', 'mp4', 'avi', 'mov', 'mkv', 'wav', 'flac', 'ogg',
  'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz',
  'exe', 'dll', 'so', 'dylib', 'bin',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'lock', 'map',
])

export default function EnhancedChatInput({
  value,
  onChange,
  onSend,
  onKeyDown,
  placeholder = 'Ask anything...',
  disabled = false,
  projectPath,
  mentionResolverRef,
  attachedImages,
  onImagesChange,
  attachImageRef,
  attachedFiles,
  onFilesChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mentionPathMapRef = useRef<Map<string, string>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [mentionFilter, setMentionFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([])
  const [cursorPosition, setCursorPosition] = useState(0)
  // attachedImages and attachedFiles are controlled by the parent

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

  // Handle image file selection
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = () => {
        const imageDataUrl = reader.result as string
        const newImage: AttachedImage = {
          id: `${Date.now()}-${Math.random()}`,
          url: imageDataUrl,
          name: file.name
        }
        onImagesChange([...attachedImages, newImage])
      }
      reader.readAsDataURL(file)
    })

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [onImagesChange, attachedImages])

  // Handle image removal
  const handleImageRemove = useCallback((imageId: string) => {
    onImagesChange(attachedImages.filter(img => img.id !== imageId))
  }, [onImagesChange, attachedImages])

  // Trigger file input
  const handleAttachImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Expose attach image trigger to parent
  useEffect(() => {
    if (attachImageRef) {
      attachImageRef.current = handleAttachImage
    }
    return () => {
      if (attachImageRef) {
        attachImageRef.current = null
      }
    }
  }, [attachImageRef, handleAttachImage])

  // Handle paste event (Ctrl+V)
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = () => {
            const imageDataUrl = reader.result as string
            const newImage: AttachedImage = {
              id: `${Date.now()}-${Math.random()}`,
              url: imageDataUrl,
              name: file.name || 'pasted-image.png'
            }
            onImagesChange([...attachedImages, newImage])
          }
          reader.readAsDataURL(file)
        }
        break
      }
    }
  }, [onImagesChange, attachedImages])

  // Handle drag events — use counter pattern to prevent flicker from child elements
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    // Only show overlay if dragging files (not text selections etc.)
    if (e.dataTransfer?.types?.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Set the drop effect to show the correct cursor
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    // Only hide when we've truly left the container (counter reaches 0)
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragging(false)
    }
  }, [])

  // Handle file removal (code files)
  const handleFileRemove = useCallback((fileId: string) => {
    onFilesChange(attachedFiles.filter(f => f.id !== fileId))
  }, [onFilesChange, attachedFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    Array.from(files).forEach(file => {
      // Handle images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          const imageDataUrl = reader.result as string
          const newImage: AttachedImage = {
            id: `${Date.now()}-${Math.random()}`,
            url: imageDataUrl,
            name: file.name
          }
          onImagesChange([...attachedImages, newImage])
        }
        reader.readAsDataURL(file)
        return
      }

      // Handle code/text files
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      if (BINARY_EXTENSIONS.has(ext)) return
      if (file.size > 500_000) return // Skip files > 500KB

      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result as string
        // Skip binary-looking content
        if (content.includes('\0')) return
        const newFile: AttachedFile = {
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          path: (file as any).path || file.name,
          content,
        }
        onFilesChange([...attachedFiles, newFile])
      }
      reader.readAsText(file)
    })
  }, [onImagesChange, onFilesChange, attachedImages, attachedFiles])

  return (
    <div
      ref={containerRef}
      className="relative"
      onPaste={handlePaste}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageSelect}
        className="hidden"
      />

      {/* Drag overlay */}
      {isDragging && (
        <div
          className="absolute inset-0 rounded-xl z-10 flex items-center justify-center"
          style={{
            backgroundColor: 'rgba(var(--accent-rgb), 0.1)',
            border: '2px dashed var(--accent)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="flex flex-col items-center gap-2"
            style={{ color: 'var(--accent)' }}
          >
            <Paperclip size={32} />
            <span className="text-[12px] font-medium">Drop files or images here</span>
            <span className="text-[10px]" style={{ opacity: 0.6 }}>Code files will be attached as context</span>
          </div>
        </div>
      )}

      {/* Attached file chips (code files) */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
          {attachedFiles.map(file => (
            <div
              key={file.id}
              className="relative group inline-flex items-center gap-1.5 px-2 py-1 rounded-md"
              style={{
                backgroundColor: 'rgba(96, 165, 250, 0.08)',
                border: '1px solid rgba(96, 165, 250, 0.2)',
              }}
            >
              <FileText size={11} style={{ color: 'rgb(96, 165, 250)', flexShrink: 0 }} />
              <span className="text-[10px] font-mono font-medium max-w-[140px] truncate" style={{ color: 'rgb(96, 165, 250)' }}>
                {file.name}
              </span>
              <span className="text-[9px]" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                {file.content.length > 1000 ? `${(file.content.length / 1024).toFixed(1)}KB` : `${file.content.split('\n').length} lines`}
              </span>
              <button
                onClick={() => handleFileRemove(file.id)}
                className="ml-0.5 p-0.5 rounded transition-all duration-100 opacity-0 group-hover:opacity-100"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                title="Remove file"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Image thumbnails */}
      {attachedImages.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-2">
          {attachedImages.map(img => (
            <div
              key={img.id}
              className="relative group inline-flex items-center gap-2 px-2 py-1.5 rounded-lg"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <img
                src={img.url}
                alt={img.name}
                className="w-12 h-12 object-cover rounded-md"
              />
              <button
                onClick={() => handleImageRemove(img.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 opacity-0 group-hover:opacity-100"
                style={{
                  backgroundColor: 'var(--error)',
                  color: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                }}
                title="Remove image"
              >
                <X size={10} strokeWidth={2.5} />
              </button>
              <span className="text-[10px] max-w-[100px] truncate" style={{ color: 'var(--text-muted)' }}>
                {img.name}
              </span>
            </div>
          ))}
        </div>
      )}
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
        <div className="flex items-center gap-3">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
            Shift+Enter for new line
          </span>
        </div>
      </div>
    </div>
  )
}
