/**
 * MCP Service — Model Context Protocol Marketplace backend.
 * 
 * Manages curated MCP servers: browse, install, configure.
 * Installed servers spawn as child processes via stdio MCP protocol.
 * Tools are dynamically registered and available to the agent loop.
 */

import path from 'path'
import fs from 'fs'
import { safeStorage } from 'electron'
import { mcpClientManager, MCPLogEntry } from './mcpClient'

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
  /** Default environment variable values (from custom server definitions) */
  defaultEnv?: Record<string, string>
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
    icon: 'github',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['github_search', 'github_get_issue', 'github_list_repos', 'github_get_file', 'github_create_issue'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-github'],
    requiredEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  },
  {
    id: 'mcp-git',
    name: 'Git',
    description: 'Full Git operations: status, diff, log, commit, push, pull, branch, merge, rebase, tag, and more. Complete version control from the AI agent.',
    author: 'mseep',
    version: '2.1.4',
    category: 'code',
    icon: 'git',
    repoUrl: 'https://github.com/mseep/git-mcp-server',
    tools: ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_add', 'git_push', 'git_pull', 'git_branch', 'git_merge', 'git_clone'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@mseep/git-mcp-server'],
  },
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: 'Enhanced file system operations with glob patterns, watching, and recursive directory operations. Safer than raw FS access.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'code',
    icon: 'filesystem',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['fs_read', 'fs_write', 'fs_glob', 'fs_watch', 'fs_tree'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-filesystem', '/'],
  },
  {
    id: 'mcp-context7',
    name: 'Context7',
    description: 'Up-to-date documentation and code examples for any library directly in your prompt. Always get the latest API references.',
    author: 'Upstash',
    version: '1.0.0',
    category: 'docs',
    icon: 'context7',
    repoUrl: 'https://github.com/upstash/context7',
    tools: ['resolve-library-id', 'get-library-docs'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@upstash/context7-mcp@latest'],
  },
  {
    id: 'mcp-sqlite',
    name: 'SQLite',
    description: 'Query and manage local SQLite databases. Create tables, run SQL queries, and inspect schema — perfect for local development data.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'data',
    icon: 'sqlite',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['sqlite_query', 'sqlite_execute', 'sqlite_schema', 'sqlite_tables'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-sqlite'],
  },
  {
    id: 'mcp-postgres',
    name: 'PostgreSQL',
    description: 'Connect to PostgreSQL databases. Run queries, inspect schema, and manage data. Supports connection pooling and read-only mode.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'data',
    icon: 'postgres',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['pg_query', 'pg_execute', 'pg_schema', 'pg_tables'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-postgres'],
    requiredEnv: ['POSTGRES_CONNECTION_STRING'],
  },
  {
    id: 'mcp-notion',
    name: 'Notion',
    description: 'Access Notion workspaces, pages, and databases. Search docs, create pages, and query databases for project documentation.',
    author: 'Community',
    version: '0.9.0',
    category: 'docs',
    icon: 'notion',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['notion_search', 'notion_get_page', 'notion_create_page', 'notion_query_db'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-notion'],
    requiredEnv: ['NOTION_API_KEY'],
  },
  {
    id: 'mcp-brave-search',
    name: 'Brave Search',
    description: 'Web search powered by Brave Search API. Get real-time search results, news, and web content without tracking.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'productivity',
    icon: 'brave',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['brave_search', 'brave_news'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-brave-search'],
    requiredEnv: ['BRAVE_API_KEY'],
  },
  {
    id: 'mcp-memory',
    name: 'Memory',
    description: 'Persistent knowledge graph for the agent. Store and retrieve facts, relationships, and context across sessions.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'productivity',
    icon: 'memory',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['memory_store', 'memory_recall', 'memory_search', 'memory_forget'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    id: 'mcp-puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation for web scraping, testing, and screenshots. Navigate pages, extract content, and capture visual snapshots.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'devops',
    icon: 'puppeteer',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['browser_navigate', 'browser_screenshot', 'browser_extract', 'browser_click'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-puppeteer'],
  },
  {
    id: 'mcp-playwright',
    name: 'Playwright',
    description: 'Browser automation with Playwright. Run end-to-end tests, scrape pages, and interact with web apps across Chromium, Firefox, and WebKit.',
    author: 'Microsoft',
    version: '1.0.0',
    category: 'devops',
    icon: 'playwright',
    repoUrl: 'https://github.com/anthropics/anthropic-quickstarts',
    tools: ['playwright_navigate', 'playwright_screenshot', 'playwright_click', 'playwright_fill'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@anthropic-ai/mcp-server-playwright'],
  },
  {
    id: 'mcp-docker',
    name: 'Docker',
    description: 'Manage Docker containers, images, and volumes. List running containers, inspect logs, and execute commands in containers.',
    author: 'Community',
    version: '0.8.0',
    category: 'devops',
    icon: 'docker',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['docker_ps', 'docker_logs', 'docker_exec', 'docker_images'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-docker'],
  },
  {
    id: 'mcp-slack',
    name: 'Slack',
    description: 'Interact with Slack workspaces. Read channels, send messages, search history, and manage threads for team collaboration.',
    author: 'Community',
    version: '0.7.0',
    category: 'productivity',
    icon: 'slack',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['slack_list_channels', 'slack_read', 'slack_send', 'slack_search'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-slack'],
    requiredEnv: ['SLACK_BOT_TOKEN'],
  },
  {
    id: 'mcp-linear',
    name: 'Linear',
    description: 'Manage Linear issues, projects, and teams. Create and update issues, track sprints, and query project status.',
    author: 'Community',
    version: '1.0.0',
    category: 'productivity',
    icon: 'linear',
    repoUrl: 'https://github.com/jerhadf/linear-mcp-server',
    tools: ['linear_create_issue', 'linear_search', 'linear_update_issue', 'linear_get_teams'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'mcp-linear'],
    requiredEnv: ['LINEAR_API_KEY'],
  },
  {
    id: 'mcp-sentry',
    name: 'Sentry',
    description: 'Access Sentry error tracking. Query issues, view stack traces, manage releases, and monitor application health.',
    author: 'Sentry',
    version: '1.0.0',
    category: 'devops',
    icon: 'sentry',
    repoUrl: 'https://github.com/getsentry/sentry-mcp',
    tools: ['sentry_list_issues', 'sentry_get_issue', 'sentry_list_projects', 'sentry_search'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@sentry/mcp-server'],
    requiredEnv: ['SENTRY_AUTH_TOKEN'],
  },
  {
    id: 'mcp-supabase',
    name: 'Supabase',
    description: 'Interact with Supabase projects. Query databases, manage auth users, access storage buckets, and call edge functions.',
    author: 'Supabase',
    version: '1.0.0',
    category: 'data',
    icon: 'supabase',
    repoUrl: 'https://github.com/supabase/mcp-server-supabase',
    tools: ['supabase_query', 'supabase_list_tables', 'supabase_auth', 'supabase_storage'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@supabase/mcp-server-supabase@latest'],
    requiredEnv: ['SUPABASE_ACCESS_TOKEN'],
  },
  {
    id: 'mcp-redis',
    name: 'Redis',
    description: 'Connect to Redis instances. Execute commands, manage keys, inspect data structures, and monitor performance.',
    author: 'Community',
    version: '1.0.0',
    category: 'data',
    icon: 'redis',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['redis_get', 'redis_set', 'redis_keys', 'redis_info'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-redis'],
    requiredEnv: ['REDIS_URL'],
  },
  {
    id: 'mcp-mongodb',
    name: 'MongoDB',
    description: 'Connect to MongoDB databases. Query collections, insert documents, create indexes, and aggregate data.',
    author: 'MongoDB',
    version: '1.0.0',
    category: 'data',
    icon: 'mongodb',
    repoUrl: 'https://github.com/mongodb/mongodb-mcp-server',
    tools: ['mongodb_find', 'mongodb_insert', 'mongodb_aggregate', 'mongodb_collections'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'mongodb-mcp-server'],
    requiredEnv: ['MONGODB_URI'],
  },
  {
    id: 'mcp-vercel',
    name: 'Vercel',
    description: 'Manage Vercel deployments, projects, and domains. Trigger deploys, check build status, and configure environment variables.',
    author: 'Vercel',
    version: '1.0.0',
    category: 'devops',
    icon: 'vercel',
    repoUrl: 'https://github.com/vercel/mcp-server-vercel',
    tools: ['vercel_deployments', 'vercel_projects', 'vercel_domains', 'vercel_env'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@vercel/mcp-server-vercel'],
    requiredEnv: ['VERCEL_TOKEN'],
  },
  {
    id: 'mcp-cloudflare',
    name: 'Cloudflare',
    description: 'Manage Cloudflare Workers, KV namespaces, R2 buckets, and DNS records. Deploy and configure edge infrastructure.',
    author: 'Cloudflare',
    version: '1.0.0',
    category: 'devops',
    icon: 'cloudflare',
    repoUrl: 'https://github.com/cloudflare/mcp-server-cloudflare',
    tools: ['cloudflare_workers', 'cloudflare_kv', 'cloudflare_r2', 'cloudflare_dns'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@cloudflare/mcp-server-cloudflare'],
    requiredEnv: ['CLOUDFLARE_API_TOKEN'],
  },
  {
    id: 'mcp-stripe',
    name: 'Stripe',
    description: 'Access Stripe payment data. List charges, customers, subscriptions, and invoices. Create payment links and manage products.',
    author: 'Stripe',
    version: '1.0.0',
    category: 'productivity',
    icon: 'stripe',
    repoUrl: 'https://github.com/stripe/agent-toolkit',
    tools: ['stripe_list_charges', 'stripe_customers', 'stripe_create_payment', 'stripe_products'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@stripe/mcp-server'],
    requiredEnv: ['STRIPE_SECRET_KEY'],
  },
  {
    id: 'mcp-tavily',
    name: 'Tavily',
    description: 'AI-optimized web search API. Get clean, relevant search results with extracted content perfect for LLM consumption.',
    author: 'Tavily',
    version: '1.0.0',
    category: 'productivity',
    icon: 'tavily',
    repoUrl: 'https://github.com/tavily-ai/tavily-mcp',
    tools: ['tavily_search', 'tavily_extract'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'tavily-mcp@latest'],
    requiredEnv: ['TAVILY_API_KEY'],
  },
  {
    id: 'mcp-exa',
    name: 'Exa',
    description: 'Neural search engine for the web. Find similar pages, search with embeddings, and extract structured content from any URL.',
    author: 'Exa',
    version: '1.0.0',
    category: 'productivity',
    icon: 'exa',
    repoUrl: 'https://github.com/exa-labs/exa-mcp-server',
    tools: ['exa_search', 'exa_find_similar', 'exa_get_contents'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'exa-mcp-server'],
    requiredEnv: ['EXA_API_KEY'],
  },
  {
    id: 'mcp-google-drive',
    name: 'Google Drive',
    description: 'Access Google Drive files and folders. Search documents, read spreadsheets, and manage file permissions.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'docs',
    icon: 'google-drive',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['gdrive_search', 'gdrive_read', 'gdrive_list', 'gdrive_export'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-gdrive'],
    requiredEnv: ['GOOGLE_APPLICATION_CREDENTIALS'],
  },
  {
    id: 'mcp-google-maps',
    name: 'Google Maps',
    description: 'Geocoding, directions, place search, and distance calculations. Turn addresses into coordinates and plan routes.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'productivity',
    icon: 'google-maps',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['maps_geocode', 'maps_directions', 'maps_search_places', 'maps_distance'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-google-maps'],
    requiredEnv: ['GOOGLE_MAPS_API_KEY'],
  },
  {
    id: 'mcp-figma',
    name: 'Figma',
    description: 'Access Figma designs and dev resources. Inspect components, extract styles, and read design token values.',
    author: 'Community',
    version: '1.0.0',
    category: 'productivity',
    icon: 'figma',
    repoUrl: 'https://github.com/nicobailey3/figma-mcp-server',
    tools: ['figma_get_file', 'figma_get_styles', 'figma_get_components', 'figma_get_images'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'figma-mcp-server'],
    requiredEnv: ['FIGMA_ACCESS_TOKEN'],
  },
  {
    id: 'mcp-jira',
    name: 'Jira',
    description: 'Manage Jira issues and projects. Create, search, update tickets, and track sprint progress.',
    author: 'Community',
    version: '1.0.0',
    category: 'productivity',
    icon: 'jira',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['jira_search', 'jira_create', 'jira_update', 'jira_transitions'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'mcp-server-jira'],
    requiredEnv: ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
  },
  {
    id: 'mcp-confluence',
    name: 'Confluence',
    description: 'Access Confluence wikis. Search pages, read content, create and update documentation in your team workspace.',
    author: 'Community',
    version: '1.0.0',
    category: 'docs',
    icon: 'confluence',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['confluence_search', 'confluence_get_page', 'confluence_create_page', 'confluence_update'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'mcp-server-confluence'],
    requiredEnv: ['CONFLUENCE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN'],
  },
  {
    id: 'mcp-todoist',
    name: 'Todoist',
    description: 'Manage Todoist tasks and projects. Create, complete, and organize tasks with labels, priorities, and due dates.',
    author: 'Community',
    version: '1.0.0',
    category: 'productivity',
    icon: 'todoist',
    repoUrl: 'https://github.com/abhiz123/todoist-mcp-server',
    tools: ['todoist_list', 'todoist_create', 'todoist_complete', 'todoist_projects'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'todoist-mcp-server'],
    requiredEnv: ['TODOIST_API_TOKEN'],
  },
  {
    id: 'mcp-youtube',
    name: 'YouTube',
    description: 'Fetch YouTube video transcripts, captions, and metadata. Search for videos and extract content for analysis.',
    author: 'Community',
    version: '1.0.0',
    category: 'docs',
    icon: 'youtube',
    repoUrl: 'https://github.com/kimtaeyoon83/mcp-server-youtube-transcript',
    tools: ['youtube_transcript', 'youtube_search', 'youtube_metadata'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'mcp-server-youtube-transcript'],
  },
  {
    id: 'mcp-aws',
    name: 'AWS',
    description: 'Interact with AWS services. Manage S3 buckets, query DynamoDB, invoke Lambda functions, and access CloudWatch logs.',
    author: 'Community',
    version: '1.0.0',
    category: 'devops',
    icon: 'aws',
    repoUrl: 'https://github.com/aws/aws-mcp',
    tools: ['aws_s3', 'aws_dynamodb', 'aws_lambda', 'aws_cloudwatch'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', 'aws-mcp-server'],
    requiredEnv: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  },
  {
    id: 'mcp-fetch',
    name: 'Fetch',
    description: 'HTTP client for fetching web pages and APIs. Make GET/POST requests, extract content, and convert HTML to markdown.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'productivity',
    icon: 'fetch',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['fetch_url', 'fetch_html', 'fetch_markdown'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-fetch'],
  },
  {
    id: 'mcp-sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Dynamic problem-solving through structured thought sequences. Break down complex tasks with branching and revision capabilities.',
    author: 'Anthropic',
    version: '1.0.0',
    category: 'productivity',
    icon: 'thinking',
    repoUrl: 'https://github.com/modelcontextprotocol/servers',
    tools: ['create_thought', 'revise_thought', 'branch_thought'],
    spawnCommand: 'npx',
    spawnArgs: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
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
 * Get all servers (curated + custom) with their install state.
 */
export function getServers(): MCPServer[] {
  const allServers = [...CURATED_SERVERS, ...getCustomServers()]
  return allServers.map(server => ({
    ...server,
    installed: installedServers.has(server.id),
    configuredAt: installedServers.get(server.id)?.installedAt,
  }))
}

/**
 * Install/enable an MCP server.
 * Spawns the server process and connects via stdio MCP protocol.
 * Discovers available tools and registers them with the agent system.
 */
export async function installServer(serverId: string, config?: Record<string, any>): Promise<MCPInstallResult> {
  const allServers = [...CURATED_SERVERS, ...getCustomServers()]
  const server = allServers.find(s => s.id === serverId)
  if (!server) {
    return { success: false, serverId, error: 'Server not found in curated list' }
  }

  if (!server.spawnCommand) {
    return { success: false, serverId, error: 'Server has no spawn command configured' }
  }

  try {
    // Build environment variables: merge defaultEnv (from custom server definition) with config overrides
    const env: Record<string, string> = {}
    if (server.defaultEnv) {
      for (const [key, value] of Object.entries(server.defaultEnv)) {
        if (typeof value === 'string') {
          env[key] = value
        }
      }
    }
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
  const allServers = [...CURATED_SERVERS, ...getCustomServers()]
  const entries = Array.from(installedServers.entries())
  for (let i = 0; i < entries.length; i++) {
    const [serverId, state] = entries[i]
    const server = allServers.find(s => s.id === serverId)
    if (!server?.spawnCommand) continue

    try {
      // Merge defaultEnv (from custom server definition) with persisted config
      const env: Record<string, string> = {}
      if (server.defaultEnv) {
        for (const [key, value] of Object.entries(server.defaultEnv)) {
          if (typeof value === 'string') {
            env[key] = value
          }
        }
      }
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

// ─── Custom MCP Servers ──────────────────────────────────────────────────────

export interface CustomMCPServer {
  id: string
  name: string
  description: string
  command: string
  args: string[]
  env?: Record<string, string>
}

function getCustomServersPath(): string {
  return path.join(storeDir, 'mcp-custom-servers.json')
}

function loadCustomServers(): CustomMCPServer[] {
  try {
    const filePath = getCustomServersPath()
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (err) {
    console.error('[Artemis MCP] Failed to load custom servers:', err)
  }
  return []
}

function saveCustomServers(servers: CustomMCPServer[]): void {
  try {
    fs.writeFileSync(getCustomServersPath(), JSON.stringify(servers, null, 2))
  } catch (err) {
    console.error('[Artemis MCP] Failed to save custom servers:', err)
  }
}

export function getCustomServers(): MCPServer[] {
  return loadCustomServers().map(cs => ({
    id: cs.id,
    name: cs.name,
    description: cs.description || 'Custom MCP server',
    author: 'Custom',
    version: '0.0.0',
    category: 'code' as const,
    icon: 'custom',
    tools: [],
    spawnCommand: cs.command,
    spawnArgs: cs.args,
    requiredEnv: cs.env ? Object.keys(cs.env) : [],
    defaultEnv: cs.env || undefined,
  }))
}

export function addCustomServer(server: CustomMCPServer): { success: boolean; error?: string } {
  // Input validation
  if (!server || typeof server !== 'object') {
    return { success: false, error: 'Invalid server definition' }
  }
  if (!server.id || typeof server.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(server.id)) {
    return { success: false, error: 'Invalid server ID: must be alphanumeric with hyphens/underscores only' }
  }
  if (!server.name || typeof server.name !== 'string' || server.name.length > 100) {
    return { success: false, error: 'Invalid server name: must be a non-empty string (max 100 chars)' }
  }
  if (!server.command || typeof server.command !== 'string') {
    return { success: false, error: 'Invalid server command: must be a non-empty string' }
  }
  if (!Array.isArray(server.args)) {
    return { success: false, error: 'Invalid server args: must be an array' }
  }
  // Block shell metacharacters in command
  if (/[;&|`$(){}\[\]<>\n\r]/.test(server.command)) {
    return { success: false, error: 'Invalid server command: contains dangerous shell characters' }
  }

  const servers = loadCustomServers()
  if (servers.some(s => s.id === server.id) || CURATED_SERVERS.some(s => s.id === server.id)) {
    return { success: false, error: 'Server ID already exists' }
  }
  servers.push(server)
  saveCustomServers(servers)
  return { success: true }
}

export function removeCustomServer(serverId: string): { success: boolean; error?: string } {
  const servers = loadCustomServers()
  const idx = servers.findIndex(s => s.id === serverId)
  if (idx === -1) return { success: false, error: 'Custom server not found' }
  servers.splice(idx, 1)
  saveCustomServers(servers)
  // Also uninstall if installed
  if (installedServers.has(serverId)) {
    mcpClientManager.disconnect(serverId)
    installedServers.delete(serverId)
    saveInstalledServers()
  }
  return { success: true }
}

export function getCustomServersList(): CustomMCPServer[] {
  return loadCustomServers()
}

// ─── MCP Server Logs ─────────────────────────────────────────────────────────

export function getServerLogs(serverId: string): MCPLogEntry[] {
  const client = mcpClientManager.get(serverId)
  return client?.logs || []
}

export function clearServerLogs(serverId: string): void {
  const client = mcpClientManager.get(serverId)
  client?.clearLogs()
}

export function getAllServerLogs(): Record<string, MCPLogEntry[]> {
  const result: Record<string, MCPLogEntry[]> = {}
  const servers = getServers().filter(s => s.installed)
  for (const s of servers) {
    const client = mcpClientManager.get(s.id)
    if (client) {
      result[s.id] = client.logs
    }
  }
  return result
}

// ─── Persistence ────────────────────────────────────────────────────────────

function getMCPStorePath(): string {
  return path.join(storeDir, 'mcp-servers.json')
}

// ─── Config Encryption Helpers ──────────────────────────────────────────────

function encryptConfigValue(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return value
  return 'enc:' + safeStorage.encryptString(value).toString('base64')
}

function decryptConfigValue(stored: string): string {
  if (!stored.startsWith('enc:')) return stored
  if (!safeStorage.isEncryptionAvailable()) return ''
  return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
}

function encryptConfig(config: Record<string, any>): Record<string, any> {
  const encrypted: Record<string, any> = {}
  for (const [key, value] of Object.entries(config)) {
    encrypted[key] = typeof value === 'string' ? encryptConfigValue(value) : value
  }
  return encrypted
}

function decryptConfig(config: Record<string, any>): Record<string, any> {
  const decrypted: Record<string, any> = {}
  for (const [key, value] of Object.entries(config)) {
    decrypted[key] = typeof value === 'string' ? decryptConfigValue(value) : value
  }
  return decrypted
}

function loadInstalledServers(): void {
  try {
    const filePath = getMCPStorePath()
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (data && typeof data === 'object') {
        for (const [id, stateVal] of Object.entries(data)) {
          const state = stateVal as MCPServerState
          // Decrypt config values on load
          if (state.config) {
            state.config = decryptConfig(state.config)
          }
          installedServers.set(id, state)
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
    const data: Record<string, any> = {}
    for (const [id, state] of Array.from(installedServers)) {
      // Encrypt config values before writing to disk
      data[id] = {
        ...state,
        config: state.config ? encryptConfig(state.config) : {},
      }
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error('[Artemis MCP] Failed to save installed servers:', err)
  }
}
