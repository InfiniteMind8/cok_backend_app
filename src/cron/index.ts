import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../server.js'
import { env } from '../lib/env.js'
import { ApiError } from '../lib/api-error.js'
import { runLeasesCron } from './leases.js'
import { runReconciliationCron } from './reconciliation.js'

// All routes are gated by `Authorization: Bearer ${CRON_SECRET}`.
// Schedule via the deploy host (Vercel cron, Fly.io scheduled-machines,
// or an external scheduler like cron-job.org).
const requireCronSecret: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!env.CRON_SECRET) {
    throw new ApiError('INTERNAL_ERROR', 'CRON_SECRET not configured')
  }
  const auth = c.req.header('Authorization')
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    throw ApiError.unauthorized('Cron endpoint requires Authorization: Bearer <CRON_SECRET>')
  }
  await next()
}

export const cronRouter = new Hono<AppEnv>()
cronRouter.use('*', requireCronSecret)

cronRouter.get('/leases', async (c) => {
  const result = await runLeasesCron()
  return c.json({ ok: true, data: result })
})

cronRouter.get('/reconciliation', async (c) => {
  const result = await runReconciliationCron()
  return c.json({ ok: true, data: result })
})
