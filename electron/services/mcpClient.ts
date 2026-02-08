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

// ─── MCP Client ─────────────────────────────────────────────────────────────

export class MCPClient extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer: string = ''
  private requestId: number = 0
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }> = new Map()
  private _tools: MCPToolDefinition[] = []
  private _connected: boolean = false
  private _serverId: string

  constructor(serverId: string) {
    super()
    this._serverId = serverId
  }

  get serverId(): string { return this._serverId }
  get connected(): boolean { return this._connected }
  get tools(): MCPToolDefinition[] { return [...this._tools] }

  /**
   * Start the MCP server process and initialize the connection.
   */
  async connect(command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const processEnv = { ...process.env, ...env }
        
        this.process = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: processEnv,
          shell: process.platform === 'win32',
        })

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleData(data.toString())
        })

        this.process.stderr?.on('data', (data: Buffer) => {
          console.warn(`[MCP:${this._serverId}] stderr:`, data.toString().trim())
        })

        this.process.on('error', (err) => {
          console.error(`[MCP:${this._serverId}] Process error:`, err.message)
          this._connected = false
          this.emit('error', err)
          reject(err)
        })

        this.process.on('exit', (code) => {
          console.log(`[MCP:${this._serverId}] Process exited with code ${code}`)
          this._connected = false
          this.rejectAllPending(new Error(`MCP server exited with code ${code}`))
          this.emit('disconnected', code)
        })

        // Give the process a moment to start, then initialize
        setTimeout(async () => {
          try {
            await this.initialize()
            await this.discoverTools()
            this._connected = true
            this.emit('connected', this._tools)
            resolve()
          } catch (err: any) {
            this.disconnect()
            reject(err)
          }
        }, 500)
      } catch (err: any) {
        reject(new Error(`Failed to spawn MCP server: ${err.message}`))
      }
    })
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
