import { createHash } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import type { CmsR2ConnectionStatus, CmsR2UploadedImage } from '~~/shared/types/cms'
import { getRuntimeEnv } from './runtime'

export const R2_UPLOAD_LIMITS = {
  files: 20,
  bytesPerFile: 50 * 1024 * 1024,
  totalBytes: 250 * 1024 * 1024
}

const imageTypes = {
  'image/jpeg': { extension: 'jpg', signatures: [[0xff, 0xd8, 0xff]] },
  'image/png': { extension: 'png', signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  'image/gif': { extension: 'gif', signatures: [[0x47, 0x49, 0x46, 0x38]] },
  'image/webp': { extension: 'webp', signatures: [[0x52, 0x49, 0x46, 0x46]] },
  'image/avif': { extension: 'avif', signatures: [] }
} as const

const hasSignature = (data: Uint8Array, signature: readonly number[]) => signature.every((byte, index) => data[index] === byte)
const sniffType = (data: Uint8Array, declared: string) => {
  if (declared === 'image/webp') {
    return hasSignature(data, imageTypes['image/webp'].signatures[0])
      && new TextDecoder().decode(data.slice(8, 12)) === 'WEBP'
  }
  if (declared === 'image/avif') {
    return new TextDecoder().decode(data.slice(4, 12)).includes('ftyp')
      && /avif|avis/u.test(new TextDecoder().decode(data.slice(8, 32)))
  }
  return imageTypes[declared as keyof typeof imageTypes]?.signatures.some(signature => hasSignature(data, signature)) || false
}

const safeStem = (fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/u, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
  return stem || 'image'
}

const publicBaseUrl = (event?: H3Event) => (getRuntimeEnv(event).R2_PUBLIC_BASE_URL || 'https://media.waynelens.dev').replace(/\/$/u, '')

export const inspectR2Connection = async (event?: H3Event): Promise<CmsR2ConnectionStatus> => {
  const env = getRuntimeEnv(event)
  if (!env.MEDIA_BUCKET) return { configured: false, connected: false, missing: ['MEDIA_BUCKET'] }
  try {
    await env.MEDIA_BUCKET.list({ limit: 1 })
    return { configured: true, connected: true, bucket: 'githubpage-media', publicBaseUrl: publicBaseUrl(event) }
  } catch (error) {
    return {
      configured: true,
      connected: false,
      bucket: 'githubpage-media',
      publicBaseUrl: publicBaseUrl(event),
      error: error instanceof Error ? error.message : 'R2 connection failed.'
    }
  }
}

export const validateR2Image = (input: { data: Uint8Array, fileName: string, contentType: string }) => {
  if (input.data.byteLength > R2_UPLOAD_LIMITS.bytesPerFile) {
    throw createError({ statusCode: 413, message: `${input.fileName} 超過 50 MB。` })
  }
  const definition = imageTypes[input.contentType as keyof typeof imageTypes]
  if (!definition || !sniffType(input.data, input.contentType)) {
    throw createError({ statusCode: 415, message: `${input.fileName} 不是有效的 JPEG、PNG、WebP、AVIF 或 GIF。` })
  }
  return definition
}

export const uploadR2Image = async (event: H3Event, input: {
  data: Uint8Array
  fileName: string
  contentType: string
  translationKey?: string
}): Promise<CmsR2UploadedImage> => {
  const env = getRuntimeEnv(event)
  if (!env.MEDIA_BUCKET) throw createError({ statusCode: 503, message: 'MEDIA_BUCKET 尚未綁定。' })
  const definition = validateR2Image(input)
  const sha256 = createHash('sha256').update(input.data).digest('hex')
  const folder = input.translationKey ? `articles/${input.translationKey}` : 'uploads'
  const key = `${folder}/${safeStem(input.fileName)}-${sha256.slice(0, 12)}.${definition.extension}`
  const existing = await env.MEDIA_BUCKET.head(key)
  if (!existing) {
    await env.MEDIA_BUCKET.put(key, input.data, {
      httpMetadata: { contentType: input.contentType, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { sha256, originalName: input.fileName }
    })
  }
  return {
    originalName: input.fileName,
    key,
    url: `${publicBaseUrl(event)}/${key.split('/').map(encodeURIComponent).join('/')}`,
    size: input.data.byteLength,
    contentType: input.contentType,
    sha256,
    reused: Boolean(existing)
  }
}
