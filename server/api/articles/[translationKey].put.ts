import type { CmsSavePayload } from '~~/shared/types/cms'
import { saveCmsArticleGroup } from '../../utils/articles'

export default defineEventHandler(async (event) => {
  const translationKey = getRouterParam(event, 'translationKey')
  if (!translationKey) throw createError({ statusCode: 400, message: 'Missing translationKey.' })
  const payload = await readBody<CmsSavePayload>(event)
  return saveCmsArticleGroup(event, translationKey, payload)
})
