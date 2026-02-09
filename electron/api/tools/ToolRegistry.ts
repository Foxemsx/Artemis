
import type { UniversalToolDefinition } from '../types'


const TOOL_READ_FILE: UniversalToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file at the given path. Use this to understand existing code before making changes.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The absolute path to the file to read' },
    },
    required: ['path'],
  },
}

const TOOL_WRITE_FILE: UniversalToolDefinition = {
  name: 'write_file',
  description: 'Create a new file or completely overwrite an existing file with the provided content.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The absolute path to the file to write' },
      content: { type: 'string', description: 'The complete content to write to the file' },
    },
    required: ['path', 'content'],
  },
}

const TOOL_STR_REPLACE: UniversalToolDefinition = {
  name: 'str_replace',
  description: 'Edit a file by replacing a specific string with a new string. The old_str must match exactly (including whitespace and indentation). This is the preferred way to make targeted edits.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The absolute path to the file to edit' },
      old_str: { type: 'string', description: 'The exact text to find and replace. Must match the file content precisely.' },
      new_str: { type: 'string', description: 'The text to replace old_str with' },
    },
    required: ['path', 'old_str', 'new_str'],
  },
}

const TOOL_LIST_DIRECTORY: UniversalToolDefinition = {
  name: 'list_directory',
  description: 'List the contents of a directory. Returns file and directory names with their types.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The absolute path to the directory to list' },
    },
    required: ['path'],
  },
}

const TOOL_SEARCH_FILES: UniversalToolDefinition = {
  name: 'search_files',
  description: 'Search for a text or regex pattern across files in a directory. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'The text or regex pattern to search for' },
      path: { type: 'string', description: 'The directory path to search in' },
      include: { type: 'string', description: 'Optional glob pattern to filter files (e.g. "*.ts", "*.py")' },
    },
    required: ['pattern', 'path'],
  },
}

const TOOL_EXECUTE_COMMAND: UniversalToolDefinition = {
  name: 'execute_command',
  description: 'Run a shell command. Use for installing packages, running builds, tests, git operations, etc.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      cwd: { type: 'string', description: 'The working directory to run the command in (optional, defaults to project root)' },
    },
    required: ['command'],
  },
}

const TOOL_GET_GIT_DIFF: UniversalToolDefinition = {
  name: 'get_git_diff',
  description: 'Get the current git diff showing all uncommitted changes in the project.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
}

const TOOL_LIST_CODE_DEFINITIONS: UniversalToolDefinition = {
  name: 'list_code_definitions',
  description: 'Extract top-level function, class, and type definitions from a file. Useful for understanding code structure without reading the entire file.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The absolute path to the source file to analyze' },
    },
    required: ['path'],
  },
}

const TOOL_CREATE_DIRECTORY: UniversalToolDefinition = {
  name: 'create_directory',
  description: 'Create a new directory (and any parent directories) at the given path.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The absolute path of the directory to create' },
    },
    required: ['path'],
  },
}

const TOOL_DELETE_FILE: UniversalToolDefinition = {
  name: 'delete_file',
  description: 'Delete a file at the given path. Use with caution.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The absolute path to the file to delete' },
    },
    required: ['path'],
  },
}

const TOOL_WEB_SEARCH: UniversalToolDefinition = {
  name: 'web_search',
  description: 'Search the web using DuckDuckGo (no API key required). Returns top results with titles, URLs, and snippets. Use for looking up documentation, best practices, or current information.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query to look up on the web' },
    },
    required: ['query'],
  },
}

const TOOL_LINT_FILE: UniversalToolDefinition = {
  name: 'lint_file',
  description: 'Run a linter on a file (ESLint for JS/TS, Pylint for Python) and return any diagnostics. Use to check code quality before or after edits.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The absolute path to the file to lint' },
    },
    required: ['path'],
  },
}

const TOOL_FETCH_URL: UniversalToolDefinition = {
  name: 'fetch_url',
  description: 'Fetch the content of a web page URL and return readable text. Use when a user shares a link or you need to read documentation, articles, or any web content. Returns the page title and extracted text content.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The HTTP/HTTPS URL to fetch and read' },
    },
    required: ['url'],
  },
}

const TOOL_MOVE_FILE: UniversalToolDefinition = {
  name: 'move_file',
  description: 'Rename or move a file from one path to another.',
  parameters: {
    type: 'object',
    properties: {
      old_path: { type: 'string', description: 'The current absolute path of the file' },
      new_path: { type: 'string', description: 'The new absolute path for the file' },
    },
    required: ['old_path', 'new_path'],
  },
}


const ALL_TOOLS: UniversalToolDefinition[] = [
  TOOL_READ_FILE, TOOL_WRITE_FILE, TOOL_STR_REPLACE,
  TOOL_LIST_DIRECTORY, TOOL_SEARCH_FILES, TOOL_EXECUTE_COMMAND,
  TOOL_GET_GIT_DIFF, TOOL_LIST_CODE_DEFINITIONS,
  TOOL_CREATE_DIRECTORY, TOOL_DELETE_FILE, TOOL_MOVE_FILE,
  TOOL_WEB_SEARCH, TOOL_LINT_FILE, TOOL_FETCH_URL,
]

const BUILDER_TOOLS: UniversalToolDefinition[] = [
  TOOL_READ_FILE, TOOL_WRITE_FILE, TOOL_STR_REPLACE,
  TOOL_LIST_DIRECTORY, TOOL_SEARCH_FILES, TOOL_EXECUTE_COMMAND,
  TOOL_GET_GIT_DIFF, TOOL_LIST_CODE_DEFINITIONS,
  TOOL_CREATE_DIRECTORY, TOOL_DELETE_FILE, TOOL_MOVE_FILE,
  TOOL_WEB_SEARCH, TOOL_LINT_FILE, TOOL_FETCH_URL,
]

const PLANNER_TOOLS: UniversalToolDefinition[] = [
  TOOL_READ_FILE, TOOL_LIST_DIRECTORY, TOOL_SEARCH_FILES,
  TOOL_GET_GIT_DIFF, TOOL_LIST_CODE_DEFINITIONS,
]

const CHAT_TOOLS: UniversalToolDefinition[] = [
  TOOL_READ_FILE, TOOL_WRITE_FILE, TOOL_STR_REPLACE,
  TOOL_LIST_DIRECTORY, TOOL_SEARCH_FILES, TOOL_EXECUTE_COMMAND,
  TOOL_WEB_SEARCH, TOOL_LINT_FILE, TOOL_FETCH_URL,
]


export class ToolRegistry {
  private tools: Map<string, UniversalToolDefinition> = new Map()

  constructor() {
    for (const tool of ALL_TOOLS) {
      this.tools.set(tool.name, tool)
    }
  }

  register(tool: UniversalToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  unregister(name: string): void {
    this.tools.delete(name)
  }

  get(name: string): UniversalToolDefinition | undefined {
    return this.tools.get(name)
  }

  getAll(): UniversalToolDefinition[] {
    return Array.from(this.tools.values())
  }

  getByNames(names: string[]): UniversalToolDefinition[] {
    return names
      .map(name => this.tools.get(name))
      .filter((t): t is UniversalToolDefinition => t !== undefined)
  }

  getBuilderTools(): UniversalToolDefinition[] {
    return BUILDER_TOOLS.filter(t => this.tools.has(t.name))
  }

  getPlannerTools(): UniversalToolDefinition[] {
    return PLANNER_TOOLS.filter(t => this.tools.has(t.name))
  }

  getChatTools(): UniversalToolDefinition[] {
    return CHAT_TOOLS.filter(t => this.tools.has(t.name))
  }

  getToolsForMode(mode: 'builder' | 'planner' | 'chat'): UniversalToolDefinition[] {
    switch (mode) {
      case 'builder': return this.getBuilderTools()
      case 'planner': return this.getPlannerTools()
      case 'chat': return this.getChatTools()
      default: return []
    }
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  getNames(): string[] {
    return Array.from(this.tools.keys())
  }
}

export const toolRegistry = new ToolRegistry()
