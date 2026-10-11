<script setup lang="ts">
const props = defineProps<{
  modelValue: string[]
  title: string
  description: string
  translationKey: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const bulkInput = ref('')

const update = (value: string[]) => emit('update:modelValue', value)
const updateAt = (index: number, event: Event) => {
  const next = [...props.modelValue]
  next[index] = (event.target as HTMLInputElement).value
  update(next)
}
const removeAt = (index: number) => update(props.modelValue.filter((_, itemIndex) => itemIndex !== index))
const move = (index: number, offset: number) => {
  const target = index + offset
  if (target < 0 || target >= props.modelValue.length) return
  const next = [...props.modelValue]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  update(next)
}
const addUrls = () => {
  const values = bulkInput.value
    .split(/\r?\n/u)
    .map(value => value.trim())
    .filter(Boolean)
  if (!values.length) return
  update([...props.modelValue, ...values])
  bulkInput.value = ''
}
const deduplicate = () => update([...new Set(props.modelValue.map(value => value.trim()).filter(Boolean))])
const addUploaded = (urls: string[]) => update([...new Set([...props.modelValue, ...urls])])
const fileLabel = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || url)
  } catch {
    return url || '空白 URL'
  }
}
</script>

<template>
  <section class="image-editor">
    <header>
      <div>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
      <div class="image-editor__tools">
        <span>{{ modelValue.length }} 張</span>
        <button type="button" :disabled="!modelValue.length" @click="deduplicate">去除重複</button>
        <CmsR2Uploader
          :translation-key="translationKey"
          label="上傳到 R2"
          @uploaded="addUploaded"
        />
      </div>
    </header>

    <div v-if="modelValue.length" class="image-editor__list">
      <div v-for="(url, index) in modelValue" :key="`${index}-${url}`" class="image-row">
        <div class="image-row__preview">
          <img
            v-if="url"
            :src="url"
            alt=""
            loading="lazy"
            width="52"
            height="42"
          />
          <span v-else>{{ index + 1 }}</span>
        </div>
        <label>
          <span>{{ index + 1 }} · {{ fileLabel(url) }}</span>
          <input :value="url" type="url" @input="updateAt(index, $event)">
        </label>
        <div class="image-row__actions">
          <button type="button" :disabled="index === 0" aria-label="往上移" @click="move(index, -1)">↑</button>
          <button type="button" :disabled="index === modelValue.length - 1" aria-label="往下移" @click="move(index, 1)">↓</button>
          <button type="button" class="danger" aria-label="刪除" @click="removeAt(index)">×</button>
        </div>
      </div>
    </div>
    <p v-else class="image-editor__empty">目前沒有圖片 URL。</p>

    <div class="bulk-add">
      <textarea v-model="bulkInput" rows="3" placeholder="一次貼入多個 URL，每行一個" />
      <button type="button" :disabled="!bulkInput.trim()" @click="addUrls">加入 URL</button>
    </div>
  </section>
</template>

<style scoped>
.image-editor { display: grid; gap: 14px; }
.image-editor > header,
.image-editor__tools,
.image-row,
.image-row__actions,
.bulk-add { display: flex; }
.image-editor > header { align-items: flex-start; justify-content: space-between; gap: 16px; }
.image-editor h3 { margin: 0; font-size: 1rem; }
.image-editor p { margin: 5px 0 0; color: var(--muted); font-size: 0.8rem; }
.image-editor__tools { align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.image-editor__tools span { color: var(--muted); font-size: 0.78rem; }
button {
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg-soft);
  color: var(--text);
  cursor: pointer;
}
button:disabled { color: var(--muted); cursor: not-allowed; opacity: 0.55; }
.image-editor__list { display: grid; gap: 8px; max-height: 420px; overflow: auto; padding-right: 4px; }
.image-row { align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--line); border-radius: 12px; }
.image-row__preview { display: grid; flex: 0 0 52px; width: 52px; height: 42px; place-items: center; overflow: hidden; border-radius: 8px; background: var(--bg-soft); color: var(--muted); }
.image-row__preview img { width: 100%; height: 100%; object-fit: cover; }
.image-row label { display: grid; min-width: 0; flex: 1; gap: 4px; }
.image-row label span { overflow: hidden; color: var(--muted); font-size: 0.69rem; text-overflow: ellipsis; white-space: nowrap; }
.image-row input,
.bulk-add textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--page-bg);
  color: var(--text);
}
.image-row input { padding: 8px 10px; font-size: 0.78rem; }
.image-row__actions { gap: 4px; }
.image-row__actions button { width: 32px; padding: 6px 0; }
.image-row__actions .danger { color: #ef7777; }
.image-editor__empty { padding: 18px; border: 1px dashed var(--line); border-radius: 12px; text-align: center; }
.bulk-add { align-items: stretch; gap: 8px; }
.bulk-add textarea { min-height: 76px; padding: 10px; resize: vertical; }
.bulk-add button { flex: 0 0 auto; }

@media (max-width: 720px) {
  .image-editor > header { display: grid; }
  .image-editor__tools { justify-content: flex-start; }
  .image-row { align-items: flex-start; flex-wrap: wrap; }
  .image-row label { flex-basis: calc(100% - 64px); }
  .image-row__actions { margin-left: 62px; }
  .bulk-add { display: grid; }
}
</style>
