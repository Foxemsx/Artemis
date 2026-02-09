export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResponse {
  query: string
  results: SearchResult[]
  error?: string
}

const DDG_URL = 'https://html.duckduckgo.com/html/'
const MAX_RESULTS = 5
const FETCH_TIMEOUT_MS = 10_000

export async function webSearch(query: string): Promise<WebSearchResponse> {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { query, results: [], error: 'Empty search query' }
  }

  const trimmedQuery = query.trim().slice(0, 500)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const params = new URLSearchParams({ q: trimmedQuery, kl: '' })
    const response = await fetch(DDG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://duckduckgo.com/',
      },
      body: params.toString(),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return { query: trimmedQuery, results: [], error: `Search failed: HTTP ${response.status}` }
    }

    const html = await response.text()
    const results = parseHTMLResults(html, MAX_RESULTS)

    return { query: trimmedQuery, results }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { query: trimmedQuery, results: [], error: 'Search request timed out' }
    }
    return { query: trimmedQuery, results: [], error: `Search failed: ${err.message}` }
  }
}

function parseHTMLResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []

  const resultBlocks = html.split('class="result__body"')

  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i]

    const urlMatch = block.match(/class="result__a"[^>]*href="([^"]*)"/)
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]*)/)
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)

    if (urlMatch && titleMatch) {
      let url = urlMatch[1]
      const uddgMatch = url.match(/uddg=([^&]+)/)
      if (uddgMatch) {
        url = decodeURIComponent(uddgMatch[1])
      }

      const title = decodeHTMLEntities(titleMatch[1].trim())
      const snippet = snippetMatch
        ? decodeHTMLEntities(snippetMatch[1].replace(/<[^>]*>/g, '').trim())
        : ''

      if (title && url) {
        results.push({ title, url, snippet })
      }
    }
  }

  return results
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<b>/g, '')
    .replace(/<\/b>/g, '')
}

export function formatSearchForAgent(response: WebSearchResponse): string {
  if (response.error) {
    return `Web search error: ${response.error}`
  }
  if (response.results.length === 0) {
    return `No results found for "${response.query}".`
  }

  const lines = [`Web search results for "${response.query}":\n`]
  for (let i = 0; i < response.results.length; i++) {
    const r = response.results[i]
    lines.push(`${i + 1}. **${r.title}**`)
    lines.push(`   URL: ${r.url}`)
    if (r.snippet) {
      lines.push(`   ${r.snippet}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
