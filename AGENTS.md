# Repository instructions

- The public website repository `waynelens/waynelens.github.io` is the canonical source for published content.
- Store drafts and published articles in the content repository as Markdown; do not add D1.
- Publishing an article must update its bilingual Markdown files and `data/searchMetadata.ts` in one Git commit.
- Never expose GitHub, Cloudflare, or R2 credentials to client-side code.
- Keep Cloudflare Access authorization on every CMS page and API route in production.
- Use GitHub revision identifiers to reject conflicting writes instead of silently overwriting newer content.
