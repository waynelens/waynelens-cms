<script setup lang="ts">
const { data: health } = await useFetch('/api/health')
</script>

<template>
  <main class="shell">
    <section class="card">
      <p class="eyebrow">WAYNELENS</p>
      <h1>CMS 初始化完成</h1>
      <p>
        這個獨立 Nuxt 應用將透過 Cloudflare Workers 運行，正式文章以
        <code>waynelens/waynelens.github.io</code> 為主要資料來源。
      </p>
      <dl>
        <div><dt>Runtime</dt><dd>{{ health?.runtime || 'loading' }}</dd></div>
        <div><dt>Data source</dt><dd>{{ health?.dataSource || 'loading' }}</dd></div>
        <div><dt>Status</dt><dd>{{ health?.status || 'loading' }}</dd></div>
      </dl>
    </section>
  </main>
</template>

<style scoped>
.shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.card { width: min(100%, 720px); padding: clamp(28px, 6vw, 64px); border: 1px solid #2d3436; border-radius: 24px; background: rgb(20 24 25 / 92%); box-shadow: 0 28px 80px rgb(0 0 0 / 30%); }
.eyebrow { margin: 0 0 12px; color: #86b9a5; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.18em; }
h1 { margin: 0; font-size: clamp(2rem, 7vw, 4rem); line-height: 1; }
p { color: #b8c0c2; line-height: 1.75; }
code { color: #d9ebe4; }
dl { display: grid; gap: 10px; margin: 32px 0 0; }
dl div { display: grid; grid-template-columns: 120px 1fr; gap: 16px; padding: 12px 0; border-top: 1px solid #2d3436; }
dt { color: #7f8a8d; }
dd { margin: 0; }
@media (max-width: 520px) { dl div { grid-template-columns: 1fr; gap: 4px; } }
</style>
