import { Hono } from 'hono'
import type { Context } from 'hono'
import { corsMiddleware } from './middleware/cors.js'
import { loggingMiddleware } from './middleware/logging.js'
import { errorMiddleware } from './middleware/error.js'
import { requireAuth } from './middleware/auth.js'
import { healthRoute } from './routes/system/health.js'
import { meRoute } from './routes/system/me.js'
import { attachmentsRoute } from './routes/system/attachments.js'
import { authRoute } from './routes/system/auth.js'
import { sentryTestRoute } from './routes/system/sentry-test.js'
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

// Attachments (mixed auth: /serve uses HMAC token, /upload uses requireAuth
// at the route level — must NOT be under the global /v1 requireAuth gate
// because /serve has no JWT).
app.route('/v1/attachments', attachmentsRoute)

// Demo-only Clerk sign-in token mint (404 in production; rate-limited per IP).
app.route('/v1/auth', authRoute)

// Authenticated routes
app.use('/v1/me/*', requireAuth)
app.use('/v1/admin/*', requireAuth)
app.use('/v1/resident/*', requireAuth)
app.use('/v1/system/*', requireAuth)
app.route('/v1/me', meRoute)
app.route('/v1/admin', adminRouter)
app.route('/v1/resident', residentRouter)
app.route('/v1/system/sentry-test', sentryTestRoute)

// 404 fallback
app.notFound((c: Context) => {
  return c.json(
    { ok: false, error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` } },
    404,
  )
})
