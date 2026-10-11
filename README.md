# Waynelens CMS

Private content management application for the Waynelens photography site.

## Architecture

- Nuxt 4, Vue 3, and TypeScript
- Nitro `cloudflare_module` preset for Cloudflare Workers
- Cloudflare Access for authentication (planned)
- Cloudflare D1 for working drafts and audit history (planned)
- Cloudflare R2 for media uploads (planned)
- GitHub as the canonical published-content source

The CMS will read and publish bilingual Markdown in
[`waynelens/waynelens.github.io`](https://github.com/waynelens/waynelens.github.io).
Published changes must update the paired Markdown files and
`data/searchMetadata.ts` in one Git commit.

## Local development

Requirements:

- Node.js 24
- npm 11

```powershell
npm install
npm run dev
```

The development server uses `http://localhost:3001` so it can run alongside the
website on port 3000.

## Validation

```powershell
npm run typecheck
npm run build
```

After a Cloudflare account is connected, use `npm run preview` for a local
Workers-runtime preview and `npm run deploy` for deployment.

Secrets must be stored in Cloudflare Workers Secrets or local ignored files;
never commit GitHub or R2 credentials.
