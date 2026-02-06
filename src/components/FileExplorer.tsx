import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, RefreshCw } from 'lucide-react'

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
}

export default function FileExplorer({ projectPath, onOpenFile }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

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
    loadRoot()
  }, [loadRoot])

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

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedPaths.has(node.path)
    const isDir = node.type === 'directory'

    return (
      <div key={node.path}>
        <button
          onClick={() => handleClick(node)}
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
              <File size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </>
          )}
          <span className="truncate">{node.name}</span>
        </button>

        {isDir && isExpanded && node.children && (
          <div>
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
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map((node) => renderNode(node))}
      </div>
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
