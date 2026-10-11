import type { CmsR2UploadResult } from '~~/shared/types/cms'
import { R2_UPLOAD_LIMITS, uploadR2Image, validateR2Image } from '../../utils/r2'

export default defineEventHandler(async (event): Promise<CmsR2UploadResult> => {
  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, message: '缺少 multipart form data。' })
  const translationKey = parts.find(part => part.name === 'translationKey' && !part.filename)?.data.toString('utf8').trim()
  if (translationKey && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(translationKey)) {
    throw createError({ statusCode: 400, message: 'translationKey 格式不正確。' })
  }
  const files = parts.filter(part => part.name === 'files' && part.filename)
  if (!files.length) throw createError({ statusCode: 400, message: '沒有收到圖片。' })
  if (files.length > R2_UPLOAD_LIMITS.files) {
    throw createError({ statusCode: 413, message: `一次最多上傳 ${R2_UPLOAD_LIMITS.files} 張圖片。` })
  }
  const totalBytes = files.reduce((sum, file) => sum + file.data.byteLength, 0)
  if (totalBytes > R2_UPLOAD_LIMITS.totalBytes) throw createError({ statusCode: 413, message: '單次上傳總量不可超過 250 MB。' })

  for (const file of files) {
    validateR2Image({ data: file.data, fileName: file.filename || 'image', contentType: file.type || 'application/octet-stream' })
  }
  const uploaded = []
  for (const file of files) {
    uploaded.push(await uploadR2Image(event, {
      data: file.data,
      fileName: file.filename || 'image',
      contentType: file.type || 'application/octet-stream',
      translationKey
    }))
  }
  return { ok: true, files: uploaded }
})
