import { inspectGitHubConnection } from '../../utils/github'

export default defineEventHandler(event => inspectGitHubConnection(event))
