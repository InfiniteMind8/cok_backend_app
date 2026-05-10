import * as Sentry from '@sentry/node'
import { env } from './env.js'

let initialized = false

export function initSentry() {
  if (initialized || !env.SENTRY_DSN) return
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENV ?? env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      // Strip PII before transport.
      if (event.user) {
        event.user = { id: event.user.id }
      }
      if (event.request?.cookies) delete event.request.cookies
      if (event.request?.headers?.authorization) {
        event.request.headers = { ...event.request.headers, authorization: '[Redacted]' }
      }
      return event
    },
  })
  initialized = true
}

export function captureException(error: unknown, ctx?: Record<string, unknown>) {
  if (!initialized) return
  Sentry.captureException(error, ctx ? { extra: ctx } : undefined)
}
