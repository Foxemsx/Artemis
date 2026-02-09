
import { ipcMain, type BrowserWindow } from 'electron'
import type { AgentRequest, AgentEvent } from '../types'
import { AgentLoop } from '../agent/AgentLoop'
import { toolRegistry } from '../tools/ToolRegistry'
import { toolExecutor } from '../tools/ToolExecutor'

import type { ToolApprovalCallback, PathApprovalCallback } from '../agent/AgentLoop'
import type { ToolCall } from '../types'

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


const activeRuns = new Map<string, AgentLoop>()


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
      return false
    }

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

    return new Promise<boolean>((resolve) => {
      pendingPathApprovals.set(approvalId, { resolve })
    })
  }
}


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
        const timeoutId = setTimeout(() => controller.abort(), 120_000)

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


export function registerAgentIPC(getMainWindow: () => BrowserWindow | null): void {

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

      const onEvent = (event: AgentEvent) => {
        seqRef.seq = Math.max(seqRef.seq, event.seq + 1)
        try {
          mainWindow.webContents.send(`agent:event:${requestId}`, event)
        } catch {
        }
      }

      let approvalCallback: ToolApprovalCallback | undefined
      if (request.editApprovalMode === 'ask') {
        approvalCallback = createApprovalCallback(requestId, mainWindow, onEvent, seqRef)
      }

      const pathApprovalCallback = createPathApprovalCallback(requestId, mainWindow, onEvent, seqRef)

      const response = await agentLoop.run(request, onEvent, approvalCallback, pathApprovalCallback)

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
      await new Promise(resolve => setTimeout(resolve, 100))
      activeRuns.delete(requestId)
    }
  })

  ipcMain.handle('agent:respondToolApproval', (_event, approvalId: string, approved: boolean) => {
    const pending = pendingApprovals.get(approvalId)
    if (pending) {
      pending.resolve(approved)
      pendingApprovals.delete(approvalId)
      return { success: true }
    }
    return { success: false, error: 'No pending approval found' }
  })

  ipcMain.handle('agent:respondPathApproval', (_event, approvalId: string, approved: boolean) => {
    const pending = pendingPathApprovals.get(approvalId)
    if (pending) {
      pending.resolve(approved)
      pendingPathApprovals.delete(approvalId)
      return { success: true }
    }
    return { success: false, error: 'No pending path approval found' }
  })

  ipcMain.handle('agent:abort', (_event, requestId: string) => {
    const agentLoop = activeRuns.get(requestId)
    if (agentLoop) {
      agentLoop.abort()

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

  ipcMain.handle('agent:getTools', (_event, mode?: string) => {
    if (mode) {
      return toolRegistry.getToolsForMode(mode as 'builder' | 'planner' | 'chat')
    }
    return toolRegistry.getAll()
  })

  ipcMain.handle('agent:executeTool', async (_event, name: string, args: Record<string, any>, projectPath?: string) => {
    return toolExecutor.execute({ id: `manual-${Date.now()}`, name, arguments: args }, projectPath)
  })

  ipcMain.handle('agent:activeRuns', () => {
    return Array.from(activeRuns.keys())
  })

  ipcMain.handle('agent:httpRequest', async (_event, options: {
    url: string
    method: string
    headers?: Record<string, string>
    body?: string
  }) => {
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
