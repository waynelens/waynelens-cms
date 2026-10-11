<script setup lang="ts">
import type { CmsR2UploadResult } from '~~/shared/types/cms'

const props = withDefaults(defineProps<{
  translationKey?: string
  multiple?: boolean
  label?: string
}>(), {
  translationKey: '',
  multiple: true,
  label: '從電腦上傳'
})

const emit = defineEmits<{
  uploaded: [urls: string[]]
}>()

const input = ref<HTMLInputElement>()
const uploading = ref(false)
const message = ref('')
const failed = ref(false)

const errorMessage = (value: unknown) => {
  if (value && typeof value === 'object') {
    const item = value as { data?: { statusMessage?: string, message?: string }, message?: string }
    return item.data?.statusMessage || item.data?.message || item.message || '圖片上傳失敗。'
  }
  return '圖片上傳失敗。'
}

const chooseFiles = () => input.value?.click()
const upload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = [...(target.files || [])]
  if (!files.length || uploading.value) return

  uploading.value = true
  failed.value = false
  message.value = `正在上傳 ${files.length} 張圖片…`

  try {
    const body = new FormData()
    if (props.translationKey) body.append('translationKey', props.translationKey)
    for (const file of files) body.append('files', file, file.name)

    const result = await $fetch<CmsR2UploadResult>('/api/r2/images', {
      method: 'POST',
      body
    })
    const reused = result.files.filter(file => file.reused).length
    emit('uploaded', result.files.map(file => file.url))
    message.value = reused
      ? `完成 ${result.files.length} 張，其中 ${reused} 張沿用既有檔案。`
      : `已上傳 ${result.files.length} 張圖片。`
  } catch (error) {
    failed.value = true
    message.value = errorMessage(error)
  } finally {
    uploading.value = false
    target.value = ''
  }
}
</script>

<template>
  <div class="r2-uploader">
    <input
      ref="input"
      class="r2-uploader__input"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
      :multiple="multiple"
      @change="upload"
    >
    <button type="button" :disabled="uploading" @click="chooseFiles">
      {{ uploading ? '上傳中…' : label }}
    </button>
    <span v-if="message" :class="{ error: failed }">{{ message }}</span>
  </div>
</template>

<style scoped>
.r2-uploader { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.r2-uploader__input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
button {
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg-soft);
  color: var(--text);
  cursor: pointer;
}
button:disabled { color: var(--muted); cursor: wait; opacity: 0.65; }
span { max-width: 300px; color: var(--muted); font-size: 0.72rem; line-height: 1.4; }
span.error { color: #ef7777; }
</style>
