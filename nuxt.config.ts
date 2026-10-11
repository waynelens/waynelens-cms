export default defineNuxtConfig({
  compatibilityDate: '2026-10-11',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  nitro: {
    preset: 'cloudflare_module'
  },
  app: {
    head: {
      title: 'Waynelens CMS',
      meta: [
        { name: 'description', content: 'Private content management interface for Waynelens.' },
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  }
})
