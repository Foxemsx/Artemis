/**
 * MCP Client — Model Context Protocol client over stdio (JSON-RPC 2.0).
 * 
 * Spawns MCP server processes and communicates via stdin/stdout.
 * Handles tool discovery (tools/list) and execution (tools/call).
 * 
 * Protocol: https://modelcontextprotocol.io/docs/spec
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MCPToolParameter {
  type: string
  description?: string
  enum?: string[]
  default?: any
}

export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, MCPToolParameter>
    required?: string[]
  }
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  isError?: boolean
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, any>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: any
  error?: { code: number; message: string; data?: any }
}

export interface MCPLogEntry {
  timestamp: number
  stream: 'stdout' | 'stderr'
  message: string
}

// ─── MCP Client ─────────────────────────────────────────────────────────────

export class MCPClient extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer: string = ''
  private requestId: number = 0
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }> = new Map()
  private _tools: MCPToolDefinition[] = []
  private _connected: boolean = false
  private _serverId: string
  private _logs: MCPLogEntry[] = []
  private static MAX_LOGS = 500

  constructor(serverId: string) {
    super()
    this._serverId = serverId
  }

  get serverId(): string { return this._serverId }
  get connected(): boolean { return this._connected }
  get tools(): MCPToolDefinition[] { return [...this._tools] }
  get logs(): MCPLogEntry[] { return [...this._logs] }

  private addLog(stream: 'stdout' | 'stderr', message: string): void {
    const ts = Date.now()
    this._logs.push({ timestamp: ts, stream, message })
    if (this._logs.length > MCPClient.MAX_LOGS) {
      this._logs = this._logs.slice(-MCPClient.MAX_LOGS)
    }
    this.emit('log', { stream, message, timestamp: ts })
  }

  clearLogs(): void {
    this._logs = []
  }

  /**
   * Start the MCP server process and initialize the connection.
   */
  async connect(command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    // Security: Validate command to prevent injection
    MCPClient.validateSpawnCommand(command)

    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: typeof resolve | typeof reject, value?: any) => {
        if (settled) return
        settled = true
        fn(value)
      }

      try {
        const processEnv = { ...process.env, ...env }

        // Resolve command to full path on Windows instead of using shell:true
        let spawnCommand = process.platform === 'win32'
          ? MCPClient.resolveCommand(command)
          : command
        let spawnArgs = args

        // On Windows, .cmd/.bat files are batch scripts and cannot be spawned
        // directly without a shell — route them through cmd.exe /c
        if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(spawnCommand)) {
          spawnArgs = ['/c', spawnCommand, ...args]
          spawnCommand = process.env.ComSpec || 'cmd.exe'
        }

        this.process = spawn(spawnCommand, spawnArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: processEnv,
          shell: false,
        })

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleData(data.toString())
        })

        this.process.stderr?.on('data', (data: Buffer) => {
          const msg = data.toString().trim()
          console.warn(`[MCP:${this._serverId}] stderr:`, msg)
          this.addLog('stderr', msg)
        })

        this.process.on('error', (err) => {
          console.error(`[MCP:${this._serverId}] Process error:`, err.message)
          this._connected = false
          this.emit('error', err)
          settle(reject, err)
        })

        this.process.on('exit', (code) => {
          console.log(`[MCP:${this._serverId}] Process exited with code ${code}`)
          this._connected = false
          this.rejectAllPending(new Error(`MCP server exited with code ${code}`))
          this.emit('disconnected', code)
          settle(reject, new Error(`MCP server exited with code ${code} during connect`))
        })

        // Send initialize immediately — the 30s request timeout handles slow starts
        this.initialize()
          .then(() => this.discoverTools())
          .then(() => {
            this._connected = true
            this.emit('connected', this._tools)
            settle(resolve)
          })
          .catch((err: any) => {
            this.disconnect()
            settle(reject, err)
          })
      } catch (err: any) {
        settle(reject, new Error(`Failed to spawn MCP server: ${err.message}`))
      }
    })
  }

  /**
   * Security: Validate that a spawn command is safe.
   * Blocks shell metacharacters, path traversal, and dangerous executables.
   */
  private static validateSpawnCommand(command: string): void {
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid MCP server command: must be a non-empty string')
    }
    // Block shell metacharacters
    if (/[;&|`$(){}\[\]<>\n\r]/.test(command)) {
      throw new Error('Invalid MCP server command: contains dangerous shell characters')
    }
    // Block path traversal
    if (command.includes('..')) {
      throw new Error('Invalid MCP server command: path traversal not allowed')
    }
  }

  /**
   * Resolve a command name to its full path on Windows.
   * This avoids needing shell:true for commands like 'npx', 'node', etc.
   */
  private static resolveCommand(command: string): string {
    // If it's already an absolute path, use it directly
    if (path.isAbsolute(command)) return command

    // On Windows, .cmd/.bat/.exe are the executable forms — try them BEFORE bare names
    // (e.g., 'npx' without extension is a shell script that can't be spawned without a shell)
    const cmdExtensions = ['.cmd', '.bat', '.exe']
    const pathDirs = (process.env.PATH || '').split(path.delimiter)
    const fsModule = require('fs')

    for (const dir of pathDirs) {
      // Try extensions first — these are directly executable on Windows
      for (const ext of cmdExtensions) {
        const withExt = path.join(dir, command + ext)
        try { if (fsModule.existsSync(withExt)) return withExt } catch {}
      }
      // Fall back to exact name (for .exe files already named correctly, etc.)
      const exact = path.join(dir, command)
      try { if (fsModule.existsSync(exact)) return exact } catch {}
    }

    // Fall back to the raw command — spawn will throw ENOENT if not found
    return command
  }

  /**
   * Send the initialize handshake.
   */
  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'Artemis-IDE',
        version: '0.1.0',
      },
    })

    if (!result) {
      throw new Error('MCP server did not respond to initialize')
    }

    // Send initialized notification (no response expected)
    this.sendNotification('notifications/initialized', {})
  }

  /**
   * Discover available tools from the server.
   */
  private async discoverTools(): Promise<void> {
    const result = await this.sendRequest('tools/list', {})
    if (result?.tools && Array.isArray(result.tools)) {
      this._tools = result.tools.map((t: any) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      }))
      console.log(`[MCP:${this._serverId}] Discovered ${this._tools.length} tools:`, this._tools.map(t => t.name))
    } else {
      this._tools = []
      console.warn(`[MCP:${this._serverId}] No tools discovered`)
    }
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(name: string, args: Record<string, any>): Promise<MCPToolCallResult> {
    if (!this._connected || !this.process) {
      throw new Error(`MCP server ${this._serverId} is not connected`)
    }

    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })

    if (!result) {
      throw new Error(`No response from MCP server for tool: ${name}`)
    }

    return {
      content: result.content || [{ type: 'text', text: 'No output' }],
      isError: result.isError || false,
    }
  }

  /**
   * Disconnect and kill the server process.
   */
  disconnect(): void {
    this._connected = false
    this._tools = []
    this.rejectAllPending(new Error('Client disconnected'))

    if (this.process) {
      try {
        this.process.kill('SIGTERM')
        // Force kill after 3 seconds
        setTimeout(() => {
          try { this.process?.kill('SIGKILL') } catch { /* already dead */ }
        }, 3000)
      } catch { /* already dead */ }
      this.process = null
    }
  }

  // ─── JSON-RPC Transport ──────────────────────────────────────────────

  private sendRequest(method: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        return reject(new Error('MCP server stdin not writable'))
      }

      const id = ++this.requestId
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`MCP request timed out: ${method}`))
      }, 30_000)

      this.pendingRequests.set(id, { resolve, reject, timer })

      const message = JSON.stringify(request) + '\n'
      this.process.stdin.write(message)
    })
  }

  private sendNotification(method: string, params: Record<string, any>): void {
    if (!this.process?.stdin?.writable) return

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    }

    this.process.stdin.write(JSON.stringify(notification) + '\n')
  }

  private handleData(data: string): void {
    this.buffer += data

    // Process complete lines (newline-delimited JSON)
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || '' // Keep incomplete last line in buffer

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse
        
        // Handle response to our request
        if (response.id !== undefined && this.pendingRequests.has(response.id)) {
          const pending = this.pendingRequests.get(response.id)!
          this.pendingRequests.delete(response.id)
          clearTimeout(pending.timer)

          if (response.error) {
            pending.reject(new Error(`MCP error: ${response.error.message}`))
          } else {
            pending.resolve(response.result)
          }
        }
        // Handle server notifications (no id)
        else if (response.id === undefined) {
          this.emit('notification', response)
        }
      } catch {
        // Not valid JSON, might be debug output from the server
        console.debug(`[MCP:${this._serverId}] Non-JSON output:`, trimmed.slice(0, 200))
      }
    }
  }

  private rejectAllPending(error: Error): void {
    Array.from(this.pendingRequests.entries()).forEach(([_id, pending]) => {
      clearTimeout(pending.timer)
      pending.reject(error)
    })
    this.pendingRequests.clear()
  }
}

// ─── MCP Client Manager ────────────────────────────────────────────────────

/**
 * Manages multiple MCP client connections.
 */
class MCPClientManager {
  private clients: Map<string, MCPClient> = new Map()

  /**
   * Connect to an MCP server and return its client.
   */
  async connect(serverId: string, command: string, args: string[] = [], env?: Record<string, string>): Promise<MCPClient> {
    // Disconnect existing if any
    this.disconnect(serverId)

    const client = new MCPClient(serverId)
    await client.connect(command, args, env)
    this.clients.set(serverId, client)
    return client
  }

  /**
   * Get a connected client by server ID.
   */
  get(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId)
  }

  /**
   * Get all connected clients.
   */
  getAll(): MCPClient[] {
    const all: MCPClient[] = []
    Array.from(this.clients.values()).forEach(c => { if (c.connected) all.push(c) })
    return all
  }

  /**
   * Get all tools from all connected servers, prefixed with server ID.
   */
  getAllTools(): Array<MCPToolDefinition & { serverId: string; originalName: string }> {
    const tools: Array<MCPToolDefinition & { serverId: string; originalName: string }> = []
    Array.from(this.clients.values()).forEach(client => {
      if (!client.connected) return
      client.tools.forEach(tool => {
        tools.push({
          ...tool,
          originalName: tool.name,
          name: `mcp_${client.serverId.replace(/-/g, '_')}_${tool.name}`,
          serverId: client.serverId,
        })
      })
    })
    return tools
  }

  /**
   * Call a tool by its prefixed name.
   */
  async callTool(prefixedName: string, args: Record<string, any>): Promise<string> {
    // Find the matching client and original tool name
    const clients = Array.from(this.clients.values())
    for (let ci = 0; ci < clients.length; ci++) {
      const client = clients[ci]
      if (!client.connected) continue
      const clientTools = client.tools
      for (let ti = 0; ti < clientTools.length; ti++) {
        const tool = clientTools[ti]
        const expectedName = `mcp_${client.serverId.replace(/-/g, '_')}_${tool.name}`
        if (expectedName === prefixedName) {
          const result = await client.callTool(tool.name, args)
          // Extract text content from result
          const textParts = result.content
            .filter(c => c.type === 'text' && c.text)
            .map(c => c.text!)
          const output = textParts.join('\n') || 'Tool returned no text output'
          if (result.isError) {
            throw new Error(output)
          }
          return output
        }
      }
    }
    throw new Error(`MCP tool not found: ${prefixedName}`)
  }

  /**
   * Check if a tool name belongs to an MCP server.
   */
  isMCPTool(name: string): boolean {
    return name.startsWith('mcp_')
  }

  /**
   * Disconnect a specific server.
   */
  disconnect(serverId: string): void {
    const client = this.clients.get(serverId)
    if (client) {
      client.disconnect()
      this.clients.delete(serverId)
    }
  }

  /**
   * Disconnect all servers.
   */
  disconnectAll(): void {
    Array.from(this.clients.values()).forEach(client => client.disconnect())
    this.clients.clear()
  }
}

// Singleton
export const mcpClientManager = new MCPClientManager()
