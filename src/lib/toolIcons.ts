import {
  FileText,
  FileEdit,
  FolderOpen,
  FolderPlus,
  Search,
  Terminal,
  Wrench,
  Code,
  FileCode,
  FolderTree,
  FileSearch,
  Info,
  Trash2,
  ArrowRightLeft,
  ListTodo,
  Globe,
  Eye,
  Link,
  Plug,
  type LucideIcon,
} from 'lucide-react'

export type ToolCategory = 'read' | 'write' | 'edit' | 'directory' | 'search' | 'execute' | 'mcp' | 'other'

export interface ToolConfig {
  icon: LucideIcon
  category: ToolCategory
  label: string
  description: string
  color: string
  bgColor: string
  borderColor: string
}

export const TOOL_CONFIGS: Record<string, ToolConfig> = {
  read_file: {
    icon: FileText,
    category: 'read',
    label: 'Read File',
    description: 'Reading file contents',
    color: '#60a5fa', // blue-400
    bgColor: 'rgba(96, 165, 250, 0.1)',
    borderColor: 'rgba(96, 165, 250, 0.2)',
  },

  write_file: {
    icon: FileEdit,
    category: 'write',
    label: 'Write File',
    description: 'Creating or overwriting a file',
    color: '#4ade80', // green-400
    bgColor: 'rgba(74, 222, 128, 0.1)',
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },

  str_replace: {
    icon: FileCode,
    category: 'edit',
    label: 'Edit File',
    description: 'Replacing text in file',
    color: '#fbbf24', // amber-400
    bgColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },

  list_directory: {
    icon: FolderOpen,
    category: 'directory',
    label: 'List Directory',
    description: 'Listing directory contents',
    color: '#a78bfa', // violet-400
    bgColor: 'rgba(167, 139, 250, 0.1)',
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  create_directory: {
    icon: FolderPlus,
    category: 'directory',
    label: 'Create Directory',
    description: 'Creating a new directory',
    color: '#a78bfa', // violet-400
    bgColor: 'rgba(167, 139, 250, 0.1)',
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },

  search_files: {
    icon: Search,
    category: 'search',
    label: 'Search Files',
    description: 'Searching for patterns in files',
    color: '#f472b6', // pink-400
    bgColor: 'rgba(244, 114, 182, 0.1)',
    borderColor: 'rgba(244, 114, 182, 0.2)',
  },

  run_command: {
    icon: Terminal,
    category: 'execute',
    label: 'Run Command',
    description: 'Executing a terminal command',
    color: '#f87171', // red-400
    bgColor: 'rgba(248, 113, 113, 0.1)',
    borderColor: 'rgba(248, 113, 113, 0.2)',
  },
  execute_command: {
    icon: Terminal,
    category: 'execute',
    label: 'Run Command',
    description: 'Executing a terminal command',
    color: '#f87171', // red-400
    bgColor: 'rgba(248, 113, 113, 0.1)',
    borderColor: 'rgba(248, 113, 113, 0.2)',
  },

  grep_search: {
    icon: FileSearch,
    category: 'search',
    label: 'Grep Search',
    description: 'Searching for pattern across files',
    color: '#f472b6', // pink-400
    bgColor: 'rgba(244, 114, 182, 0.1)',
    borderColor: 'rgba(244, 114, 182, 0.2)',
  },

  find_files: {
    icon: FolderTree,
    category: 'search',
    label: 'Find Files',
    description: 'Finding files by name or pattern',
    color: '#c084fc', // purple-400
    bgColor: 'rgba(192, 132, 252, 0.1)',
    borderColor: 'rgba(192, 132, 252, 0.2)',
  },

  file_info: {
    icon: Info,
    category: 'read',
    label: 'File Info',
    description: 'Getting file metadata',
    color: '#38bdf8', // sky-400
    bgColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },

  delete_file: {
    icon: Trash2,
    category: 'write',
    label: 'Delete File',
    description: 'Deleting a file',
    color: '#f87171', // red-400
    bgColor: 'rgba(248, 113, 113, 0.1)',
    borderColor: 'rgba(248, 113, 113, 0.2)',
  },

  rename_file: {
    icon: ArrowRightLeft,
    category: 'write',
    label: 'Rename File',
    description: 'Renaming or moving a file',
    color: '#fb923c', // orange-400
    bgColor: 'rgba(251, 146, 60, 0.1)',
    borderColor: 'rgba(251, 146, 60, 0.2)',
  },
  move_file: {
    icon: ArrowRightLeft,
    category: 'write',
    label: 'Move File',
    description: 'Moving or renaming a file',
    color: '#fb923c', // orange-400
    bgColor: 'rgba(251, 146, 60, 0.1)',
    borderColor: 'rgba(251, 146, 60, 0.2)',
  },
  get_git_diff: {
    icon: Code,
    category: 'read',
    label: 'Git Diff',
    description: 'Getting uncommitted changes',
    color: '#60a5fa', // blue-400
    bgColor: 'rgba(96, 165, 250, 0.1)',
    borderColor: 'rgba(96, 165, 250, 0.2)',
  },
  list_code_definitions: {
    icon: FileCode,
    category: 'read',
    label: 'Code Definitions',
    description: 'Extracting code structure',
    color: '#a78bfa', // violet-400
    bgColor: 'rgba(167, 139, 250, 0.1)',
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },

  todo_list: {
    icon: ListTodo,
    category: 'other',
    label: 'Todo List',
    description: 'Managing task list',
    color: '#34d399', // emerald-400
    bgColor: 'rgba(52, 211, 153, 0.1)',
    borderColor: 'rgba(52, 211, 153, 0.2)',
  },

  web_search: {
    icon: Globe,
    category: 'search',
    label: 'Web Search',
    description: 'Searching the web',
    color: '#22d3ee', // cyan-400
    bgColor: 'rgba(34, 211, 238, 0.1)',
    borderColor: 'rgba(34, 211, 238, 0.2)',
  },

  lint_file: {
    icon: Eye,
    category: 'read',
    label: 'Lint File',
    description: 'Running linter on file',
    color: '#fbbf24', // amber-400
    bgColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },

  fetch_url: {
    icon: Link,
    category: 'read',
    label: 'Fetch URL',
    description: 'Fetching web page content',
    color: '#818cf8', // indigo-400
    bgColor: 'rgba(129, 140, 248, 0.1)',
    borderColor: 'rgba(129, 140, 248, 0.2)',
  },

  default: {
    icon: Wrench,
    category: 'other',
    label: 'Tool',
    description: 'Executing tool',
    color: '#d4a853', // accent gold
    bgColor: 'rgba(212, 168, 83, 0.1)',
    borderColor: 'rgba(212, 168, 83, 0.2)',
  },
}

export function getToolConfig(toolName: string): ToolConfig {
  if (TOOL_CONFIGS[toolName]) return TOOL_CONFIGS[toolName]

  if (toolName.startsWith('mcp_')) {
    const parts = toolName.replace(/^mcp_/, '').split('_')
    const toolParts = parts.length > 2 ? parts.slice(2) : parts
    const label = toolParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')

    return {
      icon: Plug,
      category: 'mcp',
      label: `MCP: ${label}`,
      description: `MCP tool: ${label}`,
      color: '#2dd4bf', // teal-400
      bgColor: 'rgba(45, 212, 191, 0.1)',
      borderColor: 'rgba(45, 212, 191, 0.2)',
    }
  }

  return TOOL_CONFIGS.default
}

export function formatToolArgs(args: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return ''
  
  const priorityKeys = ['path', 'command', 'pattern', 'content', 'old_string', 'new_string', 'old_str', 'new_str', 'old_path', 'new_path', 'source', 'destination', 'include']
  const entries = Object.entries(args)
  
  entries.sort((a, b) => {
    const aIndex = priorityKeys.indexOf(a[0])
    const bIndex = priorityKeys.indexOf(b[0])
    if (aIndex === -1 && bIndex === -1) return 0
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
  
  return JSON.stringify(Object.fromEntries(entries), null, 2)
}

export function getFileIcon(filename: string): LucideIcon {
  const ext = filename.split('.').pop()?.toLowerCase()
  
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return Code
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return FileCode
    default:
      return FileText
  }
}

export { truncatePath } from './formatters'
