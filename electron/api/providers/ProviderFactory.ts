/**
 * ProviderFactory — Creates the correct adapter for any model/provider combo.
 * 
 * The agent loop calls getAdapter() and gets back a BaseProvider instance
 * that knows how to format requests/responses for that specific API format.
 * The agent loop never needs to know which format is being used.
 */

import type { EndpointFormat, ModelConfig, ProviderConfig } from '../types'
import { BaseProvider } from './BaseProvider'
import { OpenAIChatAdapter } from './adapters/OpenAIChatAdapter'
import { AnthropicAdapter } from './adapters/AnthropicAdapter'
import { OpenAIResponsesAdapter } from './adapters/OpenAIResponsesAdapter'

// ─── Singleton Adapter Instances ─────────────────────────────────────────────

const adapters: Record<EndpointFormat, BaseProvider> = {
  'openai-chat': new OpenAIChatAdapter(),
  'openai-responses': new OpenAIResponsesAdapter(),
  'anthropic-messages': new AnthropicAdapter(),
}

// ─── Model → Endpoint Format Mapping ─────────────────────────────────────────
// This maps known model ID prefixes/exact IDs to their required API format.
// Models not listed here use the provider's defaultFormat.

const MODEL_FORMAT_MAP: Record<string, EndpointFormat> = {
  // OpenAI models → Responses API
  'gpt-5.2': 'openai-responses',
  'gpt-5.2-codex': 'openai-responses',
  'gpt-5.1': 'openai-responses',
  'gpt-5.1-codex': 'openai-responses',
  'gpt-5.1-codex-max': 'openai-responses',
  'gpt-5.1-codex-mini': 'openai-responses',
  'gpt-5': 'openai-responses',
  'gpt-5-codex': 'openai-responses',
  'gpt-5-nano': 'openai-responses',

  // Anthropic models → Messages API
  'claude-opus-4-6': 'anthropic-messages',
  'claude-opus-4-5': 'anthropic-messages',
  'claude-opus-4-1': 'anthropic-messages',
  'claude-sonnet-4-5': 'anthropic-messages',
  'claude-sonnet-4': 'anthropic-messages',
  'claude-haiku-4-5': 'anthropic-messages',
  'claude-3-5-haiku': 'anthropic-messages',

  // MiniMax free → Messages API
  'minimax-m2.1-free': 'anthropic-messages',

  // Everything else defaults to provider's defaultFormat (usually openai-chat)
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export class ProviderFactory {
  /**
   * Get the correct adapter for a model + provider combination.
   * The adapter handles all format conversion transparently.
   */
  static getAdapter(model: ModelConfig, provider: ProviderConfig): BaseProvider {
    const format = ProviderFactory.resolveFormat(model, provider)
    return adapters[format]
  }

  /**
   * Determine which endpoint format to use for a given model + provider.
   * Priority: model.endpointFormat > MODEL_FORMAT_MAP > provider.defaultFormat
   */
  static resolveFormat(model: ModelConfig, provider: ProviderConfig): EndpointFormat {
    // 1. Explicit model override (set by caller)
    if (model.endpointFormat) {
      return model.endpointFormat
    }

    // 2. Known model mapping
    if (MODEL_FORMAT_MAP[model.id]) {
      return MODEL_FORMAT_MAP[model.id]
    }

    // 3. Provider default
    return provider.defaultFormat
  }

  /**
   * Register a new endpoint format mapping for a model ID.
   * Useful for adding new models at runtime.
   */
  static registerModelFormat(modelId: string, format: EndpointFormat): void {
    MODEL_FORMAT_MAP[modelId] = format
  }

  /**
   * Register a custom adapter for a new endpoint format.
   */
  static registerAdapter(format: string, adapter: BaseProvider): void {
    (adapters as any)[format] = adapter
  }

  /**
   * Get all available endpoint formats.
   */
  static getAvailableFormats(): EndpointFormat[] {
    return Object.keys(adapters) as EndpointFormat[]
  }
}
