import { createPrivateKey, sign } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { getRuntimeEnv } from './runtime'

type GitHubConfiguration = {
  appId: string
  installationId: string
  privateKey: string
  owner: string
  repo: string
  branch: string
}

type GitHubTreeEntry = {
  path: string
  mode: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
}

export type RepositorySnapshot = {
  revision: string
  treeSha: string
  committedAt: string
  entries: GitHubTreeEntry[]
}

export type RepositoryFileChange = {
  path: string
  content: string
}

const requiredConfiguration = [
  'GITHUB_APP_ID',
  'GITHUB_APP_INSTALLATION_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_OWNER',
  'GITHUB_REPO',
  'GITHUB_BRANCH'
] as const

export const readGitHubConfiguration = (event?: H3Event): GitHubConfiguration | { missing: string[] } => {
  const env = getRuntimeEnv(event)
  const missing = requiredConfiguration.filter(key => !env[key]?.trim())
  if (missing.length) return { missing: [...missing] }

  return {
    appId: env.GITHUB_APP_ID!.trim(),
    installationId: env.GITHUB_APP_INSTALLATION_ID!.trim(),
    privateKey: env.GITHUB_APP_PRIVATE_KEY!.replaceAll('\\n', '\n').trim(),
    owner: env.GITHUB_OWNER!.trim(),
    repo: env.GITHUB_REPO!.trim(),
    branch: env.GITHUB_BRANCH!.trim()
  } satisfies GitHubConfiguration
}

const base64url = (value: string) => Buffer.from(value).toString('base64url')

const createAppJwt = (configuration: GitHubConfiguration) => {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + (9 * 60), iss: configuration.appId }))
  const unsigned = `${header}.${payload}`
  const key = createPrivateKey(configuration.privateKey)
  const signature = sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')
  return `${unsigned}.${signature}`
}

let cachedToken: { installationId: string, token: string, expiresAt: number } | undefined

const parseGitHubError = async (response: Response) => {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as { message?: string }
    return parsed.message || text
  } catch {
    return text || response.statusText
  }
}

const installationToken = async (configuration: GitHubConfiguration) => {
  if (cachedToken
    && cachedToken.installationId === configuration.installationId
    && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  const response = await fetch(`https://api.github.com/app/installations/${configuration.installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${createAppJwt(configuration)}`,
      'User-Agent': 'waynelens-cms',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  if (!response.ok) {
    throw createError({ statusCode: 502, message: `GitHub App authentication failed: ${await parseGitHubError(response)}` })
  }

  const result = await response.json() as { token: string, expires_at: string }
  cachedToken = {
    installationId: configuration.installationId,
    token: result.token,
    expiresAt: new Date(result.expires_at).getTime()
  }
  return result.token
}

const githubRequest = async <T>(
  configuration: GitHubConfiguration,
  path: string,
  options: { method?: string, body?: unknown } = {}
) => {
  const token = await installationToken(configuration)
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'waynelens-cms',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
  if (!response.ok) {
    const message = await parseGitHubError(response)
    const statusCode = response.status === 409 || response.status === 422 ? 409 : 502
    throw createError({ statusCode, message: `GitHub API ${response.status}: ${message}` })
  }
  return await response.json() as T
}

const configurationOrThrow = (event?: H3Event) => {
  const configuration = readGitHubConfiguration(event)
  if ('missing' in configuration) {
    throw createError({ statusCode: 503, message: `GitHub 尚未設定完成：${configuration.missing.join(', ')}` })
  }
  return configuration
}

export const getRepositorySnapshot = async (event?: H3Event): Promise<RepositorySnapshot> => {
  const configuration = configurationOrThrow(event)
  const prefix = `/repos/${configuration.owner}/${configuration.repo}`
  const reference = await githubRequest<{ object: { sha: string } }>(
    configuration,
    `${prefix}/git/ref/heads/${encodeURIComponent(configuration.branch)}`
  )
  const commit = await githubRequest<{ tree: { sha: string }, committer: { date: string } }>(
    configuration,
    `${prefix}/git/commits/${reference.object.sha}`
  )
  const tree = await githubRequest<{ tree: GitHubTreeEntry[], truncated: boolean }>(
    configuration,
    `${prefix}/git/trees/${commit.tree.sha}?recursive=1`
  )
  if (tree.truncated) throw createError({ statusCode: 502, message: 'GitHub repository tree is too large to read safely.' })

  return {
    revision: reference.object.sha,
    treeSha: commit.tree.sha,
    committedAt: commit.committer.date,
    entries: tree.tree
  }
}

export const readRepositoryBlob = async (event: H3Event | undefined, sha: string) => {
  const configuration = configurationOrThrow(event)
  const result = await githubRequest<{ content: string, encoding: string }>(
    configuration,
    `/repos/${configuration.owner}/${configuration.repo}/git/blobs/${sha}`
  )
  if (result.encoding !== 'base64') throw createError({ statusCode: 502, message: 'Unsupported GitHub blob encoding.' })
  return Buffer.from(result.content.replace(/\s/gu, ''), 'base64').toString('utf8')
}

export const commitRepositoryFiles = async (
  event: H3Event | undefined,
  changes: RepositoryFileChange[],
  expectedRevision: string,
  message: string
) => {
  const configuration = configurationOrThrow(event)
  const snapshot = await getRepositorySnapshot(event)
  if (!expectedRevision || snapshot.revision !== expectedRevision) {
    throw createError({ statusCode: 409, message: 'GitHub 內容已在其他地方更新，請重新載入後再儲存。' })
  }

  const prefix = `/repos/${configuration.owner}/${configuration.repo}`
  const treeEntries = await Promise.all(changes.map(async (change) => {
    const blob = await githubRequest<{ sha: string }>(configuration, `${prefix}/git/blobs`, {
      method: 'POST',
      body: { content: change.content, encoding: 'utf-8' }
    })
    return { path: change.path, mode: '100644', type: 'blob', sha: blob.sha }
  }))
  const tree = await githubRequest<{ sha: string }>(configuration, `${prefix}/git/trees`, {
    method: 'POST',
    body: { base_tree: snapshot.treeSha, tree: treeEntries }
  })
  const commit = await githubRequest<{ sha: string }>(configuration, `${prefix}/git/commits`, {
    method: 'POST',
    body: { message, tree: tree.sha, parents: [snapshot.revision] }
  })
  await githubRequest(configuration, `${prefix}/git/refs/heads/${encodeURIComponent(configuration.branch)}`, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false }
  })
  return commit.sha
}

export const inspectGitHubConnection = async (event?: H3Event) => {
  const configuration = readGitHubConfiguration(event)
  if ('missing' in configuration) return { configured: false, connected: false, missing: configuration.missing }

  try {
    const snapshot = await getRepositorySnapshot(event)
    return {
      configured: true,
      connected: true,
      repository: `${configuration.owner}/${configuration.repo}`,
      branch: configuration.branch,
      revision: snapshot.revision
    }
  } catch (error) {
    return {
      configured: true,
      connected: false,
      repository: `${configuration.owner}/${configuration.repo}`,
      branch: configuration.branch,
      error: error instanceof Error ? error.message : 'GitHub connection failed.'
    }
  }
}
