import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'
import { resendEmailById } from '../../lib/email/service.js'

export const emailRoute = new Hono<AppEnv>()

// ─── GET / — paginated email log ─────────────────────────────────────────────
// Backs /admin/email-log. Optional `status` filter (SENT | FAILED | QUEUED).
// Always returns aggregate counts so the page can render summary chips
// without a second round-trip.
emailRoute.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
  const pageSize = 50
  const skip = (page - 1) * pageSize
  const status = c.req.query('status')

  const where =
    status && ['SENT', 'FAILED', 'QUEUED'].includes(status)
      ? { status: status as 'SENT' | 'FAILED' | 'QUEUED' }
      : {}

  const [logs, total, counts] = await Promise.all([
    db.emailLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.emailLog.count({ where }),
    db.emailLog.groupBy({ by: ['status'], _count: { id: true } }),
  ])

  return c.json({
    ok: true,
    data: {
      logs: logs.map((l) => ({
        id: l.id,
        recipient: l.recipient,
        subject: l.subject,
        template: l.template,
        status: l.status,
        sentAt: l.sentAt ? l.sentAt.toISOString() : null,
        createdAt: l.createdAt.toISOString(),
        providerError: l.providerError,
      })),
      total,
      page,
      pageSize,
      counts: Object.fromEntries(counts.map((c2) => [c2.status, c2._count.id])),
    },
  })
})

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
