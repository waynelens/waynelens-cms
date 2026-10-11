import type { CmsCreateLocalePayload } from '~~/shared/types/cms'
import { createCmsArticleLocale } from '../../../utils/articles'

export default defineEventHandler(async (event) => {
  const translationKey = getRouterParam(event, 'translationKey')
  if (!translationKey) throw createError({ statusCode: 400, message: 'Missing translationKey.' })
  const payload = await readBody<CmsCreateLocalePayload>(event)
  return createCmsArticleLocale(event, translationKey, payload)
})
