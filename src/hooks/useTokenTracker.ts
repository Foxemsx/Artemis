import { useState, useCallback } from 'react'
import type { SessionTokenUsage } from '../types'
import { MODEL_METADATA } from '../lib/zenClient'

const EMPTY_USAGE: SessionTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 }

export interface TokenTrackerReturn {
  sessionTokenUsage: SessionTokenUsage
  totalTokenUsage: SessionTokenUsage
  allSessionTokenUsage: Map<string, SessionTokenUsage>
  setAllSessionTokenUsage: React.Dispatch<React.SetStateAction<Map<string, SessionTokenUsage>>>
  trackUsage: (sessionId: string, modelId: string, inputChars: number, outputChars: number) => void
  restoreSessionUsage: (sessionId: string) => Promise<void>
}

export function useTokenTracker(activeSessionId: string | null): TokenTrackerReturn {
  const [allSessionTokenUsage, setAllSessionTokenUsage] = useState<Map<string, SessionTokenUsage>>(new Map())
  const [totalTokenUsage, setTotalTokenUsage] = useState<SessionTokenUsage>(EMPTY_USAGE)

  const sessionTokenUsage = (activeSessionId ? allSessionTokenUsage.get(activeSessionId) : null) || EMPTY_USAGE

  const trackUsage = useCallback((sessionId: string, modelId: string, inputChars: number, outputChars: number) => {
    const estPromptTokens = Math.ceil(inputChars / 4)
    const estCompletionTokens = Math.ceil(outputChars / 4)
    const estTotalTokens = estPromptTokens + estCompletionTokens
    const meta = MODEL_METADATA[modelId]
    let estCost = 0
    if (meta?.pricing) {
      estCost = (estPromptTokens / 1_000_000) * meta.pricing.input
              + (estCompletionTokens / 1_000_000) * meta.pricing.output
    }

    setAllSessionTokenUsage(prev => {
      const current = prev.get(sessionId) || EMPTY_USAGE
      const updated = {
        promptTokens: current.promptTokens + estPromptTokens,
        completionTokens: current.completionTokens + estCompletionTokens,
        totalTokens: current.totalTokens + estTotalTokens,
        estimatedCost: current.estimatedCost + estCost,
      }
      window.artemis.store.set(`tokenUsage-${sessionId}`, updated).catch(() => {})
      return new Map(prev).set(sessionId, updated)
    })
    setTotalTokenUsage(prev => ({
      promptTokens: prev.promptTokens + estPromptTokens,
      completionTokens: prev.completionTokens + estCompletionTokens,
      totalTokens: prev.totalTokens + estTotalTokens,
      estimatedCost: prev.estimatedCost + estCost,
    }))
  }, [])

  const restoreSessionUsage = useCallback(async (sessionId: string) => {
    try {
      const savedUsage = await window.artemis.store.get(`tokenUsage-${sessionId}`)
      if (savedUsage) {
        setAllSessionTokenUsage(prev => new Map(prev).set(sessionId, savedUsage as SessionTokenUsage))
      }
    } catch {}
  }, [])

  return {
    sessionTokenUsage,
    totalTokenUsage,
    allSessionTokenUsage,
    setAllSessionTokenUsage,
    trackUsage,
    restoreSessionUsage,
  }
}
