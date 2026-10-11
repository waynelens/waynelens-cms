# Waynelens CMS

Private content management application for the Waynelens photography site.

## Architecture

- Nuxt 4, Vue 3, and TypeScript
- Nitro `cloudflare_module` preset for Cloudflare Workers
- Cloudflare Access protects every CMS page and API route
- GitHub App authentication with short-lived installation tokens
- Cloudflare R2 binding for hash-addressed media uploads
- GitHub is the canonical source for drafts and published content; D1 is not used

The CMS will read and publish bilingual Markdown in
[`waynelens/waynelens.github.io`](https://github.com/waynelens/waynelens.github.io).
Every manual save updates the paired Markdown files and `data/searchMetadata.ts`
in one Git commit. The current repository revision is checked before writing so
an older browser tab cannot silently overwrite newer content.

## Local development

Requirements:

- Node.js 24
- npm 11

```powershell
npm install
npm run dev
```

The development server uses `http://localhost:3001` so it can run alongside the
website on port 3000. Copy `.env.example` to an ignored `.env` for local GitHub
API testing. R2 bindings are available through Wrangler/Cloudflare, not plain
Nuxt development mode.

## Validation

```powershell
npm run typecheck
npm run build
```

Use `npm run preview` for a local Workers-runtime preview and `npm run deploy`
for deployment. Production is deployed automatically by Cloudflare Workers
Builds when `main` changes.

Secrets must be stored in Cloudflare Workers Secrets or local ignored files;
never commit GitHub or R2 credentials.
