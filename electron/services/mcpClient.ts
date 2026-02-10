import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import { ALLOWED_EXECUTABLES, resolveCommand } from '../shared/security'

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

  async connect(command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    MCPClient.validateSpawnCommand(command)

    let resolvedCommand = command
    if (process.platform === 'win32') {
      resolvedCommand = await resolveCommand(command)
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: typeof resolve | typeof reject, value?: any) => {
        if (settled) return
        settled = true
        fn(value)
      }

      try {
        const processEnv = { ...process.env, ...env }

        let spawnCommand = resolvedCommand
        let spawnArgs = args

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

  private static validateSpawnCommand(command: string): void {
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid MCP server command: must be a non-empty string')
    }
    if (/[;&|`$(){}\[\]<>\n\r]/.test(command)) {
      throw new Error('Invalid MCP server command: contains dangerous shell characters')
    }
    if (command.includes('..')) {
      throw new Error('Invalid MCP server command: path traversal not allowed')
    }
    const base = path.basename(command).replace(/\.(cmd|bat|exe|sh)$/i, '').toLowerCase()
    if (!ALLOWED_EXECUTABLES.has(base)) {
      throw new Error(`Invalid MCP server command: executable '${base}' is not allowed`)
    }
  }

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

    this.sendNotification('notifications/initialized', {})
  }

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

  disconnect(): void {
    this._connected = false
    this._tools = []
    this.rejectAllPending(new Error('Client disconnected'))

    if (this.process) {
      try { this.process.removeAllListeners() } catch { }
      try {
        this.process.kill('SIGTERM')
        setTimeout(() => {
          try { this.process?.kill('SIGKILL') } catch { }
        }, 3000)
      } catch { }
      this.process = null
    }
    this.removeAllListeners()
  }

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

  private static MAX_BUFFER_SIZE = 1_048_576

  private handleData(data: string): void {
    this.buffer += data

    if (this.buffer.length > MCPClient.MAX_BUFFER_SIZE) {
      console.error(`[MCP:${this._serverId}] Buffer overflow (>${MCPClient.MAX_BUFFER_SIZE} bytes) — disconnecting`)
      this.addLog('stderr', `Buffer overflow: server sent >1MB without newline delimiter. Disconnecting.`)
      this.buffer = ''
      this.rejectAllPending(new Error('MCP server buffer overflow — possible malformed output'))
      this.disconnect()
      return
    }

    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || '' // Keep incomplete last line in buffer

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse
        
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
        else if (response.id === undefined) {
          this.emit('notification', response)
        }
      } catch {
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

const MAX_MCP_SERVERS = 12

class MCPClientManager {
  private clients: Map<string, MCPClient> = new Map()

  async connect(serverId: string, command: string, args: string[] = [], env?: Record<string, string>): Promise<MCPClient> {
    this.disconnect(serverId)

    if (this.getAll().length >= MAX_MCP_SERVERS) {
      throw new Error(`Maximum MCP server connections reached (${MAX_MCP_SERVERS}). Disconnect an existing server first.`)
    }

    const client = new MCPClient(serverId)
    await client.connect(command, args, env)
    this.clients.set(serverId, client)
    return client
  }

  get(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId)
  }

  getAll(): MCPClient[] {
    const all: MCPClient[] = []
    Array.from(this.clients.values()).forEach(c => { if (c.connected) all.push(c) })
    return all
  }

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

  async callTool(prefixedName: string, args: Record<string, any>): Promise<string> {
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

  isMCPTool(name: string): boolean {
    return name.startsWith('mcp_')
  }

  disconnect(serverId: string): void {
    const client = this.clients.get(serverId)
    if (client) {
      client.disconnect()
      this.clients.delete(serverId)
    }
  }

  disconnectAll(): void {
    Array.from(this.clients.values()).forEach(client => client.disconnect())
    this.clients.clear()
  }
}

export const mcpClientManager = new MCPClientManager()
