import React from 'react'

interface IconProps {
  size?: number
  className?: string
}

export function OpenCodeIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" opacity="0.15" />
      <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AnthropicIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M13.827 3H16.5l5 18h-2.673l-5-18zM7.5 3L2.5 21h2.673l1.121-4.04h5.412L12.827 21H15.5L10.5 3H7.5zm.96 11.46L9.999 8.28l1.538 6.18H8.46z" fill="#D4A27F" />
    </svg>
  )
}

export function OpenAIIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.516 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872v.024zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66v.018zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681l-.004 6.722zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5-.005-2.999z" fill="#10A37F" />
    </svg>
  )
}

export function OpenRouterIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="#6366F1" strokeWidth="1.5" />
      <path d="M8 12h8M12 8v8" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" fill="#6366F1" opacity="0.3" />
    </svg>
  )
}

export function MoonshotIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" fill="#1A1A2E" opacity="0.1" />
      <path d="M15.5 6C13 6 10 9 10 12s3 6 5.5 6c-5 0-9.5-2.69-9.5-6S10.5 6 15.5 6z" fill="#3B82F6" />
    </svg>
  )
}

export function GoogleIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export function DeepSeekIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="10" fill="#4D6BFE" opacity="0.12" />
      <path d="M12 4C7.58 4 4 7.58 4 12s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14.4A6.4 6.4 0 1 1 18.4 12 6.41 6.41 0 0 1 12 18.4z" fill="#4D6BFE" />
      <path d="M14.5 9.5l-5 5M9.5 9.5l5 5" stroke="#4D6BFE" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function GroqIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#F55036" opacity="0.12" />
      <path d="M12 6v12M8 10l4-4 4 4M8 14l4 4 4-4" stroke="#F55036" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MistralIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="1" y="5" width="4" height="4" fill="#F7D046" />
      <rect x="1" y="10" width="4" height="4" fill="#F7D046" />
      <rect x="1" y="15" width="4" height="4" fill="#F7D046" />
      <rect x="19" y="5" width="4" height="4" fill="#F7D046" />
      <rect x="19" y="10" width="4" height="4" fill="#F7D046" />
      <rect x="19" y="15" width="4" height="4" fill="#F7D046" />
      <rect x="6" y="5" width="4" height="4" fill="#F2A73B" />
      <rect x="10" y="5" width="4" height="4" fill="#EF7D33" />
      <rect x="14" y="5" width="4" height="4" fill="#EE6B2D" />
      <rect x="10" y="10" width="4" height="4" fill="#EE6B2D" />
      <rect x="6" y="15" width="4" height="4" fill="#F2A73B" />
      <rect x="10" y="15" width="4" height="4" fill="#EF7D33" />
      <rect x="14" y="15" width="4" height="4" fill="#EE6B2D" />
    </svg>
  )
}

export function PerplexityIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="#20B8CD" strokeWidth="1.5" fill="#20B8CD" fillOpacity="0.08" />
      <path d="M12 2v20M4 7l8 5 8-5M4 17l8-5 8 5" stroke="#20B8CD" strokeWidth="1.5" />
    </svg>
  )
}

export function OllamaIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <ellipse cx="12" cy="13" rx="8" ry="7" fill="#FFFFFF" fillOpacity="0.1" stroke="#E5E7EB" strokeWidth="1.5" />
      <circle cx="9.5" cy="11.5" r="1.2" fill="#374151" />
      <circle cx="14.5" cy="11.5" r="1.2" fill="#374151" />
      <path d="M9.5 15.5c0 0 1.2 1.5 2.5 1.5s2.5-1.5 2.5-1.5" stroke="#374151" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 6c0-2.5 2-4 4-4s4 1.5 4 4" stroke="#E5E7EB" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function SyntheticIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#06B6D4" opacity="0.12" />
      <path d="M16 8.5c0 0-1.5-1.5-4-1.5S8 8.5 8 8.5" stroke="#06B6D4" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 15.5c0 0 1.5 1.5 4 1.5s4-1.5 4-1.5" stroke="#06B6D4" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 12h10" stroke="#06B6D4" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ZAIIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#8B5CF6" opacity="0.12" />
      <path d="M7 8h10L7 16h10" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const PROVIDER_ICON_MAP: Record<string, React.FC<IconProps>> = {
  zen: OpenCodeIcon,
  zai: ZAIIcon,
  anthropic: AnthropicIcon,
  openai: OpenAIIcon,
  openrouter: OpenRouterIcon,
  moonshot: MoonshotIcon,
  google: GoogleIcon,
  deepseek: DeepSeekIcon,
  groq: GroqIcon,
  mistral: MistralIcon,
  perplexity: PerplexityIcon,
  synthetic: SyntheticIcon,
  ollama: OllamaIcon,
}

export function getProviderIcon(providerId: string): React.FC<IconProps> {
  return PROVIDER_ICON_MAP[providerId] || OpenCodeIcon
}
