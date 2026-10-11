export type ContentRepository = {
  owner: string
  repo: string
  branch: string
}

export type CmsHealth = {
  status: 'ready'
  runtime: string
  dataSource: 'GitHub repository'
}
