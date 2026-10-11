import { inspectR2Connection } from '../../utils/r2'

export default defineEventHandler(event => inspectR2Connection(event))
