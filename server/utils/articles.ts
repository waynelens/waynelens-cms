import { basename } from 'node:path'
import { createError, type H3Event } from 'h3'
import { parseDocument, stringify } from 'yaml'
import { z } from 'zod'
import type {
  CmsArticleDocument,
  CmsArticleFrontmatter,
  CmsArticleGroup,
  CmsArticleGroupSummary,
  CmsArticleLibrary,
  CmsArticleSaveInput,
  CmsCreateLocalePayload,
  CmsCreatePayload,
  CmsLocale,
  CmsMutationResult,
  CmsSavePayload,
  CmsSearchMetadata
} from '~~/shared/types/cms'
import { commitRepositoryFiles, getRepositorySnapshot, readRepositoryBlob, type RepositorySnapshot } from './github'
import { parseSearchMetadata, renderSearchMetadata } from './search-metadata'

const ARTICLE_DIRECTORIES: Record<CmsLocale, string> = {
  'zh-TW': 'content/blog/zh-TW',
  en: 'content/blog/en'
}
const ARTICLE_ROUTE_LOCALES: Record<CmsLocale, string> = { 'zh-TW': 'zh-tw', en: 'en' }
const SEARCH_METADATA_PATH = 'data/searchMetadata.ts'
const frontmatterPattern = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u
const fileNamePattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

const frontmatterSchema = z.object({
  lang: z.enum(['zh-TW', 'en']),
  translationKey: z.string().regex(slugPattern),
  status: z.enum(['draft', 'published', 'hidden']),
  title: z.string(),
  description: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  tags: z.array(z.string()).default([]),
  cover: z.string().optional(),
  carouselImages: z.array(z.string()).default([]),
  articleGalleryImages: z.array(z.string()).default([]),
  siteGalleryImages: z.array(z.string()).default([])
})
const repositoryRevision = z.string().regex(/^[a-f0-9]{40}$/u)
const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  slug: z.string().regex(slugPattern),
  translationKey: z.string().regex(slugPattern),
  locales: z.array(z.enum(['zh-TW', 'en'])).min(1),
  repositoryRevision
})
const createLocaleSchema = z.object({ locale: z.enum(['zh-TW', 'en']), repositoryRevision })
const saveSchema = z.object({
  articles: z.array(z.object({
    locale: z.enum(['zh-TW', 'en']),
    fileName: z.string().regex(fileNamePattern),
    revision: z.string().regex(/^[a-f0-9]{40}$/u),
    frontmatter: frontmatterSchema,
    body: z.string()
  })).min(1),
  searchMetadata: z.object({ en: z.array(z.string()), 'zh-TW': z.array(z.string()) }),
  searchMetadataRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  repositoryRevision
})

type LoadedRepository = {
  snapshot: RepositorySnapshot
  articles: CmsArticleDocument[]
  articleContents: Map<string, string>
  metadataContent: string
  metadataRevision: string
  metadata: Record<string, CmsSearchMetadata>
}

const parseInput = <Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> => {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  throw createError({
    statusCode: 400,
    message: result.error.issues.map(issue => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('；')
  })
}
const normalizeList = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]
const articleRepositoryPath = (locale: CmsLocale, fileName: string) => {
  if (!fileNamePattern.test(fileName) || basename(fileName) !== fileName) {
    throw createError({ statusCode: 400, message: 'Invalid article filename.' })
  }
  return `${ARTICLE_DIRECTORIES[locale]}/${fileName}`
}

const parseMarkdown = (
  content: string,
  locale: CmsLocale,
  fileName: string,
  revision: string,
  modifiedAt: string
): CmsArticleDocument => {
  const match = content.match(frontmatterPattern)
  if (!match) throw new Error(`Missing frontmatter in ${fileName}`)
  const document = parseDocument(match[1]!)
  if (document.errors.length) throw new Error(`Invalid YAML in ${fileName}: ${document.errors[0]?.message}`)
  const frontmatter = frontmatterSchema.parse(document.toJS())
  if (frontmatter.lang !== locale) throw new Error(`Language mismatch in ${fileName}`)
  return {
    locale,
    fileName,
    path: `/blog/${ARTICLE_ROUTE_LOCALES[locale]}/${fileName.replace(/\.md$/u, '')}`,
    revision,
    modifiedAt,
    frontmatter,
    body: content.slice(match[0].length)
  }
}

const loadRepository = async (event?: H3Event): Promise<LoadedRepository> => {
  const snapshot = await getRepositorySnapshot(event)
  const articleEntries = snapshot.entries.filter(entry => entry.type === 'blob'
    && (entry.path.startsWith(`${ARTICLE_DIRECTORIES.en}/`) || entry.path.startsWith(`${ARTICLE_DIRECTORIES['zh-TW']}/`))
    && entry.path.endsWith('.md'))
  const metadataEntry = snapshot.entries.find(entry => entry.type === 'blob' && entry.path === SEARCH_METADATA_PATH)
  if (!metadataEntry) throw createError({ statusCode: 502, message: `${SEARCH_METADATA_PATH} does not exist.` })

  const [articleFiles, metadataContent] = await Promise.all([
    Promise.all(articleEntries.map(async (entry) => ({ entry, content: await readRepositoryBlob(event, entry.sha) }))),
    readRepositoryBlob(event, metadataEntry.sha)
  ])
  const articleContents = new Map<string, string>()
  const articles = articleFiles.map(({ entry, content }) => {
    articleContents.set(entry.path, content)
    const locale: CmsLocale = entry.path.startsWith(`${ARTICLE_DIRECTORIES['zh-TW']}/`) ? 'zh-TW' : 'en'
    return parseMarkdown(content, locale, entry.path.split('/').pop()!, entry.sha, snapshot.committedAt)
  })
  return {
    snapshot,
    articles,
    articleContents,
    metadataContent,
    metadataRevision: metadataEntry.sha,
    metadata: parseSearchMetadata(metadataContent)
  }
}

const assertCurrentRevision = (loaded: LoadedRepository, expected: string) => {
  if (loaded.snapshot.revision !== expected) {
    throw createError({ statusCode: 409, message: 'GitHub 內容已更新，請重新載入後再繼續。' })
  }
}

const articleWarnings = (article: CmsArticleDocument, metadata: CmsSearchMetadata) => {
  const warnings: string[] = []
  if (!article.frontmatter.title.trim()) warnings.push(`${article.locale}: 標題不可空白`)
  if (!article.frontmatter.description.trim()) warnings.push(`${article.locale}: Description 不可空白`)
  if (!article.body.trim()) warnings.push(`${article.locale}: 正文目前是空白的`)
  if (!article.frontmatter.cover) warnings.push(`${article.locale}: 尚未設定封面圖片`)
  if (article.frontmatter.status === 'published' && (!metadata.en.length || !metadata['zh-TW'].length)) {
    warnings.push(`${article.locale}: 公開文章應具備中英文搜尋詞`)
  }
  return warnings
}

const updateMarkdown = (current: string, article: CmsArticleSaveInput) => {
  const match = current.match(frontmatterPattern)
  if (!match) throw createError({ statusCode: 400, message: `Missing frontmatter in ${article.fileName}` })
  const document = parseDocument(match[1]!)
  const fields: Array<keyof CmsArticleFrontmatter> = [
    'lang', 'translationKey', 'status', 'title', 'description', 'date', 'tags', 'cover',
    'carouselImages', 'articleGalleryImages', 'siteGalleryImages'
  ]
  for (const field of fields) {
    const value = article.frontmatter[field]
    if (field === 'cover' && !value) document.delete(field)
    else document.set(field, value)
  }
  const body = article.body.startsWith('\n') ? article.body : `\n${article.body}`
  return `---\n${document.toString({ lineWidth: 0 }).trimEnd()}\n---\n${body}`
}

const buildLibrary = (loaded: LoadedRepository): CmsArticleGroupSummary[] => {
  const groups = new Map<string, CmsArticleGroupSummary>()
  for (const article of loaded.articles) {
    const key = article.frontmatter.translationKey
    const group = groups.get(key) || { translationKey: key, locales: {}, warnings: [], modifiedAt: article.modifiedAt }
    group.locales[article.locale] = {
      locale: article.locale,
      fileName: article.fileName,
      path: article.path,
      status: article.frontmatter.status,
      title: article.frontmatter.title,
      date: article.frontmatter.date,
      modifiedAt: article.modifiedAt
    }
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    if (!group.locales['zh-TW']) group.warnings.push('缺少中文版')
    if (!group.locales.en) group.warnings.push('缺少英文版')
  }
  return [...groups.values()].sort((a, b) => {
    const aDate = a.locales['zh-TW']?.date || a.locales.en?.date || ''
    const bDate = b.locales['zh-TW']?.date || b.locales.en?.date || ''
    return bDate.localeCompare(aDate)
  })
}

export const listCmsArticleGroups = async (event?: H3Event): Promise<CmsArticleLibrary> => {
  const loaded = await loadRepository(event)
  return { groups: buildLibrary(loaded), repositoryRevision: loaded.snapshot.revision }
}

export const getCmsArticleGroup = async (event: H3Event | undefined, translationKey: string): Promise<CmsArticleGroup> => {
  if (!slugPattern.test(translationKey)) throw createError({ statusCode: 400, message: 'Invalid translationKey.' })
  const loaded = await loadRepository(event)
  const matching = loaded.articles.filter(article => article.frontmatter.translationKey === translationKey)
  if (!matching.length) throw createError({ statusCode: 404, message: 'Article not found.' })
  const metadata = loaded.metadata[translationKey] || { en: [], 'zh-TW': [] }
  const articles: CmsArticleGroup['articles'] = {}
  const warnings: string[] = []
  for (const article of matching) {
    articles[article.locale] = article
    warnings.push(...articleWarnings(article, metadata))
  }
  if (!articles['zh-TW']) warnings.push('缺少中文版')
  if (!articles.en) warnings.push('缺少英文版')
  return {
    translationKey,
    articles,
    searchMetadata: metadata,
    searchMetadataRevision: loaded.metadataRevision,
    repositoryRevision: loaded.snapshot.revision,
    warnings
  }
}

export const createCmsArticleGroup = async (event: H3Event | undefined, input: CmsCreatePayload): Promise<CmsMutationResult> => {
  const payload = parseInput(createSchema, input)
  const loaded = await loadRepository(event)
  assertCurrentRevision(loaded, payload.repositoryRevision)
  const fileName = `${payload.date}-${payload.slug}.md`
  const changes: Array<{ path: string, content: string }> = []
  for (const locale of [...new Set(payload.locales)] as CmsLocale[]) {
    const path = articleRepositoryPath(locale, fileName)
    if (loaded.articleContents.has(path)) throw createError({ statusCode: 409, message: `${fileName} already exists.` })
    const frontmatter: CmsArticleFrontmatter = {
      lang: locale,
      translationKey: payload.translationKey,
      status: 'draft',
      title: locale === 'zh-TW' ? '未命名草稿' : 'Untitled Draft',
      description: locale === 'zh-TW' ? '請填寫文章簡介。' : 'Add an article description.',
      date: payload.date,
      tags: [],
      carouselImages: [],
      articleGalleryImages: [],
      siteGalleryImages: []
    }
    const body = locale === 'zh-TW' ? '在這裡撰寫文章正文。' : 'Write the article here.'
    changes.push({ path, content: `---\n${stringify(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n\n${body}\n` })
  }
  loaded.metadata[payload.translationKey] ||= {
    en: [payload.date],
    'zh-TW': [payload.date, `${payload.date.slice(0, 4)}年${Number(payload.date.slice(5, 7))}月${Number(payload.date.slice(8, 10))}日`]
  }
  changes.push({ path: SEARCH_METADATA_PATH, content: renderSearchMetadata(loaded.metadata) })
  const revision = await commitRepositoryFiles(event, changes, payload.repositoryRevision, `content: create ${payload.translationKey} draft`)
  return { ok: true, translationKey: payload.translationKey, repositoryRevision: revision, warnings: [] }
}

export const createCmsArticleLocale = async (
  event: H3Event | undefined,
  translationKey: string,
  input: CmsCreateLocalePayload
): Promise<CmsMutationResult> => {
  if (!slugPattern.test(translationKey)) throw createError({ statusCode: 400, message: 'Invalid translationKey.' })
  const payload = parseInput(createLocaleSchema, input)
  const loaded = await loadRepository(event)
  assertCurrentRevision(loaded, payload.repositoryRevision)
  const matching = loaded.articles.filter(article => article.frontmatter.translationKey === translationKey)
  if (!matching.length) throw createError({ statusCode: 404, message: 'Article not found.' })
  if (matching.some(article => article.locale === payload.locale)) {
    throw createError({ statusCode: 409, message: `${payload.locale} version already exists.` })
  }
  const source = matching[0]!
  const frontmatter: CmsArticleFrontmatter = {
    ...source.frontmatter,
    lang: payload.locale,
    status: 'draft',
    tags: [...source.frontmatter.tags],
    carouselImages: [...source.frontmatter.carouselImages],
    articleGalleryImages: [...source.frontmatter.articleGalleryImages],
    siteGalleryImages: [...source.frontmatter.siteGalleryImages]
  }
  const path = articleRepositoryPath(payload.locale, source.fileName)
  const content = `---\n${stringify(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n${source.body.startsWith('\n') ? source.body : `\n${source.body}`}`
  const revision = await commitRepositoryFiles(event, [{ path, content }], payload.repositoryRevision, `content: add ${payload.locale} draft for ${translationKey}`)
  return {
    ok: true,
    translationKey,
    repositoryRevision: revision,
    warnings: ['已複製現有內容並建立 draft；請完成翻譯後再發佈。']
  }
}

export const saveCmsArticleGroup = async (
  event: H3Event | undefined,
  translationKey: string,
  input: CmsSavePayload
): Promise<CmsMutationResult> => {
  if (!slugPattern.test(translationKey)) throw createError({ statusCode: 400, message: 'Invalid translationKey.' })
  const payload = parseInput(saveSchema, input)
  const loaded = await loadRepository(event)
  assertCurrentRevision(loaded, payload.repositoryRevision)
  if (loaded.metadataRevision !== payload.searchMetadataRevision) {
    throw createError({ statusCode: 409, message: 'searchMetadata.ts 已更新，請重新載入。' })
  }
  const metadata: CmsSearchMetadata = {
    en: normalizeList(payload.searchMetadata.en),
    'zh-TW': normalizeList(payload.searchMetadata['zh-TW'])
  }
  const changes: Array<{ path: string, content: string }> = []
  const warnings: string[] = []
  for (const article of payload.articles) {
    if (article.frontmatter.translationKey !== translationKey || article.frontmatter.lang !== article.locale) {
      throw createError({ statusCode: 400, message: 'Article language or translationKey mismatch.' })
    }
    const path = articleRepositoryPath(article.locale, article.fileName)
    const current = loaded.articles.find(item => item.locale === article.locale && item.fileName === article.fileName)
    const currentContent = loaded.articleContents.get(path)
    if (!current || !currentContent || current.revision !== article.revision) {
      throw createError({ statusCode: 409, message: `${article.fileName} 已在其他地方更新，請重新載入。` })
    }
    const normalized: CmsArticleSaveInput = {
      ...article,
      frontmatter: {
        ...frontmatterSchema.parse(article.frontmatter),
        title: article.frontmatter.title.trim(),
        description: article.frontmatter.description.trim(),
        tags: normalizeList(article.frontmatter.tags),
        carouselImages: normalizeList(article.frontmatter.carouselImages),
        articleGalleryImages: normalizeList(article.frontmatter.articleGalleryImages),
        siteGalleryImages: normalizeList(article.frontmatter.siteGalleryImages)
      }
    }
    changes.push({ path, content: updateMarkdown(currentContent, normalized) })
    warnings.push(...articleWarnings({ ...current, frontmatter: normalized.frontmatter, body: normalized.body }, metadata))
  }
  loaded.metadata[translationKey] = metadata
  changes.push({ path: SEARCH_METADATA_PATH, content: renderSearchMetadata(loaded.metadata) })
  const revision = await commitRepositoryFiles(event, changes, payload.repositoryRevision, `content: update ${translationKey}`)
  return { ok: true, translationKey, repositoryRevision: revision, warnings: [...new Set(warnings)] }
}
