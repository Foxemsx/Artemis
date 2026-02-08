/**
 * MCP Service — Model Context Protocol Marketplace backend.
 * 
 * Manages curated MCP servers: browse, install, configure.
 * Installed servers spawn as child processes via stdio MCP protocol.
 * Tools are dynamically registered and available to the agent loop.
 */

import path from 'path'
import fs from 'fs'
import { mcpClientManager } from './mcpClient'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MCPServer {
  id: string
  name: string
  description: string
  author: string
  version: string
  category: 'code' | 'data' | 'docs' | 'productivity' | 'devops'
  icon: string  // emoji or icon identifier
  npmPackage?: string
  repoUrl?: string
  configSchema?: Record<string, any>
  tools?: string[]
  installed?: boolean
  configuredAt?: number
  /** Command to spawn the MCP server (npx or local binary) */
  spawnCommand?: string
  /** Arguments for the spawn command */
  spawnArgs?: string[]
  /** Required environment variables (keys user must provide) */
  requiredEnv?: string[]
}

export interface MCPInstallResult {
  success: boolean
  serverId: string
  error?: string
}

export interface MCPServerState {
  installed: boolean
  config: Record<string, any>
  installedAt: number
}

// ─── Curated MCP Servers ────────────────────────────────────────────────────

export const CURATED_SERVERS: MCPServer[] = [
  {
    id: 'mcp-github',
    name: 'GitHub',
    description: 'Access GitHub repos, issues, PRs, and code search. Query repositories, create issues, and review pull requests via natural language.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'code',
    icon: '🐙',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['github_search', 'github_get_issue', 'github_list_repos', 'github_get_file', 'github_create_issue'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-github'],
    requiredEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  },
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: 'Enhanced file system operations with glob patterns, watching, and recursive directory operations. Safer than raw FS access.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'code',
    icon: '📁',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['fs_read', 'fs_write', 'fs_glob', 'fs_watch', 'fs_tree'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-filesystem', '/'],
  },
  {
    id: 'mcp-sqlite',
    name: 'SQLite',
    description: 'Query and manage local SQLite databases. Create tables, run SQL queries, and inspect schema — perfect for local development data.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'data',
    icon: '🗄️',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['sqlite_query', 'sqlite_execute', 'sqlite_schema', 'sqlite_tables'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-sqlite'],
  },
  {
    id: 'mcp-notion',
    name: 'Notion',
    description: 'Access Notion workspaces, pages, and databases. Search docs, create pages, and query databases for project documentation.',
    author: 'Community',
    version: '0.9.0',
    category: 'docs',
    icon: '📝',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['notion_search', 'notion_get_page', 'notion_create_page', 'notion_query_db'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-notion'],
    requiredEnv: ['NOTION_API_KEY'],
  },
  {
    id: 'mcp-postgres',
    name: 'PostgreSQL',
    description: 'Connect to PostgreSQL databases. Run queries, inspect schema, and manage data. Supports connection pooling and read-only mode.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'data',
    icon: '🐘',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['pg_query', 'pg_execute', 'pg_schema', 'pg_tables'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-postgres'],
    requiredEnv: ['POSTGRES_CONNECTION_STRING'],
  },
  {
    id: 'mcp-brave-search',
    name: 'Brave Search',
    description: 'Web search powered by Brave Search API. Get real-time search results, news, and web content without tracking.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'productivity',
    icon: '🦁',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['brave_search', 'brave_news'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-brave-search'],
    requiredEnv: ['BRAVE_API_KEY'],
  },
  {
    id: 'mcp-puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation for web scraping, testing, and screenshots. Navigate pages, extract content, and capture visual snapshots.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'devops',
    icon: '🎭',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['browser_navigate', 'browser_screenshot', 'browser_extract', 'browser_click'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-puppeteer'],
  },
  {
    id: 'mcp-docker',
    name: 'Docker',
    description: 'Manage Docker containers, images, and volumes. List running containers, inspect logs, and execute commands in containers.',
    author: 'Community',
    version: '0.8.0',
    category: 'devops',
    icon: '🐳',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['docker_ps', 'docker_logs', 'docker_exec', 'docker_images'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-docker'],
  },
  {
    id: 'mcp-memory',
    name: 'Memory',
    description: 'Persistent knowledge graph for the agent. Store and retrieve facts, relationships, and context across sessions.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'productivity',
    icon: '🧠',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['memory_store', 'memory_recall', 'memory_search', 'memory_forget'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    id: 'mcp-slack',
    name: 'Slack',
    description: 'Interact with Slack workspaces. Read channels, send messages, search history, and manage threads for team collaboration.',
    author: 'Community',
    version: '0.7.0',
    category: 'productivity',
    icon: '💬',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['slack_list_channels', 'slack_read', 'slack_send', 'slack_search'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-slack'],
    requiredEnv: ['SLACK_BOT_TOKEN'],
  },
  {
    id: 'mcp-git',
    name: 'Git',
    description: 'Full Git operations: status, diff, log, commit, push, pull, branch, merge, rebase, tag, and more. Complete version control from the AI agent.',
    author: 'mseep',
    version: '2.1.4',
    category: 'code',
    icon: '📦',
    repoUrl: 'https://github.com/mseep/git-mcp-server',
    tools: ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_add', 'git_push', 'git_pull', 'git_branch', 'git_merge', 'git_clone'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@mseep/git-mcp-server'],
  },
]

// ─── State Management ───────────────────────────────────────────────────────

let installedServers: Map<string, MCPServerState> = new Map()
let storeDir: string = ''

/**
 * Initialize the MCP service with a storage directory.
 */
export function initMCPService(appDataDir: string): void {
  storeDir = appDataDir
  loadInstalledServers()
}

/**
 * Get all curated servers with their install state.
 */
export function getServers(): MCPServer[] {
  return CURATED_SERVERS.map(server => ({
    ...server,
    installed: installedServers.has(server.id),
    configuredAt: installedServers.get(server.id)?.installedAt,
  }))
}

/**
 * Get a specific server by ID.
 */
export function getServer(id: string): MCPServer | undefined {
  const server = CURATED_SERVERS.find(s => s.id === id)
  if (!server) return undefined
  return {
    ...server,
    installed: installedServers.has(id),
    configuredAt: installedServers.get(id)?.installedAt,
  }
}

/**
 * Install/enable an MCP server.
 * Spawns the server process and connects via stdio MCP protocol.
 * Discovers available tools and registers them with the agent system.
 */
export async function installServer(serverId: string, config?: Record<string, any>): Promise<MCPInstallResult> {
  const server = CURATED_SERVERS.find(s => s.id === serverId)
  if (!server) {
    return { success: false, serverId, error: 'Server not found in curated list' }
  }

  if (!server.spawnCommand) {
    return { success: false, serverId, error: 'Server has no spawn command configured' }
  }

  try {
    // Build environment variables from config
    const env: Record<string, string> = {}
    if (config) {
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string') {
          env[key] = value
        }
      }
    }

    // Connect to the MCP server (spawns the process)
    await mcpClientManager.connect(
      serverId,
      server.spawnCommand,
      server.spawnArgs || [],
      Object.keys(env).length > 0 ? env : undefined
    )

    const client = mcpClientManager.get(serverId)
    const discoveredTools = client?.tools || []

    // Store installation state
    const state: MCPServerState = {
      installed: true,
      config: config || {},
      installedAt: Date.now(),
    }

    installedServers.set(serverId, state)
    saveInstalledServers()

    console.log(`[Artemis MCP] Installed & connected: ${server.name} (${discoveredTools.length} tools)`)
    return { success: true, serverId }
  } catch (err: any) {
    // Still save as installed even if connection failed (user can retry)
    const state: MCPServerState = {
      installed: true,
      config: config || {},
      installedAt: Date.now(),
    }
    installedServers.set(serverId, state)
    saveInstalledServers()

    console.error(`[Artemis MCP] Install failed for ${server.name}:`, err.message)
    return { success: false, serverId, error: `Installed but failed to connect: ${err.message}. The server will attempt to reconnect on next app start.` }
  }
}

/**
 * Uninstall/disable an MCP server.
 * Disconnects the server process and removes persisted state.
 */
export async function uninstallServer(serverId: string): Promise<MCPInstallResult> {
  // Disconnect the MCP client
  mcpClientManager.disconnect(serverId)

  installedServers.delete(serverId)
  saveInstalledServers()
  console.log(`[Artemis MCP] Uninstalled server: ${serverId}`)
  return { success: true, serverId }
}

/**
 * Reconnect all installed servers on app startup.
 * Called after loadInstalledServers().
 */
export async function reconnectInstalledServers(): Promise<void> {
  const entries = Array.from(installedServers.entries())
  for (let i = 0; i < entries.length; i++) {
    const [serverId, state] = entries[i]
    const server = CURATED_SERVERS.find(s => s.id === serverId)
    if (!server?.spawnCommand) continue

    try {
      const env: Record<string, string> = {}
      if (state.config) {
        for (const [key, value] of Object.entries(state.config)) {
          if (typeof value === 'string') {
            env[key] = value
          }
        }
      }

      await mcpClientManager.connect(
        serverId,
        server.spawnCommand,
        server.spawnArgs || [],
        Object.keys(env).length > 0 ? env : undefined
      )
      console.log(`[Artemis MCP] Reconnected: ${server.name}`)
    } catch (err: any) {
      console.warn(`[Artemis MCP] Failed to reconnect ${server.name}:`, err.message)
    }
  }
}

/**
 * Get tools provided by all installed MCP servers (static list from curated definitions).
 */
export function getInstalledTools(): string[] {
  const tools: string[] = []
  Array.from(installedServers.entries()).forEach(([serverId]) => {
    const server = CURATED_SERVERS.find(s => s.id === serverId)
    if (server?.tools) {
      tools.push(...server.tools)
    }
  })
  return tools
}

/**
 * Search curated servers by query.
 */
export function searchServers(query: string): MCPServer[] {
  const q = query.toLowerCase().trim()
  if (!q) return getServers()

  return getServers().filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q) ||
    s.author.toLowerCase().includes(q) ||
    (s.tools || []).some(t => t.toLowerCase().includes(q))
  )
}

// ─── Persistence ────────────────────────────────────────────────────────────

function getMCPStorePath(): string {
  return path.join(storeDir, 'mcp-servers.json')
}

function loadInstalledServers(): void {
  try {
    const filePath = getMCPStorePath()
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (data && typeof data === 'object') {
        for (const [id, stateVal] of Object.entries(data)) {
          const state = stateVal as MCPServerState
          installedServers.set(id, state as MCPServerState)
        }
      }
    }
  } catch (err) {
    console.error('[Artemis MCP] Failed to load installed servers:', err)
  }
}

function saveInstalledServers(): void {
  try {
    const filePath = getMCPStorePath()
    const data: Record<string, MCPServerState> = {}
    for (const [id, state] of Array.from(installedServers)) {
      data[id] = state
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error('[Artemis MCP] Failed to save installed servers:', err)
  }
}
