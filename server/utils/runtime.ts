import type { H3Event } from 'h3'

export type CmsRuntimeEnv = {
  GITHUB_APP_ID?: string
  GITHUB_APP_INSTALLATION_ID?: string
  GITHUB_APP_PRIVATE_KEY?: string
  GITHUB_OWNER?: string
  GITHUB_REPO?: string
  GITHUB_BRANCH?: string
  R2_PUBLIC_BASE_URL?: string
  MEDIA_BUCKET?: {
    head(key: string): Promise<unknown | null>
    list(options?: { limit?: number }): Promise<{ objects: unknown[] }>
    put(key: string, value: ArrayBuffer | ArrayBufferView, options?: {
      httpMetadata?: { contentType?: string, cacheControl?: string }
      customMetadata?: Record<string, string>
    }): Promise<unknown>
  }
}

export const getRuntimeEnv = (event?: H3Event): CmsRuntimeEnv => {
  const cloudflare = event?.context.cloudflare as { env?: CmsRuntimeEnv } | undefined
  const bindings = cloudflare?.env || {}

  return {
    ...bindings,
    GITHUB_APP_ID: bindings.GITHUB_APP_ID || process.env.GITHUB_APP_ID,
    GITHUB_APP_INSTALLATION_ID: bindings.GITHUB_APP_INSTALLATION_ID || process.env.GITHUB_APP_INSTALLATION_ID,
    GITHUB_APP_PRIVATE_KEY: bindings.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY,
    GITHUB_OWNER: bindings.GITHUB_OWNER || process.env.GITHUB_OWNER,
    GITHUB_REPO: bindings.GITHUB_REPO || process.env.GITHUB_REPO,
    GITHUB_BRANCH: bindings.GITHUB_BRANCH || process.env.GITHUB_BRANCH,
    R2_PUBLIC_BASE_URL: bindings.R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL
  }
}
