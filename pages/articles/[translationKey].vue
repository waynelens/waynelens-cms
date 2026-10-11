<script setup lang="ts">
import type {
  CmsArticleDocument,
  CmsArticleGroup,
  CmsArticleSaveInput,
  CmsLocale,
  CmsMutationResult,
  CmsR2ConnectionStatus,
  CmsSavePayload,
  CmsStatus
} from '~~/shared/types/cms'

definePageMeta({ layout: false })
useSeoMeta({ title: '編輯文章 · Waynelens CMS', robots: 'noindex, nofollow' })

const route = useRoute()
const translationKey = computed(() => String(route.params.translationKey || ''))
const requestUrl = computed(() => `/api/articles/${encodeURIComponent(translationKey.value)}`)
const { data, status, error, refresh } = await useFetch<CmsArticleGroup>(requestUrl)
const {
  data: r2Status,
  status: r2RequestStatus,
  refresh: refreshR2Status
} = await useFetch<CmsR2ConnectionStatus>('/api/r2/status')

const editor = ref<CmsArticleGroup>()
const baseline = ref('')
const activeLocale = ref<CmsLocale>('zh-TW')
const searchEnText = ref('')
const searchZhText = ref('')
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveMessage = ref('')
const creatingLocale = ref<CmsLocale>()
const localeDialogTarget = ref<CmsLocale>()
const localeDialogError = ref('')
const localeDialog = ref<HTMLDialogElement>()
const showPreview = ref(false)
const previewRevision = ref(0)
const markdownEditor = ref<HTMLTextAreaElement>()
const markdownCursor = ref<number>()
const statusOptions: CmsStatus[] = ['draft', 'published', 'hidden']
const modifiedFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const formatModified = (value: string) => {
  const parts = Object.fromEntries(modifiedFormatter
    .formatToParts(new Date(value))
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]))
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}
const splitLines = (value: string) => [...new Set(value
  .split(/\r?\n/u)
  .map(item => item.trim())
  .filter(Boolean))]

const serializeEditor = () => JSON.stringify({
  editor: editor.value,
  searchEn: searchEnText.value,
  searchZh: searchZhText.value
})

const loadEditor = (group: CmsArticleGroup) => {
  editor.value = clone(group)
  searchEnText.value = group.searchMetadata.en.join('\n')
  searchZhText.value = group.searchMetadata['zh-TW'].join('\n')
  if (!group.articles[activeLocale.value]) {
    activeLocale.value = group.articles['zh-TW'] ? 'zh-TW' : 'en'
  }
  nextTick(() => { baseline.value = serializeEditor() })
}

watch(data, (value) => {
  if (value) loadEditor(value)
}, { immediate: true })

const localeOptions = computed<CmsLocale[]>(() => (
  (['zh-TW', 'en'] as CmsLocale[]).filter(locale => editor.value?.articles[locale])
))
const activeArticle = computed(() => editor.value?.articles[activeLocale.value])
const tagsText = computed({
  get: () => activeArticle.value?.frontmatter.tags.join(', ') || '',
  set: (value: string) => {
    if (activeArticle.value) {
      activeArticle.value.frontmatter.tags = value.split(',').map(item => item.trim()).filter(Boolean)
    }
  }
})
const isDirty = computed(() => Boolean(editor.value) && serializeEditor() !== baseline.value)
const previewUrl = computed(() => activeArticle.value?.path
  ? `https://waynelens.dev${activeArticle.value.path}`
  : '')

const localWarnings = computed(() => {
  if (!editor.value) return []
  const warnings = [...editor.value.warnings]
  const zh = editor.value.articles['zh-TW']?.frontmatter
  const en = editor.value.articles.en?.frontmatter

  if (zh && en) {
    if (zh.date !== en.date) warnings.push('中英文日期不同')
    for (const field of ['carouselImages', 'articleGalleryImages', 'siteGalleryImages'] as const) {
      if (JSON.stringify(zh[field]) !== JSON.stringify(en[field])) warnings.push(`中英文 ${field} 不同`)
    }
  }
  if (!splitLines(searchEnText.value).length || !splitLines(searchZhText.value).length) {
    warnings.push('搜尋 metadata 應同時具備中英文詞彙')
  }
  return [...new Set(warnings)]
})

const updateImageField = (
  field: 'carouselImages' | 'articleGalleryImages' | 'siteGalleryImages',
  value: string[]
) => {
  if (activeArticle.value) activeArticle.value.frontmatter[field] = value
}

const updateCover = (urls: string[]) => {
  if (activeArticle.value && urls[0]) activeArticle.value.frontmatter.cover = urls[0]
}

const rememberMarkdownCursor = () => {
  markdownCursor.value = markdownEditor.value?.selectionStart
}

watch(activeLocale, () => {
  markdownCursor.value = undefined
})

const insertSnippet = (type: 'image' | 'group' | 'map' | 'instagram') => {
  if (!activeArticle.value) return
  const snippets = {
    image: `\n::article-image\n---\nsrc: https://media.waynelens.dev/path/to/image.jpg\nalt: 圖片替代文字\ncaption: 圖片說明\n---\n::\n`,
    group: `\n::article-image-group\n---\nimages:\n  - src: https://media.waynelens.dev/path/to/image-01.jpg\n    alt: 圖片替代文字\n    caption: 圖片說明\n  - src: https://media.waynelens.dev/path/to/image-02.jpg\n    alt: 圖片替代文字\n---\n::\n`,
    map: `\n::article-map\n---\ncaption: 地圖說明\nzoom: 14\nheight: 420\nlocations:\n  - name: 地點名稱\n    latitude: 25.000000\n    longitude: 121.000000\n    precision: exact\n---\n::\n`,
    instagram: `[Instagram 帳號](https://www.instagram.com/username/)`
  }
  const editorElement = markdownEditor.value
  const body = activeArticle.value.body
  const position = Math.min(markdownCursor.value ?? body.length, body.length)
  const snippet = snippets[type]
  const needsLeadingBreak = position > 0 && body[position - 1] !== '\n' && !snippet.startsWith('\n')
  const needsTrailingBreak = position < body.length && body[position] !== '\n' && !snippet.endsWith('\n')
  const insertion = `${needsLeadingBreak ? '\n' : ''}${snippet}${needsTrailingBreak ? '\n' : ''}`

  activeArticle.value.body = `${body.slice(0, position)}${insertion}${body.slice(position)}`

  nextTick(() => {
    const nextPosition = position + insertion.length
    markdownCursor.value = nextPosition
    editorElement?.focus()
    editorElement?.setSelectionRange(nextPosition, nextPosition)
  })
}

const errorMessage = (value: unknown) => {
  if (value && typeof value === 'object') {
    const item = value as { data?: { statusMessage?: string, message?: string }, message?: string }
    return item.data?.statusMessage || item.data?.message || item.message || '儲存失敗'
  }
  return '儲存失敗'
}

const closeLocaleDialog = () => {
  if (creatingLocale.value) return
  localeDialogTarget.value = undefined
  localeDialogError.value = ''
}

const openLocaleDialog = (locale: CmsLocale) => {
  if (!editor.value || creatingLocale.value) return
  if (isDirty.value) {
    saveState.value = 'error'
    saveMessage.value = '請先儲存目前修改，再建立新的語言版本。'
    return
  }

  localeDialogError.value = ''
  localeDialogTarget.value = locale
}

const handleLocaleBackdropClick = (event: MouseEvent) => {
  if (event.target === localeDialog.value) closeLocaleDialog()
}

watch(localeDialogTarget, async (locale) => {
  await nextTick()
  if (locale) {
    if (!localeDialog.value?.open) localeDialog.value?.showModal()
    document.body.style.overflow = 'hidden'
    return
  }

  if (localeDialog.value?.open) localeDialog.value.close()
  document.body.style.overflow = ''
})

const createLocale = async () => {
  const locale = localeDialogTarget.value
  if (!locale || !editor.value || creatingLocale.value) return

  const targetLabel = locale === 'zh-TW' ? '中文版' : 'English 版本'
  creatingLocale.value = locale
  localeDialogError.value = ''
  saveMessage.value = ''
  try {
    const result = await $fetch<CmsMutationResult>(`${requestUrl.value}/locales`, {
      method: 'POST',
      body: { locale, repositoryRevision: editor.value.repositoryRevision }
    })
    await refresh()
    activeLocale.value = locale
    localeDialogTarget.value = undefined
    saveState.value = 'saved'
    saveMessage.value = result.warnings[0] || `${targetLabel}已建立。`
    window.setTimeout(() => {
      if (saveState.value === 'saved') saveState.value = 'idle'
    }, 5000)
  } catch (requestError) {
    localeDialogError.value = errorMessage(requestError)
  } finally {
    creatingLocale.value = undefined
  }
}

const save = async () => {
  if (!editor.value || saveState.value === 'saving') return

  const articles = Object.values(editor.value.articles)
    .filter((article): article is CmsArticleDocument => Boolean(article))
    .map<CmsArticleSaveInput>(article => ({
      locale: article.locale,
      fileName: article.fileName,
      revision: article.revision,
      frontmatter: article.frontmatter,
      body: article.body
    }))

  const payload: CmsSavePayload = {
    articles,
    searchMetadata: {
      en: splitLines(searchEnText.value),
      'zh-TW': splitLines(searchZhText.value)
    },
    searchMetadataRevision: editor.value.searchMetadataRevision,
    repositoryRevision: editor.value.repositoryRevision
  }

  saveState.value = 'saving'
  saveMessage.value = ''
  try {
    const result = await $fetch<CmsMutationResult>(requestUrl.value, { method: 'PUT', body: payload })
    saveState.value = 'saved'
    saveMessage.value = result.warnings.length
      ? `已儲存；${result.warnings.length} 項提醒待確認。`
      : '文章與搜尋索引已一起儲存。'
    await refresh()
    previewRevision.value += 1
    window.setTimeout(() => {
      if (saveState.value === 'saved') saveState.value = 'idle'
    }, 3500)
  } catch (requestError) {
    saveState.value = 'error'
    saveMessage.value = errorMessage(requestError)
  }
}

const reload = async () => {
  if (isDirty.value && !window.confirm('重新載入會捨棄尚未儲存的內容，確定繼續？')) return
  await refresh()
  if (data.value) loadEditor(data.value)
}

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.body.style.overflow = ''
})
onBeforeRouteLeave(() => !isDirty.value || window.confirm('尚有未儲存的內容，確定離開？'))
</script>

<template>
  <CmsShell>
    <div class="editor-page">
    <div v-if="status === 'pending' && !editor" class="loading-panel">讀取文章中…</div>
    <div v-else-if="error && !editor" class="loading-panel error">{{ error.message }}</div>

    <template v-else-if="editor">
      <header class="editor-header">
        <div>
          <NuxtLink to="/" class="back-link">← 所有文章</NuxtLink>
          <p class="translation-key">{{ editor.translationKey }}</p>
          <h1>{{ activeArticle?.frontmatter.title || '未命名文章' }}</h1>
        </div>
        <div class="editor-actions">
          <span v-if="saveMessage" :class="`save-message ${saveState}`">{{ saveMessage }}</span>
          <button type="button" class="secondary-button" @click="reload">重新載入</button>
          <button
            type="button"
            class="primary-button"
            :disabled="saveState === 'saving' || !isDirty"
            @click="save"
          >
            {{ saveState === 'saving' ? '儲存中…' : isDirty ? '儲存文章與索引' : '已儲存' }}
          </button>
        </div>
      </header>

      <div class="editor-layout">
        <main class="editor-main">
          <nav class="locale-tabs" aria-label="文章語言">
            <button
              v-for="locale in localeOptions"
              :key="locale"
              type="button"
              :class="{ active: activeLocale === locale }"
              @click="activeLocale = locale"
            >
              {{ locale === 'zh-TW' ? '繁體中文' : 'English' }}
              <span :class="`status-${editor.articles[locale]?.frontmatter.status}`">
                {{ editor.articles[locale]?.frontmatter.status }}
              </span>
            </button>
            <button
              v-if="!editor.articles['zh-TW']"
              type="button"
              :disabled="Boolean(creatingLocale)"
              @click="openLocaleDialog('zh-TW')"
            >
              {{ creatingLocale === 'zh-TW' ? '建立中…' : '＋ 中文版' }}
            </button>
            <button
              v-if="!editor.articles.en"
              type="button"
              :disabled="Boolean(creatingLocale)"
              @click="openLocaleDialog('en')"
            >
              {{ creatingLocale === 'en' ? '建立中…' : '＋ English' }}
            </button>
          </nav>

          <template v-if="activeArticle">
            <section class="editor-section basic-section">
              <div class="section-heading">
                <div><p class="eyebrow">Frontmatter</p><h2>基本資料</h2></div>
                <span>檔案：{{ activeArticle.fileName }}</span>
              </div>

              <div class="form-grid">
                <label class="field-wide">
                  <span>標題</span>
                  <input v-model="activeArticle.frontmatter.title" type="text">
                </label>
                <label>
                  <span>狀態</span>
                  <select v-model="activeArticle.frontmatter.status">
                    <option v-for="item in statusOptions" :key="item" :value="item">{{ item }}</option>
                  </select>
                </label>
                <label>
                  <span>日期</span>
                  <input v-model="activeArticle.frontmatter.date" type="date">
                </label>
                <label class="field-full">
                  <span>Description</span>
                  <textarea v-model="activeArticle.frontmatter.description" rows="3" />
                </label>
                <label class="field-wide">
                  <span>Tags（以逗號分隔）</span>
                  <input v-model="tagsText" type="text" placeholder="自由潛水, 水下攝影">
                </label>
                <div class="form-field field-full">
                  <span>Cover URL</span>
                  <input v-model="activeArticle.frontmatter.cover" type="url" placeholder="https://media.waynelens.dev/...">
                  <CmsR2Uploader
                    :translation-key="translationKey"
                    :multiple="false"
                    label="上傳 Cover"
                    @uploaded="updateCover"
                  />
                </div>
              </div>
            </section>

            <section class="editor-section markdown-section">
              <div class="section-heading markdown-heading">
                <div><p class="eyebrow">Markdown + MDC</p><h2>文章正文</h2></div>
                <div class="snippet-actions">
                  <button type="button" @click="insertSnippet('image')">＋ 單張圖片</button>
                  <button type="button" @click="insertSnippet('group')">＋ 圖片群組</button>
                  <button type="button" @click="insertSnippet('map')">＋ 地圖</button>
                  <button type="button" @click="insertSnippet('instagram')">＋ Instagram</button>
                </div>
              </div>
              <textarea
                ref="markdownEditor"
                v-model="activeArticle.body"
                class="markdown-editor"
                spellcheck="false"
                aria-label="Markdown 正文"
                @blur="rememberMarkdownCursor"
                @click="rememberMarkdownCursor"
                @input="rememberMarkdownCursor"
                @keyup="rememberMarkdownCursor"
                @select="rememberMarkdownCursor"
              />
              <p class="editor-hint">保留 Markdown、MDC 元件與必要的 &lt;br&gt;；CMS 不會自動重排正文。</p>
            </section>

            <section class="editor-section images-section">
              <div class="section-heading">
                <div><p class="eyebrow">Media</p><h2>圖片 URL</h2></div>
                <span>{{ r2Status?.connected ? `已連線 · ${r2Status.bucket}` : 'R2 尚未連線' }}</span>
              </div>
              <CmsImageListEditor
                :model-value="activeArticle.frontmatter.carouselImages"
                :translation-key="translationKey"
                title="Carousel Images"
                description="文章頂部輪播使用的精選照片。"
                @update:model-value="updateImageField('carouselImages', $event)"
              />
              <CmsImageListEditor
                :model-value="activeArticle.frontmatter.articleGalleryImages"
                :translation-key="translationKey"
                title="Article Gallery Images"
                description="文章底部的完整作品集合。"
                @update:model-value="updateImageField('articleGalleryImages', $event)"
              />
              <CmsImageListEditor
                :model-value="activeArticle.frontmatter.siteGalleryImages"
                :translation-key="translationKey"
                title="Site Gallery Images"
                description="希望顯示在全站 Gallery 的精選照片。"
                @update:model-value="updateImageField('siteGalleryImages', $event)"
              />
            </section>
          </template>

          <section class="editor-section search-section">
            <div class="section-heading">
              <div><p class="eyebrow">MiniSearch metadata</p><h2>搜尋索引補充詞</h2></div>
              <span>儲存文章時一併更新 searchMetadata.ts</span>
            </div>
            <div class="search-grid">
              <label>
                <span>繁體中文（每行一個）</span>
                <textarea v-model="searchZhText" rows="12" />
              </label>
              <label>
                <span>English（每行一個）</span>
                <textarea v-model="searchEnText" rows="12" />
              </label>
            </div>
          </section>

          <section class="editor-section preview-section">
            <div class="section-heading">
              <div><p class="eyebrow">Published preview</p><h2>正式網站預覽</h2></div>
              <div class="preview-actions">
                <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener">另開分頁</a>
                <button type="button" @click="showPreview = !showPreview">
                  {{ showPreview ? '收起預覽' : '載入預覽' }}
                </button>
              </div>
            </div>
            <p v-if="isDirty" class="preview-notice">預覽顯示的是正式網站目前版本；儲存後仍需等待 GitHub Pages 部署。</p>
            <iframe
              v-if="showPreview && previewUrl"
              :key="`${previewUrl}-${previewRevision}`"
              :src="previewUrl"
              title="文章正式網站預覽"
            />
          </section>
        </main>

        <aside class="editor-sidebar">
          <section class="sidebar-card">
            <p class="eyebrow">Checks</p>
            <h2>編輯提醒</h2>
            <ul v-if="localWarnings.length">
              <li v-for="warning in localWarnings" :key="warning">{{ warning }}</li>
            </ul>
            <p v-else class="all-clear">目前沒有偵測到問題。</p>
          </section>

          <CmsIntegrationCard
            title="Cloudflare R2"
            :description="r2Status?.connected
              ? `已連線 ${r2Status.bucket}；上傳後會自動產生 hash 檔名與公開 URL。`
              : (r2Status?.error || '尚未完成 R2 設定。')"
            :status="r2Status?.connected ? 'Connected' : 'Unavailable'"
            action="重新檢查連線"
            :action-disabled="r2RequestStatus === 'pending'"
            @action="refreshR2Status"
          />

          <section class="sidebar-card file-card" v-if="activeArticle">
            <p class="eyebrow">File</p>
            <code>{{ activeArticle.fileName }}</code>
            <dl>
              <div><dt>revision</dt><dd>{{ activeArticle.revision.slice(0, 10) }}</dd></div>
              <div><dt>updated</dt><dd>{{ formatModified(activeArticle.modifiedAt) }}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </template>

    <dialog
      ref="localeDialog"
      class="locale-dialog"
      aria-labelledby="locale-dialog-title"
      @cancel.prevent="closeLocaleDialog"
      @click="handleLocaleBackdropClick"
    >
      <section class="locale-dialog__panel">
        <header class="locale-dialog__header">
          <div>
            <p class="eyebrow">Bilingual draft</p>
            <h2 id="locale-dialog-title">
              建立{{ localeDialogTarget === 'en' ? '英文版' : '中文版' }}
            </h2>
          </div>
          <button type="button" :disabled="Boolean(creatingLocale)" @click="closeLocaleDialog">取消</button>
        </header>

        <p class="locale-dialog__description">
          以目前的{{ localeDialogTarget === 'en' ? '中文版' : '英文版' }}為基礎建立翻譯草稿，原始文章不會被修改。
        </p>

        <div class="locale-dialog__summary">
          <div>
            <span>新檔案</span>
            <code>{{ activeArticle?.fileName }}</code>
          </div>
          <div>
            <span>初始狀態</span>
            <strong>draft</strong>
          </div>
          <div>
            <span>將會複製</span>
            <strong>日期、圖片、地圖與正文</strong>
          </div>
        </div>

        <p class="locale-dialog__notice">
          建立後會自動切換到新語言版本；完成翻譯並確認內容後，再將狀態改為 published。
        </p>
        <p v-if="localeDialogError" class="locale-dialog__error">{{ localeDialogError }}</p>

        <footer class="locale-dialog__actions">
          <button type="button" :disabled="Boolean(creatingLocale)" @click="closeLocaleDialog">返回編輯</button>
          <button type="button" class="primary-button" :disabled="Boolean(creatingLocale)" @click="createLocale">
            {{ creatingLocale ? '建立草稿中…' : '建立翻譯草稿' }}
          </button>
        </footer>
      </section>
    </dialog>
    </div>
  </CmsShell>
</template>

<style scoped>
.editor-page { display: grid; gap: 24px; }
.loading-panel { padding: 80px 24px; border: 1px solid var(--line); border-radius: 24px; color: var(--muted); text-align: center; }
.loading-panel.error { color: #ef7777; }
.editor-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 8px 2px 18px; }
.back-link { color: var(--muted); font-size: 0.84rem; }
.back-link:hover { color: var(--text); }
.translation-key { margin: 18px 0 4px; color: var(--muted); font-family: ui-monospace, monospace; font-size: 0.72rem; }
.editor-header h1 { max-width: 900px; margin: 0; font-size: clamp(2rem, 4vw, 3.8rem); line-height: 1; }
.editor-actions { display: flex; align-items: center; gap: 9px; }
.save-message { max-width: 260px; color: var(--muted); font-size: 0.76rem; text-align: right; }
.save-message.error { color: #ef7777; }
.save-message.saved { color: #56c87c; }
button,
.preview-actions a {
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-soft);
  color: var(--text);
  cursor: pointer;
}
button:disabled { cursor: not-allowed; opacity: 0.55; }
.primary-button { border-color: var(--text); background: var(--text); color: var(--page-bg); font-weight: 700; }
.editor-layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; align-items: start; gap: 20px; }
.editor-main { display: grid; min-width: 0; gap: 18px; }
.locale-tabs { display: flex; gap: 8px; padding: 6px; border: 1px solid var(--line); border-radius: 15px; background: var(--bg-elevated); }
.locale-tabs button { display: inline-flex; align-items: center; gap: 9px; border-color: transparent; background: transparent; }
.locale-tabs button.active { border-color: var(--line); background: var(--page-bg); box-shadow: 0 5px 18px rgba(0, 0, 0, 0.08); }
.locale-tabs button span { padding: 3px 7px; border-radius: 999px; font-size: 0.66rem; }
.status-draft { background: rgba(242, 195, 139, 0.16); color: #d9a85f; }
.status-published { background: rgba(74, 222, 128, 0.14); color: #56c87c; }
.status-hidden { background: rgba(145, 184, 255, 0.14); color: #78a3e8; }
.editor-section,
.sidebar-card { border: 1px solid var(--line); border-radius: 22px; background: var(--bg-elevated); }
.editor-section { display: grid; gap: 22px; padding: clamp(20px, 3vw, 30px); }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.section-heading h2,
.sidebar-card h2 { margin: 3px 0 0; font-size: 1.25rem; }
.section-heading > span { color: var(--muted); font-size: 0.72rem; }
.form-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(140px, 0.65fr) minmax(160px, 0.75fr); gap: 15px; }
label,
.form-field { display: grid; gap: 7px; }
label > span,
.form-field > span { color: var(--muted); font-size: 0.75rem; }
input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--page-bg);
  color: var(--text);
}
input,
select { padding: 10px 12px; }
textarea { padding: 12px; resize: vertical; line-height: 1.6; }
.field-wide { grid-column: span 1; }
.field-full { grid-column: 1 / -1; }
.markdown-heading { align-items: center; }
.snippet-actions,
.preview-actions { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
.snippet-actions button,
.preview-actions button,
.preview-actions a { padding: 7px 9px; color: var(--muted); font-size: 0.74rem; }
.markdown-editor { min-height: 650px; border-radius: 14px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.9rem; tab-size: 2; }
.editor-hint,
.preview-notice { margin: -10px 0 0; color: var(--muted); font-size: 0.76rem; }
.images-section :deep(.image-editor + .image-editor) { padding-top: 22px; border-top: 1px solid var(--line); }
.search-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.search-grid textarea { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.82rem; }
.preview-notice { margin: 0; color: #d9a85f; }
.preview-section iframe { width: 100%; min-height: 780px; border: 1px solid var(--line); border-radius: 14px; background: white; }
.editor-sidebar { position: sticky; top: 92px; display: grid; gap: 14px; }
.sidebar-card { padding: 20px; }
.sidebar-card ul { display: grid; gap: 9px; margin: 16px 0 0; padding-left: 18px; color: #d9a85f; font-size: 0.78rem; line-height: 1.45; }
.all-clear { margin: 14px 0 0; color: #56c87c; font-size: 0.8rem; }
.file-card code { display: block; overflow-wrap: anywhere; margin-top: 12px; color: var(--muted); font-size: 0.72rem; }
.file-card dl { display: grid; gap: 8px; margin: 14px 0 0; }
.file-card dl div { display: flex; justify-content: space-between; gap: 12px; }
.file-card dt,
.file-card dd { margin: 0; color: var(--muted); font-size: 0.68rem; }

.locale-dialog {
  width: min(580px, calc(100% - 28px));
  margin: auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--bg-elevated);
  color: var(--text);
  box-shadow: 0 32px 100px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(28px);
}
.locale-dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
}
.locale-dialog__panel { display: grid; gap: 20px; padding: clamp(22px, 4vw, 32px); }
.locale-dialog__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.locale-dialog__header .eyebrow { margin: 0 0 6px; }
.locale-dialog__header h2 { margin: 0; font-size: clamp(1.55rem, 4vw, 2.2rem); line-height: 1.1; }
.locale-dialog__header > button { padding: 7px 10px; color: var(--muted); font-size: 0.74rem; }
.locale-dialog__description,
.locale-dialog__notice,
.locale-dialog__error { margin: 0; line-height: 1.65; }
.locale-dialog__description { color: var(--muted); }
.locale-dialog__summary { display: grid; gap: 1px; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: var(--line); }
.locale-dialog__summary > div { display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 14px; padding: 13px 15px; background: var(--bg-soft); }
.locale-dialog__summary span { color: var(--muted); font-size: 0.72rem; }
.locale-dialog__summary strong,
.locale-dialog__summary code { overflow-wrap: anywhere; font-size: 0.78rem; }
.locale-dialog__summary code { color: var(--text); }
.locale-dialog__notice { padding: 13px 15px; border-radius: 13px; background: rgba(242, 195, 139, 0.12); color: #d9a85f; font-size: 0.78rem; }
.locale-dialog__error { color: #ef7777; font-size: 0.8rem; }
.locale-dialog__actions { display: flex; justify-content: flex-end; gap: 9px; }

@media (max-width: 1120px) {
  .editor-layout { grid-template-columns: 1fr; }
  .editor-sidebar { position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .editor-sidebar .sidebar-card:first-child { grid-column: 1 / -1; }
}
@media (max-width: 760px) {
  .editor-header,
  .section-heading { align-items: stretch; flex-direction: column; }
  .editor-actions { align-items: stretch; flex-direction: column; }
  .save-message { max-width: none; text-align: left; }
  .locale-tabs { overflow-x: auto; }
  .form-grid,
  .search-grid,
  .editor-sidebar { grid-template-columns: 1fr; }
  .field-full,
  .editor-sidebar .sidebar-card:first-child { grid-column: auto; }
  .markdown-heading { align-items: stretch; }
  .snippet-actions,
  .preview-actions { justify-content: flex-start; }
  .markdown-editor { min-height: 480px; }
  .locale-dialog { width: calc(100% - 16px); max-height: calc(100dvh - 32px); }
  .locale-dialog__panel { max-height: calc(100dvh - 32px); overflow-y: auto; padding: 20px 16px; }
  .locale-dialog__summary > div { grid-template-columns: 80px minmax(0, 1fr); }
  .locale-dialog__actions { display: grid; grid-template-columns: 1fr 1fr; }
}
</style>
