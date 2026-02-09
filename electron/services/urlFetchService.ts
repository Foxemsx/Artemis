import dns from 'dns'

export interface FetchResult {
  url: string
  title: string
  content: string
  contentLength: number
  truncated: boolean
  error?: string
}

const FETCH_TIMEOUT_MS = 20_000
const MAX_CONTENT_LENGTH = 16_000

const BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
]

function getRandomUserAgent(): string {
  return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)]
}

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

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'metadata.google.internal' || lower === 'metadata.google.com') return true
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    if (a === 127) return true
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 0) return true
  }
  if (hostname === '::1' || hostname === '[::1]') return true
  if (lower.startsWith('fe80:') || lower.startsWith('[fe80:')) return true
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true
  return false
}

function isPrivateIP(ip: string): boolean {
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    if (a === 127) return true
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 0) return true
  }
  if (ip === '::1' || ip === '::') return true
  const lowerIp = ip.toLowerCase()
  if (lowerIp.startsWith('fe80:')) return true
  if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return true
  return false
}

async function checkDNSRebinding(hostname: string): Promise<void> {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return
  if (hostname.includes(':')) return

  return new Promise((resolve, reject) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err) {
        dns.resolve6(hostname, (err6, addresses6) => {
          if (err6) {
            resolve()
            return
          }
          for (const addr of addresses6) {
            if (isPrivateIP(addr)) {
              reject(new Error(`SSRF blocked: ${hostname} resolves to private IPv6 address ${addr}`))
              return
            }
          }
          resolve()
        })
        return
      }
      for (const addr of addresses) {
        if (isPrivateIP(addr)) {
          reject(new Error(`SSRF blocked: ${hostname} resolves to private IP address ${addr}`))
          return
        }
      }
      resolve()
    })
  })
}

export async function fetchUrl(url: string): Promise<FetchResult> {
  if (!url || typeof url !== 'string') {
    return { url: url || '', title: '', content: '', contentLength: 0, truncated: false, error: 'Invalid URL' }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { url, title: '', content: '', contentLength: 0, truncated: false, error: 'Only HTTP/HTTPS URLs are supported' }
    }
  } catch {
    return { url, title: '', content: '', contentLength: 0, truncated: false, error: 'Invalid URL format' }
  }

  if (isPrivateHostname(parsed.hostname)) {
    return { url, title: '', content: '', contentLength: 0, truncated: false, error: 'Access denied: requests to private/internal addresses are blocked (SSRF protection)' }
  }

  try {
    await checkDNSRebinding(parsed.hostname)
  } catch (dnsErr: any) {
    return { url, title: '', content: '', contentLength: 0, truncated: false, error: dnsErr.message || 'SSRF protection: DNS check failed' }
  }

  try {
    const ua = getRandomUserAgent()
    const headers = buildBrowserHeaders(url, ua)
    let response = await tryFetch(url, headers, FETCH_TIMEOUT_MS)

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

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? decodeEntities(match[1].trim()) : ''
}

function htmlToReadableText(html: string): string {
  let text = html

  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '')
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '')
  text = text.replace(/<aside[\s\S]*?<\/aside>/gi, '')
  text = text.replace(/<!--[\s\S]*?-->/g, '')

  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi, '\n')
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n')
  text = text.replace(/<li[^>]*>/gi, '- ')

  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')

  text = text.replace(/<[^>]+>/g, '')

  text = decodeEntities(text)

  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.split('\n').map(l => l.trim()).join('\n')
  text = text.trim()

  return text
}

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
