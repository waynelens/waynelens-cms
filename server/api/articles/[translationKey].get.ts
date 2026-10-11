import { getCmsArticleGroup } from '../../utils/articles'

export default defineEventHandler((event) => {
  const translationKey = getRouterParam(event, 'translationKey')
  if (!translationKey) throw createError({ statusCode: 400, message: 'Missing translationKey.' })
  return getCmsArticleGroup(event, translationKey)
})
