/**
 * URL Fetch Service — Fetch and summarize web page content for agent context.
 * 
 * When the agent's fetch_url tool needs to read a web page,
 * this service fetches the content, strips HTML to readable text, and
 * returns a truncated summary suitable for LLM context injection.
 * 
 * Privacy-first: No tracking, no API keys, direct fetch only.
 */

export interface FetchResult {
  url: string
  title: string
  content: string
  contentLength: number
  truncated: boolean
  error?: string
}

const FETCH_TIMEOUT_MS = 20_000
const MAX_CONTENT_LENGTH = 16_000  // ~4k tokens for agent context

// Realistic browser User-Agents — rotated to avoid fingerprinting blocks.
// This is what Cursor, Windsurf, and similar tools do from their main process.
const BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
]

function getRandomUserAgent(): string {
  return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)]
}

/**
 * Build realistic browser-like headers for a given URL.
 * Sites like Alza, Amazon, Cloudflare-protected sites check multiple headers.
 */
function buildBrowserHeaders(url: string, userAgent: string): Record<string, string> {
  const parsed = new URL(url)
  return {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Referer': `${parsed.protocol}//${parsed.hostname}/`,
  }
}

/**
 * Attempt to fetch a URL with a given strategy. Returns the Response or null.
 */
async function tryFetch(url: string, headers: Record<string, string>, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeout)
    return response
  } catch {
    clearTimeout(timeout)
    return null
  }
}

/**
 * Fetch a URL and extract readable text content.
 * Uses multiple strategies to bypass common 403/bot-protection:
 * 1. Full browser-like headers (works for most sites)
 * 2. Retry with different User-Agent on 403
 * 3. Fall back to Google Cache / reader-mode URL patterns
 */
export async function fetchUrl(url: string): Promise<FetchResult> {
  if (!url || typeof url !== 'string') {
    return { url: url || '', title: '', content: '', contentLength: 0, truncated: false, error: 'Invalid URL' }
  }

  // Validate URL format
  let parsed: URL
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { url, title: '', content: '', contentLength: 0, truncated: false, error: 'Only HTTP/HTTPS URLs are supported' }
    }
  } catch {
    return { url, title: '', content: '', contentLength: 0, truncated: false, error: 'Invalid URL format' }
  }

  try {
    // Strategy 1: Full browser-like headers
    const ua = getRandomUserAgent()
    const headers = buildBrowserHeaders(url, ua)
    let response = await tryFetch(url, headers, FETCH_TIMEOUT_MS)

    // Strategy 2: On 403, retry with a different UA and minimal Sec-Fetch headers
    if (response && response.status === 403) {
      const altUa = BROWSER_USER_AGENTS.find(u => u !== ua) || ua
      const retryHeaders: Record<string, string> = {
        'User-Agent': altUa,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
      const retryResponse = await tryFetch(url, retryHeaders, FETCH_TIMEOUT_MS)
      if (retryResponse && retryResponse.ok) {
        response = retryResponse
      }
    }

    // Strategy 3: On 403, try Google webcache as last resort
    if (response && response.status === 403) {
      const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`
      const cacheHeaders = buildBrowserHeaders(cacheUrl, ua)
      const cacheResponse = await tryFetch(cacheUrl, cacheHeaders, FETCH_TIMEOUT_MS)
      if (cacheResponse && cacheResponse.ok) {
        response = cacheResponse
      }
    }

    if (!response) {
      return { url, title: '', content: '', contentLength: 0, truncated: false, error: 'Failed to connect to the server' }
    }

    if (!response.ok) {
      return { url, title: '', content: '', contentLength: 0, truncated: false, error: `HTTP ${response.status} ${response.statusText}` }
    }

    const contentType = response.headers.get('content-type') || ''
    const rawText = await response.text()

    // Handle JSON responses
    if (contentType.includes('application/json')) {
      let pretty: string
      try {
        pretty = JSON.stringify(JSON.parse(rawText), null, 2)
      } catch {
        pretty = rawText
      }
      const truncated = pretty.length > MAX_CONTENT_LENGTH
      return {
        url,
        title: `JSON: ${parsed.hostname}${parsed.pathname}`,
        content: truncated ? pretty.slice(0, MAX_CONTENT_LENGTH) + '\n\n[...truncated]' : pretty,
        contentLength: pretty.length,
        truncated,
      }
    }

    // Handle plain text
    if (contentType.includes('text/plain')) {
      const truncated = rawText.length > MAX_CONTENT_LENGTH
      return {
        url,
        title: `${parsed.hostname}${parsed.pathname}`,
        content: truncated ? rawText.slice(0, MAX_CONTENT_LENGTH) + '\n\n[...truncated]' : rawText,
        contentLength: rawText.length,
        truncated,
      }
    }

    // Handle HTML — extract readable text
    const title = extractTitle(rawText) || `${parsed.hostname}${parsed.pathname}`
    const readable = htmlToReadableText(rawText)
    const truncated = readable.length > MAX_CONTENT_LENGTH

    return {
      url,
      title,
      content: truncated ? readable.slice(0, MAX_CONTENT_LENGTH) + '\n\n[...truncated]' : readable,
      contentLength: readable.length,
      truncated,
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { url, title: '', content: '', contentLength: 0, truncated: false, error: 'Request timed out' }
    }
    return { url, title: '', content: '', contentLength: 0, truncated: false, error: `Fetch failed: ${err.message}` }
  }
}

/**
 * Extract <title> from HTML.
 */
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? decodeEntities(match[1].trim()) : ''
}

/**
 * Convert HTML to readable plain text.
 * Strips tags, scripts, styles, and normalizes whitespace.
 */
function htmlToReadableText(html: string): string {
  let text = html

  // Remove scripts, styles, nav, footer, header, aside
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '')
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '')
  text = text.replace(/<aside[\s\S]*?<\/aside>/gi, '')
  text = text.replace(/<!--[\s\S]*?-->/g, '')

  // Convert block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi, '\n')
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n')
  text = text.replace(/<li[^>]*>/gi, '- ')

  // Convert headings to markdown-style
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode entities
  text = decodeEntities(text)

  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.split('\n').map(l => l.trim()).join('\n')
  text = text.trim()

  return text
}

/**
 * Decode HTML entities.
 */
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(parseInt(code, 16)))
}

/**
 * Format fetch result for agent context injection.
 */
export function formatFetchForAgent(result: FetchResult): string {
  if (result.error) {
    return `Failed to fetch ${result.url}: ${result.error}`
  }

  const lines = [
    `Fetched content from: ${result.url}`,
    `Title: ${result.title}`,
    `Content length: ${result.contentLength} chars${result.truncated ? ' (truncated)' : ''}`,
    '',
    '---',
    result.content,
    '---',
  ]

  return lines.join('\n')
}
