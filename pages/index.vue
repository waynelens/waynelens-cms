<script setup lang="ts">
import type {
  CmsArticleLibrary,
  CmsArticleGroupSummary,
  CmsCreatePayload,
  CmsGitHubConnectionStatus,
  CmsLocale,
  CmsR2ConnectionStatus
} from '~~/shared/types/cms'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Waynelens CMS', robots: 'noindex, nofollow' })

const { data: library, status, error, refresh } = await useFetch<CmsArticleLibrary>('/api/articles')
const groups = computed<CmsArticleGroupSummary[]>(() => library.value?.groups || [])
const {
  data: r2Status,
  status: r2RequestStatus,
  refresh: refreshR2Status
} = await useFetch<CmsR2ConnectionStatus>('/api/r2/status')
const {
  data: githubStatus,
  status: githubRequestStatus,
  refresh: refreshGitHubStatus
} = await useFetch<CmsGitHubConnectionStatus>('/api/github/status')
const query = ref('')
const statusFilter = ref<'all' | 'draft' | 'published' | 'hidden'>('all')
const showCreate = ref(false)
const creating = ref(false)
const createError = ref('')
const createForm = reactive<CmsCreatePayload>({
  date: new Date().toISOString().slice(0, 10),
  slug: '',
  translationKey: '',
  locales: ['zh-TW', 'en'],
  repositoryRevision: ''
})
const localeOptions: CmsLocale[] = ['zh-TW', 'en']
const modifiedFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

const filteredGroups = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return groups.value.filter((group) => {
    const texts = [
      group.translationKey,
      group.locales['zh-TW']?.title,
      group.locales.en?.title
    ].filter(Boolean).join(' ').toLocaleLowerCase()
    const matchesQuery = !needle || texts.includes(needle)
    const statuses = Object.values(group.locales).map(article => article?.status)
    const matchesStatus = statusFilter.value === 'all' || statuses.includes(statusFilter.value)
    return matchesQuery && matchesStatus
  })
})

const toggleLocale = (locale: CmsLocale) => {
  createForm.locales = createForm.locales.includes(locale)
    ? createForm.locales.filter(value => value !== locale)
    : [...createForm.locales, locale]
}

const useSlugAsKey = () => {
  if (!createForm.translationKey) createForm.translationKey = createForm.slug
}

const errorMessage = (value: unknown) => {
  if (value && typeof value === 'object') {
    const item = value as { data?: { statusMessage?: string, message?: string }, message?: string }
    return item.data?.statusMessage || item.data?.message || item.message || '建立文章失敗'
  }
  return '建立文章失敗'
}

const createArticle = async () => {
  createError.value = ''
  if (!createForm.locales.length) {
    createError.value = '至少選擇一種語言。'
    return
  }

  creating.value = true
  try {
    createForm.repositoryRevision = library.value?.repositoryRevision || ''
    const result = await $fetch<{ translationKey: string }>('/api/articles', {
      method: 'POST',
      body: createForm
    })
    await refresh()
    await navigateTo(`/articles/${result.translationKey}`)
  } catch (requestError) {
    createError.value = errorMessage(requestError)
  } finally {
    creating.value = false
  }
}

const formatModified = (value: string) => {
  const parts = Object.fromEntries(modifiedFormatter
    .formatToParts(new Date(value))
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]))
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`
}
</script>

<template>
  <CmsShell>
    <div class="cms-dashboard">
    <section class="dashboard-hero">
      <div>
        <p class="eyebrow">Content workspace</p>
        <h1>文章管理</h1>
        <p>直接編輯 GitHub 上的 Markdown、雙語內容與搜尋 metadata；每次儲存都會留下可追蹤的 commit。</p>
      </div>
      <button class="primary-action" type="button" @click="showCreate = !showCreate">
        {{ showCreate ? '收起' : '＋ 新增文章' }}
      </button>
    </section>

    <section v-if="showCreate" class="create-panel panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">New draft</p>
          <h2>建立草稿</h2>
        </div>
        <span>新文章固定以 draft 建立</span>
      </div>

      <form class="create-grid" @submit.prevent="createArticle">
        <label>
          <span>日期</span>
          <input v-model="createForm.date" type="date" required>
        </label>
        <label>
          <span>檔名 slug</span>
          <input
            v-model.trim="createForm.slug"
            type="text"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="rose-garden-sunrise-dive"
            required
            @blur="useSlugAsKey"
          >
        </label>
        <label>
          <span>translationKey</span>
          <input
            v-model.trim="createForm.translationKey"
            type="text"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="通常與 slug 相同"
            required
          >
        </label>
        <fieldset>
          <legend>建立語言</legend>
          <button
            v-for="locale in localeOptions"
            :key="locale"
            type="button"
            :class="{ active: createForm.locales.includes(locale) }"
            @click="toggleLocale(locale)"
          >
            {{ locale === 'zh-TW' ? '繁體中文' : 'English' }}
          </button>
        </fieldset>
        <div class="create-actions">
          <p v-if="createError" class="form-error">{{ createError }}</p>
          <button class="primary-action" type="submit" :disabled="creating">
            {{ creating ? '建立中…' : '建立並開始編輯' }}
          </button>
        </div>
      </form>
    </section>

    <section class="integration-panel" aria-label="外部服務狀態">
      <CmsIntegrationCard
        title="GitHub App"
        :description="githubStatus?.connected
          ? `已連線 ${githubStatus.repository}@${githubStatus.branch}。`
          : (githubStatus?.error || '尚未完成 GitHub App 設定。')"
        :status="githubStatus?.connected ? 'Connected' : 'Unavailable'"
        action="重新檢查連線"
        :action-disabled="githubRequestStatus === 'pending'"
        @action="refreshGitHubStatus"
      />
      <CmsIntegrationCard
        title="Cloudflare R2"
        :description="r2Status?.connected
          ? `已連線 ${r2Status.bucket}；進入文章即可上傳 Cover 與各圖片集合。`
          : (r2Status?.error || '尚未完成 R2 設定。')"
        :status="r2Status?.connected ? 'Connected' : 'Unavailable'"
        action="重新檢查連線"
        :action-disabled="r2RequestStatus === 'pending'"
        @action="refreshR2Status"
      />
    </section>

    <section class="articles-panel panel">
      <header class="articles-toolbar">
        <div>
          <p class="eyebrow">Library</p>
          <h2>所有文章</h2>
        </div>
        <div class="filters">
          <input v-model="query" type="search" placeholder="搜尋標題或 translationKey">
          <select v-model="statusFilter">
            <option value="all">所有狀態</option>
            <option value="draft">草稿</option>
            <option value="published">公開</option>
            <option value="hidden">隱藏</option>
          </select>
          <button type="button" :disabled="status === 'pending'" @click="() => refresh()">重新整理</button>
        </div>
      </header>

      <p v-if="status === 'pending'" class="state-message">讀取文章中…</p>
      <p v-else-if="error" class="state-message error">{{ error.message }}</p>
      <p v-else-if="!filteredGroups.length" class="state-message">沒有符合條件的文章。</p>

      <div v-else class="article-list">
        <NuxtLink
          v-for="group in filteredGroups"
          :key="group.translationKey"
          :to="`/articles/${group.translationKey}`"
          class="article-card"
        >
          <div class="article-card__main">
            <span class="translation-key">{{ group.translationKey }}</span>
            <h3>{{ group.locales['zh-TW']?.title || group.locales.en?.title || '未命名文章' }}</h3>
            <p v-if="group.locales['zh-TW'] && group.locales.en" class="secondary-title">
              {{ group.locales.en.title }}
            </p>
          </div>
          <div class="locale-statuses">
            <span v-for="locale in localeOptions" :key="locale" class="locale-line">
              <b>{{ locale === 'zh-TW' ? '中' : 'EN' }}</b>
              <template v-if="group.locales[locale]">
                <i :class="`status-${group.locales[locale]?.status}`" />
                {{ group.locales[locale]?.status }}
              </template>
              <template v-else><i class="status-missing" />missing</template>
            </span>
          </div>
          <div class="article-card__meta">
            <span>{{ group.locales['zh-TW']?.date || group.locales.en?.date }}</span>
            <span>{{ formatModified(group.modifiedAt) }}</span>
            <span v-if="group.warnings.length" class="warning">⚠ {{ group.warnings.join('、') }}</span>
          </div>
          <span class="article-card__arrow">→</span>
        </NuxtLink>
      </div>
    </section>
    </div>
  </CmsShell>
</template>

<style scoped>
.cms-dashboard { display: grid; gap: 26px; }
.dashboard-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 18px 4px; }
.dashboard-hero h1 { margin: 4px 0 10px; font-size: clamp(2.2rem, 5vw, 4.6rem); line-height: 0.95; }
.dashboard-hero p:last-child { max-width: 680px; margin: 0; color: var(--muted); line-height: 1.7; }
.primary-action {
  padding: 11px 16px;
  border: 0;
  border-radius: 12px;
  background: var(--text);
  color: var(--page-bg);
  cursor: pointer;
  font-weight: 700;
}
.primary-action:disabled { cursor: wait; opacity: 0.55; }
.panel { border: 1px solid var(--line); border-radius: 24px; background: var(--bg-elevated); box-shadow: 0 16px 42px rgba(0, 0, 0, 0.08); }
.create-panel { padding: clamp(20px, 3vw, 30px); }
.panel-heading,
.articles-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.panel-heading h2,
.articles-toolbar h2 { margin: 2px 0 0; }
.panel-heading > span { color: var(--muted); font-size: 0.8rem; }
.create-grid { display: grid; grid-template-columns: 0.7fr 1.2fr 1.2fr 1fr; gap: 16px; margin-top: 22px; }
label { display: grid; gap: 7px; }
label span,
legend { color: var(--muted); font-size: 0.76rem; }
input,
select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--page-bg);
  color: var(--text);
}
fieldset { display: flex; align-items: flex-end; gap: 7px; margin: 0; padding: 0; border: 0; }
legend { position: absolute; transform: translateY(-40px); }
fieldset button,
.filters button {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--page-bg);
  color: var(--muted);
  cursor: pointer;
}
fieldset button.active { border-color: var(--text); color: var(--text); }
.create-actions { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
.form-error { margin: 0 auto 0 0; color: #ef7777; }
.integration-panel { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.articles-panel { overflow: hidden; }
.articles-toolbar { padding: 22px 24px; border-bottom: 1px solid var(--line); }
.filters { display: grid; grid-template-columns: minmax(220px, 1fr) auto auto; gap: 8px; }
.state-message { margin: 0; padding: 48px 24px; color: var(--muted); text-align: center; }
.state-message.error { color: #ef7777; }
.article-list { display: grid; }
.article-card {
  display: grid;
  grid-template-columns: minmax(280px, 1.4fr) minmax(150px, 0.65fr) minmax(180px, 0.8fr) 28px;
  align-items: center;
  gap: 18px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--line);
  transition: background 160ms ease;
}
.article-card:last-child { border-bottom: 0; }
.article-card:hover { background: var(--bg-soft); }
.translation-key { color: var(--muted); font-family: ui-monospace, monospace; font-size: 0.68rem; }
.article-card h3 { margin: 5px 0 0; font-size: 1.05rem; }
.secondary-title { margin: 4px 0 0; color: var(--muted); font-size: 0.8rem; }
.locale-statuses,
.article-card__meta { display: grid; gap: 6px; }
.locale-line { display: grid; grid-template-columns: 28px 7px 1fr; align-items: center; gap: 7px; color: var(--muted); font-size: 0.76rem; }
.locale-line b { color: var(--text); font-size: 0.7rem; }
.locale-line i { width: 7px; height: 7px; border-radius: 50%; }
.status-published { background: #4ade80; }
.status-draft { background: #f2c38b; }
.status-hidden { background: #91b8ff; }
.status-missing { background: #ef7777; }
.article-card__meta { color: var(--muted); font-size: 0.72rem; }
.article-card__meta .warning { color: #d9a85f; }
.article-card__arrow { color: var(--muted); font-size: 1.3rem; }

@media (max-width: 980px) {
  .create-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .article-card { grid-template-columns: minmax(240px, 1fr) minmax(130px, 0.5fr) 24px; }
  .article-card__meta { display: none; }
}
@media (max-width: 700px) {
  .dashboard-hero,
  .panel-heading,
  .articles-toolbar { align-items: stretch; flex-direction: column; }
  .create-grid { grid-template-columns: 1fr; }
  .filters { grid-template-columns: 1fr; }
  .integration-panel { grid-template-columns: 1fr; }
  .create-actions { grid-column: auto; align-items: stretch; flex-direction: column; }
  .article-card { grid-template-columns: 1fr 24px; }
  .locale-statuses { grid-column: 1; grid-row: 2; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .article-card__arrow { grid-column: 2; grid-row: 1 / 3; }
}
</style>
