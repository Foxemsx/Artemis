/**
 * AgentIPC — Electron IPC handlers for the agent system.
 * 
 * Bridges the renderer process (UI) with the main process agent loop.
 * Handles:
 * - Starting/stopping agent runs
 * - Streaming events to UI via IPC
 * - HTTP proxying (CORS bypass for API requests)
 * - Agent lifecycle management
 */

import { ipcMain, type BrowserWindow } from 'electron'
import type { AgentRequest, AgentEvent } from '../types'
import { AgentLoop } from '../agent/AgentLoop'
import { toolRegistry } from '../tools/ToolRegistry'
import { toolExecutor } from '../tools/ToolExecutor'

import type { ToolApprovalCallback } from '../agent/AgentLoop'
import type { ToolCall } from '../types'

// ─── URL Allowlist for HTTP Proxy (SSRF protection) ───────────────────────
// Mirrors the ALLOWED_API_DOMAINS list in main.ts to prevent SSRF via agent HTTP proxies.
const ALLOWED_API_DOMAINS = new Set([
  'opencode.ai', 'api.z.ai',
  'api.openai.com', 'api.anthropic.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'api.groq.com',
  'api.mistral.ai',
  'api.moonshot.cn',
  'api.perplexity.ai',
  'localhost',
  'html.duckduckgo.com',
])

function isAllowedApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const hostname = parsed.hostname.toLowerCase()
    const domains = Array.from(ALLOWED_API_DOMAINS)
    for (let i = 0; i < domains.length; i++) {
      if (hostname === domains[i] || hostname.endsWith('.' + domains[i])) return true
    }
    return false
  } catch {
    return false
  }
}

// ─── Active Agent Runs ───────────────────────────────────────────────────

const activeRuns = new Map<string, AgentLoop>()

// ─── Tool Approval System ─────────────────────────────────────────────────

const pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>()
const pendingPathApprovals = new Map<string, { resolve: (approved: boolean) => void }>()

function createApprovalCallback(
  requestId: string,
  mainWindow: BrowserWindow,
  onEvent: (event: AgentEvent) => void,
  seqRef: { seq: number }
): ToolApprovalCallback {
  return async (toolCall: ToolCall): Promise<boolean> => {
    const approvalId = `${requestId}-${toolCall.id}`

    // Emit event to renderer asking for approval
    try {
      mainWindow.webContents.send(`agent:event:${requestId}`, {
        type: 'tool_approval_required',
        seq: seqRef.seq++,
        timestamp: Date.now(),
        data: {
          approvalId,
          toolName: toolCall.name,
          toolArgs: toolCall.arguments,
          toolCallId: toolCall.id,
        },
      })
    } catch {
      // Window may have been closed - reject to be safe
      return false
    }

    // Wait indefinitely for explicit user approval — never auto-approve
    return new Promise<boolean>((resolve) => {
      pendingApprovals.set(approvalId, { resolve })
    })
  }
}

function createPathApprovalCallback(
  requestId: string,
  mainWindow: BrowserWindow,
  onEvent: (event: AgentEvent) => void,
  seqRef: { seq: number }
) {
  return async (filePath: string, reason: string): Promise<boolean> => {
    const approvalId = `path-${requestId}-${filePath}`

    try {
      mainWindow.webContents.send(`agent:event:${requestId}`, {
        type: 'path_approval_required',
        seq: seqRef.seq++,
        timestamp: Date.now(),
        data: {
          approvalId,
          filePath,
          reason,
        },
      })
    } catch {
      return false
    }

    // Wait indefinitely for explicit user approval — never auto-approve
    return new Promise<boolean>((resolve) => {
      pendingPathApprovals.set(approvalId, { resolve })
    })
  }
}

// ─── HTTP Adapter for Electron Main Process ──────────────────────────────────

function createHttpAdapter(mainWindow: BrowserWindow | null) {
  return {
    async request(
      url: string,
      method: string,
      headers: Record<string, string>,
      body?: string
    ) {
      try {
        const response = await fetch(url, { method, headers, body })
        const text = await response.text()
        return {
          ok: response.ok,
          status: response.status,
          data: text,
          headers: Object.fromEntries((response.headers as any).entries()),
        }
      } catch (err: any) {
        return {
          ok: false,
          status: 0,
          data: err.message || 'Network error',
          headers: {},
        }
      }
    },

    async streamRequest(
      url: string,
      method: string,
      headers: Record<string, string>,
      body: string,
      onData: (data: { type: 'chunk' | 'done' | 'error'; data?: string; status?: number }) => void
    ) {
      const controller = new AbortController()
      let cancelled = false
      const cancel = () => { cancelled = true; controller.abort() }

      try {
        const timeoutId = setTimeout(() => controller.abort(), 120_000) // 2 minute timeout

        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          onData({ type: 'error', status: response.status, data: errorText })
          return { ok: false, status: response.status, cancel }
        }

        if (!response.body) {
          onData({ type: 'error', data: 'Response body is null' })
          return { ok: false, status: 500, cancel }
        }

        // Stream the response body
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        ;(async () => {
          try {
            while (!cancelled) {
              const { done, value } = await reader.read()
              if (done) {
                onData({ type: 'done' })
                break
              }
              const text = decoder.decode(value, { stream: true })
              onData({ type: 'chunk', data: text })
            }
          } catch (err: any) {
            if (!cancelled) {
              if (err.name === 'AbortError') {
                onData({ type: 'error', data: 'Request timed out' })
              } else {
                onData({ type: 'error', data: err.message || 'Stream error' })
              }
            }
          } finally {
            reader.releaseLock()
          }
        })()

        return { ok: true, status: response.status, cancel }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          onData({ type: 'error', data: 'Request timed out. The model may be overloaded.' })
          return { ok: false, status: 0, cancel }
        }
        onData({ type: 'error', data: err.message || 'Network error' })
        return { ok: false, status: 0, cancel }
      }
    },
  }
}

// ─── Register IPC Handlers ───────────────────────────────────────────────────

export function registerAgentIPC(getMainWindow: () => BrowserWindow | null): void {

  // ─── Start Agent Run ─────────────────────────────────────────────────
  ipcMain.handle('agent:run', async (_event, request: AgentRequest) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      return { error: 'Main window not available' }
    }

    const requestId = request.requestId
    const httpAdapter = createHttpAdapter(mainWindow)
    const agentLoop = new AgentLoop(httpAdapter)
    activeRuns.set(requestId, agentLoop)

    try {
      const seqRef = { seq: 0 }

      // Stream events to renderer via IPC
      const onEvent = (event: AgentEvent) => {
        seqRef.seq = Math.max(seqRef.seq, event.seq + 1)
        try {
          mainWindow.webContents.send(`agent:event:${requestId}`, event)
        } catch {
          // Window may have been closed
        }
      }

      // Build approval callback if mode is 'ask'
      let approvalCallback: ToolApprovalCallback | undefined
      if (request.editApprovalMode === 'ask') {
        approvalCallback = createApprovalCallback(requestId, mainWindow, onEvent, seqRef)
      }

      // Build path approval callback — scoped to this run, passed per-execute call
      // to avoid race conditions on the singleton ToolExecutor.
      const pathApprovalCallback = createPathApprovalCallback(requestId, mainWindow, onEvent, seqRef)

      // Wrap the agent's onEvent to intercept tool executions and pass the per-run callback
      const originalExecute = toolExecutor.execute.bind(toolExecutor)
      const scopedExecute = (tc: ToolCall, projectPath?: string) =>
        originalExecute(tc, projectPath, pathApprovalCallback)

      // Temporarily patch execute for this run's duration
      toolExecutor.execute = scopedExecute as any

      try {
        const response = await agentLoop.run(request, onEvent, approvalCallback)

        // Send completion
        mainWindow.webContents.send(`agent:complete:${requestId}`, response)
        return response
      } finally {
        // Always restore original execute to prevent leaking scoped callbacks
        toolExecutor.execute = originalExecute
      }
    } catch (err: any) {
      const errorResponse = {
        content: '',
        toolCallsExecuted: [],
        iterations: 0,
        conversationHistory: request.conversationHistory || [],
        aborted: false,
        error: err.message || 'Agent run failed',
      }
      try {
        mainWindow.webContents.send(`agent:complete:${requestId}`, errorResponse)
      } catch {}
      return errorResponse
    } finally {
      // Wait a tick to allow any pending events to be sent before cleaning up
      await new Promise(resolve => setTimeout(resolve, 100))
      activeRuns.delete(requestId)
    }
  })

  // ─── Respond to Tool Approval ──────────────────────────────────
  ipcMain.handle('agent:respondToolApproval', (_event, approvalId: string, approved: boolean) => {
    const pending = pendingApprovals.get(approvalId)
    if (pending) {
      pending.resolve(approved)
      pendingApprovals.delete(approvalId)
      return { success: true }
    }
    return { success: false, error: 'No pending approval found' }
  })

  // ─── Respond to Path Approval ──────────────────────────────────
  ipcMain.handle('agent:respondPathApproval', (_event, approvalId: string, approved: boolean) => {
    const pending = pendingPathApprovals.get(approvalId)
    if (pending) {
      pending.resolve(approved)
      pendingPathApprovals.delete(approvalId)
      return { success: true }
    }
    return { success: false, error: 'No pending path approval found' }
  })

  // ─── Abort Agent Run ─────────────────────────────────────────────────
  ipcMain.handle('agent:abort', (_event, requestId: string) => {
    const agentLoop = activeRuns.get(requestId)
    if (agentLoop) {
      agentLoop.abort()

      // Auto-REJECT all pending approvals for this run to prevent hanging promises
      Array.from(pendingApprovals.entries()).forEach(([approvalId, pending]) => {
        if (approvalId.startsWith(requestId)) {
          pending.resolve(false)
          pendingApprovals.delete(approvalId)
        }
      })
      Array.from(pendingPathApprovals.entries()).forEach(([approvalId, pending]) => {
        if (approvalId.includes(requestId)) {
          pending.resolve(false)
          pendingPathApprovals.delete(approvalId)
        }
      })

      return { success: true }
    }
    return { success: false, error: 'No active run found' }
  })

  // ─── Get Tool Definitions ────────────────────────────────────────────
  ipcMain.handle('agent:getTools', (_event, mode?: string) => {
    if (mode) {
      return toolRegistry.getToolsForMode(mode as 'builder' | 'planner' | 'chat')
    }
    return toolRegistry.getAll()
  })

  // ─── Execute Single Tool (for testing / manual use) ──────────────────
  ipcMain.handle('agent:executeTool', async (_event, name: string, args: Record<string, any>, projectPath?: string) => {
    return toolExecutor.execute({ id: `manual-${Date.now()}`, name, arguments: args }, projectPath)
  })

  // ─── Check Active Runs ───────────────────────────────────────────────
  ipcMain.handle('agent:activeRuns', () => {
    return Array.from(activeRuns.keys())
  })

  // ─── HTTP Proxy (CORS bypass) — kept for backward compatibility ──────
  ipcMain.handle('agent:httpRequest', async (_event, options: {
    url: string
    method: string
    headers?: Record<string, string>
    body?: string
  }) => {
    // Security: Validate URL against allowlist to prevent SSRF
    if (!isAllowedApiUrl(options.url)) {
      return {
        ok: false,
        status: 0,
        statusText: 'Access denied: URL domain is not in the allowed list',
        data: '',
        headers: {},
        error: 'URL domain not allowed. Only configured API provider domains are permitted.',
      }
    }

    try {
      const response = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
      })
      const text = await response.text()
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: text,
        headers: Object.fromEntries((response.headers as any).entries()),
      }
    } catch (err: any) {
      return {
        ok: false,
        status: 0,
        statusText: err.message || 'Network error',
        data: '',
        headers: {},
        error: err.message,
      }
    }
  })

  // ─── Streaming HTTP Proxy ────────────────────────────────────────────
  ipcMain.handle('agent:httpStream', async (_event, options: {
    requestId: string
    url: string
    method: string
    headers?: Record<string, string>
    body?: string
  }) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      return { ok: false, status: 0, error: 'Main window not available' }
    }

    // Security: Validate URL against allowlist to prevent SSRF
    if (!isAllowedApiUrl(options.url)) {
      mainWindow.webContents.send(`agent:stream:${options.requestId}`, {
        type: 'error',
        data: 'Access denied: URL domain is not in the allowed list',
      })
      return { ok: false, status: 0, error: 'URL domain not allowed' }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 120_000)

      const response = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        mainWindow.webContents.send(`agent:stream:${options.requestId}`, {
          type: 'error',
          status: response.status,
          data: errorText,
        })
        return { ok: false, status: response.status }
      }

      if (!response.body) {
        mainWindow.webContents.send(`agent:stream:${options.requestId}`, {
          type: 'error',
          data: 'Response body is null',
        })
        return { ok: false, status: 500 }
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              mainWindow.webContents.send(`agent:stream:${options.requestId}`, { type: 'done' })
              break
            }
            const text = decoder.decode(value, { stream: true })
            mainWindow.webContents.send(`agent:stream:${options.requestId}`, {
              type: 'chunk',
              data: text,
            })
          }
        } finally {
          reader.releaseLock()
        }
      })()

      return { ok: true, status: response.status }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        mainWindow.webContents.send(`agent:stream:${options.requestId}`, {
          type: 'error',
          data: 'Request timed out.',
        })
        return { ok: false, status: 0, error: 'Request timeout' }
      }
      mainWindow.webContents.send(`agent:stream:${options.requestId}`, {
        type: 'error',
        data: err.message || 'Network error',
      })
      return { ok: false, status: 0, error: err.message }
    }
  })
}
