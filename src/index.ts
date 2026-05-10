import { serve } from '@hono/node-server'
import { app } from './server.js'
import { env } from './lib/env.js'
import { initSentry } from './lib/sentry.js'
import { logger } from './lib/logger.js'

initSentry()

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port, env: env.NODE_ENV }, `cok-api listening on :${info.port}`)
  },
)

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
