import { Hono } from 'hono'
import type { Context } from 'hono'
import { corsMiddleware } from './middleware/cors.js'
import { loggingMiddleware } from './middleware/logging.js'
import { errorMiddleware } from './middleware/error.js'
import { requireAuth } from './middleware/auth.js'
import { healthRoute } from './routes/system/health.js'
import { meRoute } from './routes/system/me.js'
import { adminRouter } from './routes/admin/index.js'
import { residentRouter } from './routes/resident/index.js'
import { clerkWebhookRoute } from './webhooks/clerk.js'
import { cronRouter } from './cron/index.js'

export type AppEnv = {
  Variables: {
    requestId: string
    user?: { id: string; role: string; email?: string }
  }
}

export const app = new Hono<AppEnv>()

// Global middleware (order matters: logging first to capture everything,
// CORS next so preflight works, error last so it can format any throw).
app.use('*', loggingMiddleware)
app.use('*', corsMiddleware)
app.onError(errorMiddleware)

// Public routes
app.route('/health', healthRoute)

// Webhook routes (signed; auth handled internally by svix)
app.route('/webhooks/clerk', clerkWebhookRoute)

// Cron routes (gated by CRON_SECRET bearer in route-level middleware)
app.route('/cron', cronRouter)

// Authenticated routes
app.use('/v1/*', requireAuth)
app.route('/v1/me', meRoute)
app.route('/v1/admin', adminRouter)
app.route('/v1/resident', residentRouter)

// 404 fallback
app.notFound((c: Context) => {
  return c.json(
    { ok: false, error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` } },
    404,
  )
})
