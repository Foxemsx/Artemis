import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen, RefreshCw,
  FileCode, FileJson, FileType, FileText, FileImage, FileVideo,
  FileMusic, FileArchive, FileTerminal, Settings, Database,
  Braces, Hash, AtSign, Globe, Layout, Type, Binary, FileSpreadsheet,
  FileCheck, FileKey, FileLock, FileCog,
  FilePlus, FolderPlus, Clipboard, Pencil, Trash2, ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import ContextMenu, { type MenuItem } from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'

// File icon mapping based on extension
const FILE_ICONS: Record<string, LucideIcon> = {
  // Code files
  'js': FileCode,
  'jsx': FileCode,
  'ts': FileCode,
  'tsx': FileCode,
  'mjs': FileCode,
  'cjs': FileCode,
  
  // Web files
  'html': Globe,
  'htm': Globe,
  'css': FileType,
  'scss': FileType,
  'sass': FileType,
  'less': FileType,
  
  // Data files
  'json': FileJson,
  'jsonc': FileJson,
  'xml': FileCode,
  'yaml': FileCode,
  'yml': FileCode,
  'toml': FileCode,
  
  // Config files
  'config': FileCog,
  'conf': FileCog,
  'ini': FileCog,
  'env': FileLock,
  
  // Documentation
  'md': FileText,
  'mdx': FileText,
  'txt': FileText,
  'rtf': FileText,
  'doc': FileText,
  'docx': FileText,
  
  // Scripts
  'sh': FileTerminal,
  'bash': FileTerminal,
  'zsh': FileTerminal,
  'fish': FileTerminal,
  'ps1': FileTerminal,
  'cmd': FileTerminal,
  'bat': FileTerminal,
  'py': FileTerminal,
  'rb': FileTerminal,
  'pl': FileTerminal,
  
  // Images
  'png': FileImage,
  'jpg': FileImage,
  'jpeg': FileImage,
  'gif': FileImage,
  'svg': FileImage,
  'webp': FileImage,
  'ico': FileImage,
  'bmp': FileImage,
  
  // Video
  'mp4': FileVideo,
  'mov': FileVideo,
  'avi': FileVideo,
  'mkv': FileVideo,
  'webm': FileVideo,
  
  // Audio
  'mp3': FileMusic,
  'wav': FileMusic,
  'ogg': FileMusic,
  'flac': FileMusic,
  'aac': FileMusic,
  'm4a': FileMusic,
  
  // Archives
  'zip': FileArchive,
  'rar': FileArchive,
  '7z': FileArchive,
  'tar': FileArchive,
  'gz': FileArchive,
  'bz2': FileArchive,
  'xz': FileArchive,
  
  // Spreadsheets
  'csv': FileSpreadsheet,
  'xls': FileSpreadsheet,
  'xlsx': FileSpreadsheet,
  'ods': FileSpreadsheet,
  
  // Databases
  'sql': Database,
  'db': Database,
  'sqlite': Database,
  
  // Git
  'gitignore': FileCheck,
  'gitattributes': FileCheck,
  
  // Special config files (matched by full name)
  'package.json': FileJson,
  'tsconfig.json': FileJson,
  'package-lock.json': FileLock,
  'yarn.lock': FileLock,
  'pnpm-lock.yaml': FileLock,
  'dockerfile': FileCog,
  'docker-compose.yml': FileCog,
  'docker-compose.yaml': FileCog,
  'makefile': FileTerminal,
  'license': FileCheck,
  'readme.md': FileText,
  'changelog.md': FileText,
  '.env': FileLock,
}

// Get file icon component based on filename
function getFileIcon(filename: string): LucideIcon {
  const lowerName = filename.toLowerCase()
  const ext = lowerName.split('.').pop() || ''
  
  // Check special filenames first
  if (FILE_ICONS[lowerName]) {
    return FILE_ICONS[lowerName]
  }
  
  // Check by extension
  if (FILE_ICONS[ext]) {
    return FILE_ICONS[ext]
  }
  
  // Default icon
  return File
}

// Get icon color based on file type
function getFileIconColor(filename: string): string {
  const lowerName = filename.toLowerCase()
  const ext = lowerName.split('.').pop() || ''
  
  const colors: Record<string, string> = {
    // JavaScript/TypeScript - yellow
    'js': '#f7df1e',
    'jsx': '#61dafb',
    'ts': '#3178c6',
    'tsx': '#61dafb',
    'mjs': '#f7df1e',
    'cjs': '#f7df1e',
    
    // Web - orange/blue
    'html': '#e34c26',
    'htm': '#e34c26',
    'css': '#264de4',
    'scss': '#cc6699',
    'sass': '#cc6699',
    'less': '#1d365d',
    
    // Data - green/yellow
    'json': '#f7df1e',
    'xml': '#ff6600',
    'yaml': '#ff5252',
    'yml': '#ff5252',
    
    // Docs - blue
    'md': '#083fa1',
    'mdx': '#083fa1',
    'txt': 'var(--text-muted)',
    
    // Scripts - purple/green
    'sh': '#89e051',
    'py': '#3776ab',
    'rb': '#cc342d',
    
    // Images - pink
    'png': '#ff69b4',
    'jpg': '#ff69b4',
    'jpeg': '#ff69b4',
    'svg': '#ffb13b',
    
    // Config
    'env': '#ff5252',
  }
  
  return colors[ext] || 'var(--text-muted)'
}

interface FileEntry {
  name: string
  type: 'file' | 'directory'
}

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
  isExpanded?: boolean
}

interface Props {
  projectPath: string | null
  onOpenFile: (filePath: string) => void
  onDeletePath?: (path: string) => Promise<void> | void
  onRenamePath?: (oldPath: string, newName: string) => void
  onCreateFile?: (dirPath: string, name: string) => void
  onCreateFolder?: (dirPath: string, name: string) => void
  refreshTrigger?: number
}

export default function FileExplorer({ projectPath, onOpenFile, onDeletePath, onRenamePath, onCreateFile, onCreateFolder, refreshTrigger }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode | null } | null>(null)
  const [inlineEdit, setInlineEdit] = useState<{ path: string; value: string; type: 'rename' | 'new-file' | 'new-folder' } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ node: TreeNode } | null>(null)

  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const entries: FileEntry[] = await window.artemis.fs.readDir(dirPath)
      return entries.map((e) => ({
        name: e.name,
        path: `${dirPath}/${e.name}`.replace(/\\/g, '/'),
        type: e.type,
      }))
    } catch {
      return []
    }
  }, [])

  const loadRoot = useCallback(async () => {
    if (!projectPath) return
    setLoading(true)
    const nodes = await loadDirectory(projectPath)
    setTree(nodes)
    setLoading(false)
  }, [projectPath, loadDirectory])

  useEffect(() => {
    setExpandedPaths(new Set())
    setTree([])
    loadRoot()
  }, [loadRoot])

  // Auto-refresh when refreshTrigger changes (e.g. after agent file operations)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadRoot()
    }
  }, [refreshTrigger, loadRoot])

  const toggleDir = useCallback(async (node: TreeNode) => {
    const path = node.path
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })

    // Load children if not already loaded
    if (!node.children) {
      const children = await loadDirectory(path)
      setTree((prev) => updateNodeChildren(prev, path, children))
    }
  }, [loadDirectory])

  const handleClick = useCallback((node: TreeNode) => {
    if (node.type === 'directory') {
      toggleDir(node)
    } else {
      onOpenFile(node.path)
    }
  }, [toggleDir, onOpenFile])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const getContextMenuItems = useCallback((node: TreeNode | null): MenuItem[] => {
    if (!node) {
      return [
        { label: 'New File', icon: FilePlus, onClick: () => {
          if (projectPath) setInlineEdit({ path: projectPath, value: '', type: 'new-file' })
        }},
        { label: 'New Folder', icon: FolderPlus, onClick: () => {
          if (projectPath) setInlineEdit({ path: projectPath, value: '', type: 'new-folder' })
        }},
      ]
    }
    if (node.type === 'directory') {
      return [
        { label: 'New File', icon: FilePlus, onClick: () => {
          if (!expandedPaths.has(node.path)) toggleDir(node)
          setInlineEdit({ path: node.path, value: '', type: 'new-file' })
        }},
        { label: 'New Folder', icon: FolderPlus, onClick: () => {
          if (!expandedPaths.has(node.path)) toggleDir(node)
          setInlineEdit({ path: node.path, value: '', type: 'new-folder' })
        }},
        { separator: true },
        { label: 'Copy Path', icon: Clipboard, onClick: () => {
          navigator.clipboard.writeText(node.path)
        }},
        { label: 'Rename', icon: Pencil, onClick: () => {
          setInlineEdit({ path: node.path, value: node.name, type: 'rename' })
        }},
        { separator: true },
        { label: 'Delete', icon: Trash2, danger: true, onClick: () => {
          setPendingDelete({ node })
        }},
      ]
    }
    return [
      { label: 'Open', icon: ExternalLink, onClick: () => onOpenFile(node.path) },
      { separator: true },
      { label: 'Copy Path', icon: Clipboard, onClick: () => {
        navigator.clipboard.writeText(node.path)
      }},
      { label: 'Rename', icon: Pencil, onClick: () => {
        setInlineEdit({ path: node.path, value: node.name, type: 'rename' })
      }},
      { separator: true },
      { label: 'Delete', icon: Trash2, danger: true, onClick: () => {
        setPendingDelete({ node })
      }},
    ]
  }, [expandedPaths, toggleDir, onOpenFile, onDeletePath, loadRoot, projectPath])

// ... (rest of the code remains the same)

const handleInlineSubmit = useCallback(async () => {
  if (!inlineEdit || !inlineEdit.value.trim()) {
      setInlineEdit(null)
      return
    }
    const val = inlineEdit.value.trim()
    if (inlineEdit.type === 'rename') {
      onRenamePath?.(inlineEdit.path, val)
    } else if (inlineEdit.type === 'new-file') {
      onCreateFile?.(inlineEdit.path, val)
    } else if (inlineEdit.type === 'new-folder') {
      onCreateFolder?.(inlineEdit.path, val)
    }
    setInlineEdit(null)
    // Refresh after a short delay to let FS settle
    setTimeout(() => loadRoot(), 200)
  }, [inlineEdit, onRenamePath, onCreateFile, onCreateFolder, loadRoot])

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedPaths.has(node.path)
    const isDir = node.type === 'directory'

    return (
      <div key={node.path}>
        <button
          onClick={() => handleClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
          className="w-full flex items-center gap-1.5 py-[3px] pr-2 text-left transition-colors duration-75 text-[12px]"
          style={{
            paddingLeft: `${depth * 14 + 8}px`,
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {isDir ? (
            <>
              {isExpanded ? (
                <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              ) : (
                <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              )}
              {isExpanded ? (
                <FolderOpen size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              ) : (
                <Folder size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              )}
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              {(() => {
                const FileIcon = getFileIcon(node.name)
                const iconColor = getFileIconColor(node.name)
                return <FileIcon size={13} style={{ color: iconColor, flexShrink: 0 }} />
              })()}
            </>
          )}
          {inlineEdit && inlineEdit.type === 'rename' && inlineEdit.path === node.path ? (
            <input
              autoFocus
              value={inlineEdit.value}
              onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') handleInlineSubmit(); if (e.key === 'Escape') setInlineEdit(null) }}
              onBlur={() => handleInlineSubmit()}
              onClick={e => e.stopPropagation()}
              className="flex-1 bg-transparent outline-none text-[12px] px-1 rounded min-w-0"
              style={{ color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
            />
          ) : (
            <span className="truncate">{node.name}</span>
          )}
        </button>

        {isDir && isExpanded && node.children && (
          <div>
            {/* Inline new file/folder input */}
            {inlineEdit && (inlineEdit.type === 'new-file' || inlineEdit.type === 'new-folder') && inlineEdit.path === node.path && (
              <div className="flex items-center gap-1.5 py-[3px] pr-2" style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}>
                <span className="w-3 shrink-0" />
                {inlineEdit.type === 'new-folder' ? (
                  <Folder size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                ) : (() => {
                  const DynIcon = getFileIcon(inlineEdit.value || '')
                  const dynColor = getFileIconColor(inlineEdit.value || '')
                  return <DynIcon size={13} style={{ color: inlineEdit.value ? dynColor : 'var(--text-muted)', flexShrink: 0 }} />
                })()}
                <input
                  autoFocus
                  value={inlineEdit.value}
                  onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') handleInlineSubmit(); if (e.key === 'Escape') setInlineEdit(null) }}
                  onBlur={() => handleInlineSubmit()}
                  className="flex-1 bg-transparent outline-none text-[12px] px-1 rounded"
                  style={{ color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
                  placeholder={inlineEdit.type === 'new-folder' ? 'folder name' : 'file name'}
                />
              </div>
            )}
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (!projectPath) {
    return (
      <div
        className="h-full flex items-center justify-center text-xs"
        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
      >
        No project open
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between h-8 px-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span
          className="text-[10px] font-semibold tracking-widest uppercase truncate"
          style={{ color: 'var(--text-muted)' }}
        >
          Explorer
        </span>
        <button
          onClick={loadRoot}
          className="p-1 rounded transition-colors duration-100"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="Refresh"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY, node: null })
          }
        }}
      >
        {inlineEdit && (inlineEdit.type === 'new-file' || inlineEdit.type === 'new-folder') && inlineEdit.path === projectPath && (
          <div className="flex items-center gap-1.5 py-[3px] pr-2" style={{ paddingLeft: '8px' }}>
            <span className="w-3 shrink-0" />
            {inlineEdit.type === 'new-folder' ? (
              <Folder size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            ) : (() => {
              const DynIcon = getFileIcon(inlineEdit.value || '')
              const dynColor = getFileIconColor(inlineEdit.value || '')
              return <DynIcon size={13} style={{ color: inlineEdit.value ? dynColor : 'var(--text-muted)', flexShrink: 0 }} />
            })()}
            <input
              autoFocus
              value={inlineEdit.value}
              onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') handleInlineSubmit(); if (e.key === 'Escape') setInlineEdit(null) }}
              onBlur={() => handleInlineSubmit()}
              className="flex-1 bg-transparent outline-none text-[12px] px-1 rounded"
              style={{ color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
              placeholder={inlineEdit.type === 'new-folder' ? 'folder name' : 'file name'}
            />
          </div>
        )}
        {tree.map((node) => renderNode(node))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete Confirmation */}
      {pendingDelete && (
        <ConfirmDialog
          title="Delete"
          message={`Are you sure you want to delete "${pendingDelete.node.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={async () => {
            await onDeletePath?.(pendingDelete.node.path)
            setPendingDelete(null)
            await loadRoot()
          }}
          onCancel={() => setPendingDelete(null)}
          isDanger
        />
      )}
    </div>
  )
}

// ─── Helper: update children in tree ────────────────────────────────────────
function updateNodeChildren(nodes: TreeNode[], targetPath: string, children: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children }
    }
    if (node.children) {
      return { ...node, children: updateNodeChildren(node.children, targetPath, children) }
    }
    return node
  })
}
