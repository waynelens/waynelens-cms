export const CMS_LOCALES = ['zh-TW', 'en'] as const
export const CMS_STATUSES = ['draft', 'published', 'hidden'] as const

export type CmsLocale = typeof CMS_LOCALES[number]
export type CmsStatus = typeof CMS_STATUSES[number]

export type CmsSearchMetadata = Record<CmsLocale, string[]>

export type CmsArticleFrontmatter = {
  lang: CmsLocale
  translationKey: string
  status: CmsStatus
  title: string
  description: string
  date: string
  tags: string[]
  cover?: string
  carouselImages: string[]
  articleGalleryImages: string[]
  siteGalleryImages: string[]
}

export type CmsArticleDocument = {
  locale: CmsLocale
  fileName: string
  path: string
  revision: string
  modifiedAt: string
  frontmatter: CmsArticleFrontmatter
  body: string
}

export type CmsLocaleSummary = {
  locale: CmsLocale
  fileName: string
  path: string
  status: CmsStatus
  title: string
  date: string
  modifiedAt: string
}

export type CmsArticleGroupSummary = {
  translationKey: string
  locales: Partial<Record<CmsLocale, CmsLocaleSummary>>
  warnings: string[]
  modifiedAt: string
}

export type CmsArticleLibrary = {
  groups: CmsArticleGroupSummary[]
  repositoryRevision: string
}

export type CmsArticleGroup = {
  translationKey: string
  articles: Partial<Record<CmsLocale, CmsArticleDocument>>
  searchMetadata: CmsSearchMetadata
  searchMetadataRevision: string
  repositoryRevision: string
  warnings: string[]
}

export type CmsArticleSaveInput = {
  locale: CmsLocale
  fileName: string
  revision: string
  frontmatter: CmsArticleFrontmatter
  body: string
}

export type CmsSavePayload = {
  articles: CmsArticleSaveInput[]
  searchMetadata: CmsSearchMetadata
  searchMetadataRevision: string
  repositoryRevision: string
}

export type CmsCreatePayload = {
  date: string
  slug: string
  translationKey: string
  locales: CmsLocale[]
  repositoryRevision: string
}

export type CmsCreateLocalePayload = {
  locale: CmsLocale
  repositoryRevision: string
}

export type CmsMutationResult = {
  ok: true
  translationKey: string
  repositoryRevision: string
  warnings: string[]
}

export type CmsGitHubConnectionStatus = {
  configured: boolean
  connected: boolean
  repository?: string
  branch?: string
  revision?: string
  error?: string
  missing?: string[]
}

export type CmsValidationIssue = {
  level: 'error' | 'warning'
  field: string
  message: string
}

export type CmsR2ConnectionStatus = {
  configured: boolean
  connected: boolean
  bucket?: string
  publicBaseUrl?: string
  error?: string
  missing?: string[]
}

export type CmsR2UploadedImage = {
  originalName: string
  key: string
  url: string
  size: number
  contentType: string
  sha256: string
  reused: boolean
}

export type CmsR2UploadResult = {
  ok: true
  files: CmsR2UploadedImage[]
}
