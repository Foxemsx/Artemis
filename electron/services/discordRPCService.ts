/**
 * Discord RPC Service — Rich Presence integration for Artemis IDE.
 * 
 * Connects to Discord via local IPC socket (no API keys needed).
 * Shows dynamic status: current file, language, elapsed time.
 * Auto-detects Discord installation cross-platform.
 * 
 * Protocol: Discord IPC uses framed messages over a named pipe / Unix socket.
 * Frame format: [opcode: u32 LE] [length: u32 LE] [json payload]
 * Opcodes: 0 = HANDSHAKE, 1 = FRAME, 2 = CLOSE, 3 = PING, 4 = PONG
 */

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import net from 'net'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DiscordPresence {
  details?: string      // Line 1: e.g., "Editing App.tsx"
  state?: string        // Line 2: e.g., "Workspace: Artemis"
  largeImageKey?: string
  largeImageText?: string
  smallImageKey?: string
  smallImageText?: string
  startTimestamp?: number
  instance?: boolean
}

export interface DiscordRPCState {
  connected: boolean
  enabled: boolean
  error?: string
  lastFile?: string
  startTime?: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CLIENT_ID = '1470066535660785835'
const RPC_VERSION = 1

// IPC Opcodes
const OP_HANDSHAKE = 0
const OP_FRAME = 1
const OP_CLOSE = 2

// Language icon mapping (Discord asset keys — must match uploaded assets in Discord Dev Portal)
const LANG_ICONS: Record<string, string> = {
  typescript: 'typescript',
  typescriptreact: 'typescript',
  javascript: 'javascript',
  javascriptreact: 'javascript',
  python: 'python',
  rust: 'rust',
  go: 'go',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  html: 'html',
  css: 'css',
  json: 'json',
  markdown: 'markdown',
  sql: 'sql',
}

// ─── Debug Logging ──────────────────────────────────────────────────────────

let debugMode = false

function debugLog(...args: any[]): void {
  if (debugMode) {
    console.log('[Artemis:DiscordRPC]', ...args)
  }
}

function errorLog(...args: any[]): void {
  console.error('[Artemis:DiscordRPC]', ...args)
}

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled
  debugLog('Debug mode', enabled ? 'enabled' : 'disabled')
}

// ─── Discord IPC Connection ─────────────────────────────────────────────────

let ipcSocket: net.Socket | null = null
let rpcState: DiscordRPCState = { connected: false, enabled: false }
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let currentPresence: DiscordPresence | null = null
let handshakeComplete = false
let readBuffer = Buffer.alloc(0)

/**
 * Get the Discord IPC socket path (cross-platform).
 */
function getIPCPath(id: number = 0): string {
  if (process.platform === 'win32') {
    return `\\\\?\\pipe\\discord-ipc-${id}`
  }
  
  const prefix = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp'
  return path.join(prefix, `discord-ipc-${id}`)
}

/**
 * Detect if Discord is installed and running on the system.
 * Checks both installation paths and active IPC pipe availability.
 */
export async function detectDiscord(): Promise<boolean> {
  debugLog('Detecting Discord installation...')

  // First: check if any IPC pipe is available (means Discord is running)
  for (let i = 0; i < 10; i++) {
    const ipcPath = getIPCPath(i)
    try {
      if (process.platform === 'win32') {
        // On Windows, try a quick connect to the named pipe
        const available = await new Promise<boolean>((resolve) => {
          const testSocket = net.createConnection(ipcPath, () => {
            testSocket.destroy()
            resolve(true)
          })
          testSocket.on('error', () => resolve(false))
          setTimeout(() => { testSocket.destroy(); resolve(false) }, 1000)
        })
        if (available) {
          debugLog(`Discord pipe found: discord-ipc-${i}`)
          return true
        }
      } else {
        await fs.promises.access(ipcPath)
        debugLog(`Discord socket found: ${ipcPath}`)
        return true
      }
    } catch { continue }
  }

  // Fallback: check installation paths
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    const paths = [
      path.join(localAppData, 'Discord'),
      path.join(localAppData, 'DiscordPTB'),
      path.join(localAppData, 'DiscordCanary'),
    ]
    for (const p of paths) {
      try {
        await fs.promises.access(p)
        debugLog(`Discord install found at: ${p}`)
        return true
      } catch { continue }
    }
  } else if (process.platform === 'darwin') {
    const paths = [
      '/Applications/Discord.app',
      path.join(process.env.HOME || '', 'Applications/Discord.app'),
    ]
    for (const p of paths) {
      try {
        await fs.promises.access(p)
        debugLog(`Discord install found at: ${p}`)
        return true
      } catch { continue }
    }
  } else {
    // Linux — check if discord is in PATH
    try {
      return await new Promise<boolean>((resolve) => {
        const child = spawn('which', ['discord'], { stdio: ['ignore', 'pipe', 'pipe'] })
        child.on('close', (code) => {
          debugLog(`which discord: exit code ${code}`)
          resolve(code === 0)
        })
        child.on('error', () => resolve(false))
      })
    } catch {
      return false
    }
  }

  debugLog('Discord not detected')
  return false
}

/**
 * Parse incoming IPC frames from Discord.
 * Discord sends framed JSON responses: [opcode:u32LE][length:u32LE][json]
 */
function processIncomingData(data: Buffer): void {
  readBuffer = Buffer.concat([readBuffer, data])

  while (readBuffer.length >= 8) {
    const opcode = readBuffer.readUInt32LE(0)
    const length = readBuffer.readUInt32LE(4)

    if (readBuffer.length < 8 + length) break // wait for more data

    const payload = readBuffer.subarray(8, 8 + length).toString('utf8')
    readBuffer = readBuffer.subarray(8 + length)

    try {
      const json = JSON.parse(payload)
      debugLog(`Received opcode=${opcode}:`, JSON.stringify(json).slice(0, 300))

      if (opcode === OP_FRAME) {
        if (json.cmd === 'DISPATCH' && json.evt === 'READY') {
          handshakeComplete = true
          rpcState.connected = true
          rpcState.error = undefined
          debugLog('Handshake READY — user:', json.data?.user?.username || 'unknown')

          // Re-send pending presence after handshake completes
          if (currentPresence) {
            setActivity(currentPresence)
          }
        } else if (json.cmd === 'SET_ACTIVITY') {
          if (json.evt === 'ERROR') {
            errorLog('SET_ACTIVITY error:', json.data?.message || 'unknown')
            rpcState.error = json.data?.message
          } else {
            debugLog('Presence updated successfully')
          }
        }
      } else if (opcode === OP_CLOSE) {
        debugLog('Discord sent CLOSE frame:', json.message || 'no reason')
        rpcState.error = json.message || 'Discord closed connection'
        disconnectSocket()
      }
    } catch (parseErr) {
      debugLog('Failed to parse IPC frame:', parseErr)
    }
  }
}

/**
 * Write an IPC frame to Discord.
 */
function writeFrame(opcode: number, payload: string): boolean {
  if (!ipcSocket) return false

  const header = Buffer.alloc(8)
  header.writeUInt32LE(opcode, 0)
  header.writeUInt32LE(Buffer.byteLength(payload), 4)

  try {
    ipcSocket.write(Buffer.concat([header, Buffer.from(payload)]))
    debugLog(`Sent opcode=${opcode}, ${Buffer.byteLength(payload)} bytes`)
    return true
  } catch (err) {
    errorLog('Write error:', err)
    return false
  }
}

/**
 * Connect to Discord's local IPC socket.
 */
export async function connect(): Promise<boolean> {
  if (ipcSocket && rpcState.connected && handshakeComplete) return true

  debugLog('Attempting to connect to Discord IPC...')

  // Clean up any stale socket
  disconnectSocket()

  // Try IPC pipes 0-9
  for (let i = 0; i < 10; i++) {
    const ipcPath = getIPCPath(i)
    debugLog(`Trying pipe ${i}: ${ipcPath}`)
    try {
      const connected = await tryConnect(ipcPath, i)
      if (connected) {
        rpcState.enabled = true
        rpcState.startTime = Date.now()
        debugLog(`Connected on pipe ${i}`)
        return true
      }
    } catch (err) {
      debugLog(`Pipe ${i} failed:`, err)
      continue
    }
  }

  rpcState.connected = false
  rpcState.error = 'Could not connect to Discord. Is it running?'
  errorLog(rpcState.error)
  return false
}

/**
 * Try connecting to a specific IPC path.
 */
function tryConnect(ipcPath: string, pipeIndex: number): Promise<boolean> {
  return new Promise((resolve) => {
    handshakeComplete = false
    readBuffer = Buffer.alloc(0)

    const socket = net.createConnection(ipcPath, () => {
      ipcSocket = socket
      debugLog(`Socket connected to pipe ${pipeIndex}, sending handshake...`)

      // Send handshake
      const handshake = JSON.stringify({ v: RPC_VERSION, client_id: CLIENT_ID })
      writeFrame(OP_HANDSHAKE, handshake)

      // Wait for READY response before resolving
      const readyTimeout = setTimeout(() => {
        if (!handshakeComplete) {
          debugLog(`Handshake timeout on pipe ${pipeIndex}`)
          socket.destroy()
          ipcSocket = null
          resolve(false)
        }
      }, 5000)

      const checkReady = setInterval(() => {
        if (handshakeComplete) {
          clearInterval(checkReady)
          clearTimeout(readyTimeout)
          resolve(true)
        }
      }, 50)
    })

    // Handle incoming data
    socket.on('data', (data: Buffer) => {
      processIncomingData(data)
    })

    socket.on('error', (err) => {
      debugLog(`Socket error on pipe ${pipeIndex}:`, err.message)
      resolve(false)
    })

    socket.on('close', () => {
      debugLog(`Socket closed (pipe ${pipeIndex})`)
      ipcSocket = null
      handshakeComplete = false
      rpcState.connected = false

      // Auto-reconnect if still enabled
      if (rpcState.enabled && !reconnectTimer) {
        debugLog('Scheduling reconnect in 15s...')
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          if (rpcState.enabled) {
            debugLog('Auto-reconnecting...')
            connect()
          }
        }, 15000)
      }
    })

    // Connection timeout
    setTimeout(() => {
      if (!ipcSocket || ipcSocket !== socket) {
        socket.destroy()
        resolve(false)
      }
    }, 3000)
  })
}

/**
 * Disconnect the socket without changing enabled state.
 */
function disconnectSocket(): void {
  handshakeComplete = false
  readBuffer = Buffer.alloc(0)

  if (ipcSocket) {
    try { ipcSocket.destroy() } catch {}
    ipcSocket = null
  }
}

/**
 * Disconnect from Discord RPC.
 */
export function disconnect(): void {
  debugLog('Disconnecting...')
  rpcState.enabled = false
  rpcState.connected = false
  currentPresence = null

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  disconnectSocket()
  debugLog('Disconnected')
}

/**
 * Set the Rich Presence activity.
 */
export function setActivity(presence: DiscordPresence): void {
  currentPresence = presence

  if (!ipcSocket || !handshakeComplete) {
    debugLog('setActivity skipped — not connected/handshake incomplete')
    return
  }

  const activity: Record<string, any> = {
    details: presence.details || 'Idle',
    state: presence.state || 'Artemis IDE',
    instance: false,
  }

  if (presence.startTimestamp) {
    activity.timestamps = { start: Math.floor(presence.startTimestamp / 1000) }
  }

  activity.assets = {
    large_image: presence.largeImageKey || 'artemis_logo',
    large_text: presence.largeImageText || 'Artemis IDE',
  }

  if (presence.smallImageKey) {
    activity.assets.small_image = presence.smallImageKey
    activity.assets.small_text = presence.smallImageText
  }

  const payload = JSON.stringify({
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid, activity },
    nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  })

  debugLog('Setting activity:', presence.details, '|', presence.state)
  writeFrame(OP_FRAME, payload)
}

/**
 * Update presence based on current editing state.
 */
export function updatePresence(fileName?: string, language?: string, projectName?: string): void {
  if (!rpcState.enabled) return

  const langIcon = language ? LANG_ICONS[language] : undefined
  const details = fileName ? `Editing ${fileName}` : 'Idle'
  const state = projectName ? `Project: ${projectName}` : 'Artemis IDE'

  debugLog(`updatePresence: ${details} | ${state} | lang=${language || 'none'}`)

  setActivity({
    details,
    state,
    largeImageKey: 'artemis_logo',
    largeImageText: 'Artemis IDE — AI-Powered Development',
    smallImageKey: langIcon,
    smallImageText: language ? language.charAt(0).toUpperCase() + language.slice(1) : undefined,
    startTimestamp: rpcState.startTime || Date.now(),
  })

  rpcState.lastFile = fileName
}

/**
 * Clear presence (set to idle).
 */
export function clearActivity(): void {
  if (!ipcSocket || !handshakeComplete) return

  debugLog('Clearing activity')
  const payload = JSON.stringify({
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid, activity: null },
    nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  })

  writeFrame(OP_FRAME, payload)
}

/**
 * Get current RPC state.
 */
export function getState(): DiscordRPCState {
  return { ...rpcState }
}

/**
 * Toggle RPC on/off.
 */
export async function toggle(enable: boolean): Promise<DiscordRPCState> {
  debugLog('Toggle:', enable)
  if (enable) {
    rpcState.enabled = true
    const ok = await connect()
    if (ok) {
      updatePresence()
    }
  } else {
    clearActivity()
    disconnect()
  }
  return getState()
}
