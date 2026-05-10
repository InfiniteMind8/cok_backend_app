import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../server.js'
import { env } from '../lib/env.js'
import { ApiError } from '../lib/api-error.js'

/**
 * Cron router. All routes are gated by `Authorization: Bearer ${CRON_SECRET}`.
 *
 * SUB-ROUTES TO IMPLEMENT (Phase 2 Block B.4):
 *   - GET /cron/leases          → port from website/app/api/cron/leases/route.ts
 *   - GET /cron/reconciliation  → port from website/app/api/cron/reconciliation/route.ts
 *
 * Schedule these via the deploy host (Vercel cron in vercel.json, OR Fly.io
 * scheduled-machines, OR an external scheduler like cron-job.org).
 */

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

// TODO(phase2-B.4): wire actual handlers.
cronRouter.get('/leases', (c) =>
  c.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR' as const,
        message: 'Cron handler not yet ported (phase2-B.4)',
      },
    },
    501,
  ),
)
cronRouter.get('/reconciliation', (c) =>
  c.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR' as const,
        message: 'Cron handler not yet ported (phase2-B.4)',
      },
    },
    501,
  ),
)
