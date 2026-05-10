import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import { ApiError } from '../../lib/api-error.js'
import { resendEmailById } from '../../lib/email/service.js'

export const emailRoute = new Hono<AppEnv>()

// ─── POST /:logId/resend ─────────────────────────────────────────────────────
// Re-dispatches a previously-logged email. The lib handles status checks
// (already-SENT short-circuits to 200, missing HTML returns a clear error)
// and stores the new dispatch result on the same EmailLog row.
emailRoute.post('/:logId/resend', async (c) => {
  const logId = c.req.param('logId')
  const result = await resendEmailById(logId)
  if (!result.ok) {
    throw new ApiError('INTERNAL_ERROR', `Email resend failed: ${result.error}`)
  }
  return c.json({
    ok: true,
    data: { logId, messageId: result.messageId, skipped: result.skipped ?? false },
  })
})
