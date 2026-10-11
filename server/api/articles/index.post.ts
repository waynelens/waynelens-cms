import type { CmsCreatePayload } from '~~/shared/types/cms'
import { createCmsArticleGroup } from '../../utils/articles'

export default defineEventHandler(async (event) => {
  const payload = await readBody<CmsCreatePayload>(event)
  return createCmsArticleGroup(event, payload)
})
