import type { CmsSearchMetadata } from '~~/shared/types/cms'

const unescapeString = (value: string) => value.replace(/\\([\\'rn])/gu, (_match, character: string) => {
  if (character === 'r') return '\r'
  if (character === 'n') return '\n'
  return character
})

const parseStringArray = (source: string) => {
  const values: string[] = []
  const pattern = /'((?:\\.|[^'])*)'/gu
  let match = pattern.exec(source)
  while (match) {
    values.push(unescapeString(match[1] || ''))
    match = pattern.exec(source)
  }
  return values
}

export const parseSearchMetadata = (content: string) => {
  const entries: Record<string, CmsSearchMetadata> = {}
  const pattern = /^  '((?:\\.|[^'])+)': \{\r?\n    en: ([\s\S]*?),\r?\n    'zh-TW': ([\s\S]*?)\r?\n  \}(?:,|$)/gmu
  let match = pattern.exec(content)
  while (match) {
    entries[unescapeString(match[1] || '')] = {
      en: parseStringArray(match[2] || ''),
      'zh-TW': parseStringArray(match[3] || '')
    }
    match = pattern.exec(content)
  }
  if (!Object.keys(entries).length && /export const searchMetadata/u.test(content)) {
    throw new Error('Unable to parse data/searchMetadata.ts')
  }
  return entries
}

const quote = (value: string) => `'${value
  .replaceAll('\\', '\\\\')
  .replaceAll("'", "\\'")
  .replaceAll('\r', '\\r')
  .replaceAll('\n', '\\n')}'`

const renderList = (values: string[]) => values.length
  ? `[\n${values.map(value => `      ${quote(value)}`).join(',\n')}\n    ]`
  : '[]'

export const renderSearchMetadata = (entries: Record<string, CmsSearchMetadata>) => {
  const blocks = Object.entries(entries).map(([key, value]) => `  ${quote(key)}: {
    en: ${renderList(value.en)},
    'zh-TW': ${renderList(value['zh-TW'])}
  }`)
  return `import type { SearchLocale } from '~/utils/search'\n\n`
    + `type LocalizedSearchMetadata = Record<SearchLocale, string[]>\n\n`
    + `export const searchMetadata: Record<string, LocalizedSearchMetadata> = {\n`
    + `${blocks.join(',\n')}\n}\n`
}
