import type { MiddlewareHandler } from 'hono'
import { logger } from '../lib/logger.js'
import type { AppEnv } from '../server.js'

export const loggingMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = c.req.header('X-Request-Id') ?? crypto.randomUUID()
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)

  const startedAt = Date.now()
  await next()
  const ms = Date.now() - startedAt

  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
      userId: c.get('user')?.id,
    },
    'request',
  )
}
