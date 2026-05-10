import type { ErrorHandler } from 'hono'
import { ZodError } from 'zod'
import { ApiError } from '../lib/api-error.js'
import { captureException } from '../lib/sentry.js'
import { logger } from '../lib/logger.js'
import type { AppEnv } from '../server.js'

export const errorMiddleware: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId')

  if (err instanceof ApiError) {
    return c.json(
      {
        ok: false,
        error: { code: err.code, message: err.message, details: err.details },
        requestId,
      },
      err.status as 400 | 401 | 403 | 404 | 409 | 429 | 500,
    )
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR' as const,
          message: 'Invalid request',
          details: err.issues,
        },
        requestId,
      },
      400,
    )
  }

  // Unexpected error: log + Sentry, return generic 500.
  logger.error({ err, requestId, path: c.req.path, method: c.req.method }, 'unhandled error')
  captureException(err, { requestId, path: c.req.path, method: c.req.method })

  return c.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR' as const,
        message: 'Something went wrong. The error has been logged.',
      },
      requestId,
    },
    500,
  )
}
