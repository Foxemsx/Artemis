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

// ─── Active Agent Runs ───────────────────────────────────────────────────

const activeRuns = new Map<string, AgentLoop>()

// ─── Tool Approval System ─────────────────────────────────────────────────

const pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>()

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
    } catch { return true }

    // Wait for renderer to respond
    return new Promise<boolean>((resolve) => {
      pendingApprovals.set(approvalId, { resolve })
      // Auto-approve after 60s to prevent stuck agent
      setTimeout(() => {
        if (pendingApprovals.has(approvalId)) {
          pendingApprovals.delete(approvalId)
          resolve(true)
        }
      }, 60_000)
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

      const response = await agentLoop.run(request, onEvent, approvalCallback)

      // Send completion
      mainWindow.webContents.send(`agent:complete:${requestId}`, response)
      return response
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

  // ─── Abort Agent Run ─────────────────────────────────────────────────
  ipcMain.handle('agent:abort', (_event, requestId: string) => {
    const agentLoop = activeRuns.get(requestId)
    if (agentLoop) {
      agentLoop.abort()
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
