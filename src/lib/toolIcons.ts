import {
  FileText,
  FileEdit,
  FolderOpen,
  FolderPlus,
  Search,
  Terminal,
  Wrench,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Code,
  FileCode,
  FolderTree,
  Command,
  FileSearch,
  Info,
  Trash2,
  ArrowRightLeft,
  ListTodo,
  type LucideIcon,
} from 'lucide-react'

// Tool categories for grouping and color coding
export type ToolCategory = 'read' | 'write' | 'edit' | 'directory' | 'search' | 'execute' | 'other'

export interface ToolConfig {
  icon: LucideIcon
  category: ToolCategory
  label: string
  description: string
  color: string
  bgColor: string
  borderColor: string
}

// Tool configurations with icons and styling - NO EMOJIS
export const TOOL_CONFIGS: Record<string, ToolConfig> = {
  // Read operations
  read_file: {
    icon: FileText,
    category: 'read',
    label: 'Read File',
    description: 'Reading file contents',
    color: '#60a5fa', // blue-400
    bgColor: 'rgba(96, 165, 250, 0.1)',
    borderColor: 'rgba(96, 165, 250, 0.2)',
  },

  // Write operations
  write_file: {
    icon: FileEdit,
    category: 'write',
    label: 'Write File',
    description: 'Creating or overwriting a file',
    color: '#4ade80', // green-400
    bgColor: 'rgba(74, 222, 128, 0.1)',
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },

  // Edit operations
  edit_file: {
    icon: FileCode,
    category: 'edit',
    label: 'Edit File',
    description: 'Modifying file contents',
    color: '#fbbf24', // amber-400
    bgColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.2)',
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

  // Directory operations
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

  // Search operations
  search_files: {
    icon: Search,
    category: 'search',
    label: 'Search Files',
    description: 'Searching for patterns in files',
    color: '#f472b6', // pink-400
    bgColor: 'rgba(244, 114, 182, 0.1)',
    borderColor: 'rgba(244, 114, 182, 0.2)',
  },

  // Execute operations
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

  // Grep search
  grep_search: {
    icon: FileSearch,
    category: 'search',
    label: 'Grep Search',
    description: 'Searching for pattern across files',
    color: '#f472b6', // pink-400
    bgColor: 'rgba(244, 114, 182, 0.1)',
    borderColor: 'rgba(244, 114, 182, 0.2)',
  },

  // Find files
  find_files: {
    icon: FolderTree,
    category: 'search',
    label: 'Find Files',
    description: 'Finding files by name or pattern',
    color: '#c084fc', // purple-400
    bgColor: 'rgba(192, 132, 252, 0.1)',
    borderColor: 'rgba(192, 132, 252, 0.2)',
  },

  // File info
  file_info: {
    icon: Info,
    category: 'read',
    label: 'File Info',
    description: 'Getting file metadata',
    color: '#38bdf8', // sky-400
    bgColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },

  // Delete file
  delete_file: {
    icon: Trash2,
    category: 'write',
    label: 'Delete File',
    description: 'Deleting a file',
    color: '#f87171', // red-400
    bgColor: 'rgba(248, 113, 113, 0.1)',
    borderColor: 'rgba(248, 113, 113, 0.2)',
  },

  // Rename/move file
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

  // Todo list
  todo_list: {
    icon: ListTodo,
    category: 'other',
    label: 'Todo List',
    description: 'Managing task list',
    color: '#34d399', // emerald-400
    bgColor: 'rgba(52, 211, 153, 0.1)',
    borderColor: 'rgba(52, 211, 153, 0.2)',
  },

  // Fallback
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

// Get tool configuration by name
export function getToolConfig(toolName: string): ToolConfig {
  return TOOL_CONFIGS[toolName] || TOOL_CONFIGS.default
}

// Status configurations for tool results
export interface StatusConfig {
  icon: LucideIcon
  label: string
  color: string
  bgColor: string
  borderColor: string
}

export const STATUS_CONFIGS: Record<string, StatusConfig> = {
  success: {
    icon: CheckCircle2,
    label: 'Success',
    color: '#4ade80', // green-400
    bgColor: 'rgba(74, 222, 128, 0.1)',
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    color: '#f87171', // red-400
    bgColor: 'rgba(248, 113, 113, 0.1)',
    borderColor: 'rgba(248, 113, 113, 0.2)',
  },
  pending: {
    icon: Loader2,
    label: 'Running',
    color: '#60a5fa', // blue-400
    bgColor: 'rgba(96, 165, 250, 0.1)',
    borderColor: 'rgba(96, 165, 250, 0.2)',
  },
  warning: {
    icon: AlertCircle,
    label: 'Warning',
    color: '#fbbf24', // amber-400
    bgColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },
}

// Get status configuration by status type
export function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIGS[status] || STATUS_CONFIGS.pending
}

// Format tool arguments for display
export function formatToolArgs(args: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return ''
  
  // Prioritize certain keys for display
  const priorityKeys = ['path', 'command', 'pattern', 'content', 'old_string', 'new_string', 'old_str', 'new_str', 'old_path', 'new_path', 'source', 'destination', 'include']
  const entries = Object.entries(args)
  
  // Sort by priority
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

// Get file icon based on extension
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

// Truncate long paths for display
export function truncatePath(path: string, maxLength: number = 50): string {
  if (path.length <= maxLength) return path
  
  const parts = path.split(/[/\\]/)
  if (parts.length <= 2) return path.slice(-maxLength)
  
  // Show first and last parts with ellipsis
  return parts[0] + '/.../' + parts.slice(-2).join('/')
}
