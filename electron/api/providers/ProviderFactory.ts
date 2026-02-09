import type { EndpointFormat, ModelConfig, ProviderConfig } from '../types'
import { BaseProvider } from './BaseProvider'
import { OpenAIChatAdapter } from './adapters/OpenAIChatAdapter'
import { AnthropicAdapter } from './adapters/AnthropicAdapter'
import { OpenAIResponsesAdapter } from './adapters/OpenAIResponsesAdapter'

const adapters: Record<EndpointFormat, BaseProvider> = {
  'openai-chat': new OpenAIChatAdapter(),
  'openai-responses': new OpenAIResponsesAdapter(),
  'anthropic-messages': new AnthropicAdapter(),
}

const MODEL_FORMAT_MAP: Record<string, EndpointFormat> = {
  'gpt-5.2': 'openai-responses',
  'gpt-5.2-codex': 'openai-responses',
  'gpt-5.1': 'openai-responses',
  'gpt-5.1-codex': 'openai-responses',
  'gpt-5.1-codex-max': 'openai-responses',
  'gpt-5.1-codex-mini': 'openai-responses',
  'gpt-5': 'openai-responses',
  'gpt-5-codex': 'openai-responses',
  'gpt-5-nano': 'openai-responses',

  'claude-opus-4-6': 'anthropic-messages',
  'claude-opus-4-5': 'anthropic-messages',
  'claude-opus-4-1': 'anthropic-messages',
  'claude-sonnet-4-5': 'anthropic-messages',
  'claude-sonnet-4': 'anthropic-messages',
  'claude-haiku-4-5': 'anthropic-messages',
  'claude-3-5-haiku': 'anthropic-messages',

  'claude-sonnet-4-5-20250514': 'anthropic-messages',
  'claude-opus-4-0-20250514': 'anthropic-messages',
  'claude-haiku-3-5-20241022': 'anthropic-messages',

  'minimax-m2.1-free': 'anthropic-messages',

}

export class ProviderFactory {
  static getAdapter(model: ModelConfig, provider: ProviderConfig): BaseProvider {
    const format = ProviderFactory.resolveFormat(model, provider)
    return adapters[format]
  }

  static resolveFormat(model: ModelConfig, provider: ProviderConfig): EndpointFormat {
    if (model.endpointFormat) {
      return model.endpointFormat
    }

    if (MODEL_FORMAT_MAP[model.id]) {
      return MODEL_FORMAT_MAP[model.id]
    }

    return provider.defaultFormat
  }

  static registerModelFormat(modelId: string, format: EndpointFormat): void {
    MODEL_FORMAT_MAP[modelId] = format
  }

  static registerAdapter(format: string, adapter: BaseProvider): void {
    (adapters as any)[format] = adapter
  }

  static getAvailableFormats(): EndpointFormat[] {
    return Object.keys(adapters) as EndpointFormat[]
  }
}
