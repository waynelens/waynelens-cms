<template>
  <div class="cms-shell">
    <header class="cms-topbar">
      <NuxtLink to="/" class="cms-brand">
        <span class="cms-brand__mark">WJ</span>
        <span>
          <strong>Waynelens CMS</strong>
          <small>Waynelens content workspace</small>
        </span>
      </NuxtLink>

      <div class="cms-topbar__actions">
        <span class="cms-local-badge"><i /> Cloudflare Access</span>
        <a href="https://waynelens.dev" class="cms-public-link" target="_blank" rel="noopener">查看網站</a>
      </div>
    </header>

    <main class="cms-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.cms-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at 10% 0%, rgba(145, 184, 255, 0.14), transparent 28rem),
    radial-gradient(circle at 90% 6%, rgba(242, 195, 139, 0.12), transparent 26rem),
    var(--page-bg);
}

.cms-topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 72px;
  padding: 12px clamp(18px, 4vw, 52px);
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--page-bg) 88%, transparent);
  backdrop-filter: blur(18px);
}

.cms-brand,
.cms-topbar__actions,
.cms-local-badge {
  display: flex;
  align-items: center;
}

.cms-brand { gap: 12px; }
.cms-brand__mark {
  display: grid;
  width: 42px;
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 13px;
  font-family: var(--font-brand);
}
.cms-brand strong,
.cms-brand small { display: block; }
.cms-brand small { margin-top: 2px; color: var(--muted); font-size: 0.72rem; }
.cms-topbar__actions { gap: 12px; }
.cms-local-badge {
  gap: 7px;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(74, 222, 128, 0.1);
  color: #56c87c;
  font-size: 0.75rem;
}
.cms-local-badge i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.cms-public-link { color: var(--muted); font-size: 0.86rem; }
.cms-public-link:hover { color: var(--text); }
.cms-main { width: min(1500px, calc(100% - 36px)); margin: 0 auto; padding: 38px 0 80px; }

@media (max-width: 640px) {
  .cms-topbar { align-items: flex-start; }
  .cms-topbar__actions { align-items: flex-end; flex-direction: column; gap: 6px; }
  .cms-local-badge { font-size: 0.68rem; }
  .cms-main { width: min(100% - 22px, 1500px); padding-top: 24px; }
}
</style>
