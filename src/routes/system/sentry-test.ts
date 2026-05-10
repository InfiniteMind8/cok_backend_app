import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import { requireRole } from '../../middleware/auth.js'

// Smoke test for Sentry wiring. Throws an Error so the global error
// middleware reports it to Sentry with the masterAdmin's user context.
export const sentryTestRoute = new Hono<AppEnv>()

sentryTestRoute.use('*', requireRole('MASTER_ADMIN'))

sentryTestRoute.get('/', (c) => {
  const user = c.get('user')
  throw new Error(
    `Sentry integration test — triggered by ${user?.role ?? 'unknown'} at ${new Date().toISOString()}`,
  )
})
