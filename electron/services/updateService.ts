import { logError } from '../shared/logger'

const GITHUB_OWNER = 'Foxemsx'
const GITHUB_REPO = 'Artemis'
const GITHUB_API = 'https://api.github.com'

export interface GitHubRelease {
  tag_name: string
  name: string
  body: string
  published_at: string
  html_url: string
  prerelease: boolean
  draft: boolean
  assets: Array<{
    name: string
    browser_download_url: string
    size: number
    download_count: number
  }>
}

export interface GitHubCommit {
  sha: string
  commit: {
    message: string
    author: {
      name: string
      date: string
    }
  }
  html_url: string
}

export interface GitHubTag {
  name: string
  commit: {
    sha: string
  }
}

export interface ChangelogEntry {
  tag: string
  name: string
  body: string
  publishedAt: string
  htmlUrl: string
  prerelease: boolean
  commits: Array<{
    sha: string
    message: string
    author: string
    date: string
    htmlUrl: string
  }>
  assets: Array<{
    name: string
    downloadUrl: string
    size: number
    downloadCount: number
  }>
}

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  latestRelease: GitHubRelease | null
}

async function githubFetch(endpoint: string): Promise<{ ok: boolean; data: any }> {
  const url = `${GITHUB_API}${endpoint}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Artemis-IDE',
      },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    const text = await response.text()
    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {
      logError('updateService', 'Failed to parse GitHub response', { endpoint, status: response.status })
      return { ok: false, data: null }
    }

    if (!response.ok) {
      logError('updateService', 'GitHub API returned error', {
        endpoint,
        status: response.status,
        message: data?.message || response.statusText,
      })
    }

    return { ok: response.ok, data }
  } catch (err: any) {
    logError('updateService', 'GitHub API request failed', { error: err.message, endpoint })
    return { ok: false, data: null }
  }
}

export async function fetchReleases(): Promise<GitHubRelease[]> {
  const result = await githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=50`)
  if (!result.ok || !Array.isArray(result.data)) return []
  return result.data.filter((r: any) => !r.draft)
}

export async function fetchTags(): Promise<GitHubTag[]> {
  const result = await githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/tags?per_page=100`)
  if (!result.ok || !Array.isArray(result.data)) return []
  return result.data
}

export async function fetchCommitsBetween(baseSha: string, headSha: string): Promise<GitHubCommit[]> {
  const result = await githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${baseSha}...${headSha}`)
  if (!result.ok || !result.data?.commits) return []
  return result.data.commits
}

export async function fetchRecentCommits(perPage = 100): Promise<GitHubCommit[]> {
  const result = await githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=${perPage}`)
  if (!result.ok || !Array.isArray(result.data)) return []
  return result.data
}

export async function fetchChangelog(): Promise<ChangelogEntry[]> {
  const [releases, tags, allCommits] = await Promise.all([
    fetchReleases(),
    fetchTags(),
    fetchRecentCommits(100),
  ])

  const tagMap = new Map<string, string>()
  for (const tag of tags) {
    tagMap.set(tag.name, tag.commit.sha)
  }

  const changelog: ChangelogEntry[] = []

  for (let i = 0; i < releases.length; i++) {
    const release = releases[i]
    const currentSha = tagMap.get(release.tag_name)
    const previousRelease = releases[i + 1]
    const previousSha = previousRelease ? tagMap.get(previousRelease.tag_name) : null

    let commits: ChangelogEntry['commits'] = []

    if (currentSha && previousSha) {
      const betweenCommits = await fetchCommitsBetween(previousSha, currentSha)
      commits = betweenCommits.map(c => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author.name,
        date: c.commit.author.date,
        htmlUrl: c.html_url,
      }))
    } else if (currentSha) {
      // First release — get commits up to that tag
      const tagCommits = allCommits.filter(c => {
        const commitDate = new Date(c.commit.author.date).getTime()
        const releaseDate = new Date(release.published_at).getTime()
        return commitDate <= releaseDate
      })
      commits = tagCommits.slice(0, 50).map(c => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author.name,
        date: c.commit.author.date,
        htmlUrl: c.html_url,
      }))
    }

    changelog.push({
      tag: release.tag_name,
      name: release.name || release.tag_name,
      body: release.body || '',
      publishedAt: release.published_at,
      htmlUrl: release.html_url,
      prerelease: release.prerelease,
      commits,
      assets: release.assets.map(a => ({
        name: a.name,
        downloadUrl: a.browser_download_url,
        size: a.size,
        downloadCount: a.download_count,
      })),
    })
  }

  return changelog
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo> {
  const releases = await fetchReleases()
  if (releases.length === 0) {
    return { hasUpdate: false, currentVersion, latestVersion: currentVersion, latestRelease: null }
  }

  const latest = releases[0]
  const latestVersion = latest.tag_name.replace(/^v/, '')
  const current = currentVersion.replace(/^v/, '')

  const hasUpdate = compareVersions(latestVersion, current) > 0

  return {
    hasUpdate,
    currentVersion: current,
    latestVersion,
    latestRelease: hasUpdate ? latest : null,
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}
