import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { env } from '../../lib/env.js'
import { ApiError } from '../../lib/api-error.js'
import { sendEmail } from '../../lib/email/service.js'
import { notify } from '../../lib/notifications/service.js'
import {
  approveSettlement,
  declineSettlement,
  executeSettlement,
} from '../../lib/ledger/settlements.js'

export const settlementsRoute = new Hono<AppEnv>()

// Inherits MASTER_ADMIN gate from the parent admin router (Phase 1+ D-D4-01).
// All settlement decision side effects (notify + email) are best-effort —
// they wrap try/catch so a downstream provider outage doesn't roll back the
// underlying ledger update.

// ─── POST /:id/approve ───────────────────────────────────────────────────────
settlementsRoute.post('/:id/approve', async (c) => {
  const admin = c.get('user')!
  const settlementId = c.req.param('id')

  const settlement = await approveSettlement({ settlementId, approvedBy: admin.id })

  const user = await db.user.findUnique({
    where: { id: settlement.userId },
    select: { email: true, fullName: true },
  })

  try {
    await notify({
      userId: settlement.userId,
      type: 'SETTLEMENT_APPROVED',
      title: 'Settlement request approved',
      body: 'Your request has been approved and will be processed shortly.',
      link: '/wallet/settlements',
      priority: 'yellow',
    })
  } catch {
    // non-fatal
  }

  if (user) {
    sendEmail({
      to: user.email,
      subject: 'Your settlement request has been approved',
      template: 'settlement-confirmation',
      data: {
        recipientName: user.fullName,
        amountKcrd: settlement.amount.toString(),
        status: 'approved',
        settlementId,
        historyUrl: `${env.APP_URL}/wallet/settlements`,
      },
      idempotencyKey: `settlement-approved:${settlementId}`,
    }).catch(() => {})
  }

  return c.json({ ok: true, data: { settlementId } })
})

// ─── POST /:id/decline ───────────────────────────────────────────────────────
const declineSchema = z.object({
  reason: z.string().min(1, 'A reason is required when declining'),
})

settlementsRoute.post(
  '/:id/decline',
  zValidator('json', declineSchema),
  async (c) => {
    const admin = c.get('user')!
    const settlementId = c.req.param('id')
    const { reason } = c.req.valid('json')

    const settlement = await db.settlementRequest.findUniqueOrThrow({
      where: { id: settlementId },
      select: { userId: true, amount: true },
    })

    const user = await db.user.findUnique({
      where: { id: settlement.userId },
      select: { email: true, fullName: true },
    })

    await declineSettlement({ settlementId, declinedBy: admin.id, reason })

    if (user) {
      sendEmail({
        to: user.email,
        subject: 'Your settlement request was declined',
        template: 'settlement-confirmation',
        data: {
          recipientName: user.fullName,
          amountKcrd: settlement.amount.toString(),
          status: 'declined',
          declineReason: reason,
          settlementId,
          historyUrl: `${env.APP_URL}/wallet/settlements`,
        },
        idempotencyKey: `settlement-declined:${settlementId}`,
      }).catch(() => {})
    }

    return c.json({ ok: true, data: { settlementId } })
  },
)

// ─── POST /:id/execute ───────────────────────────────────────────────────────
const executeSchema = z.object({
  proofUrl: z.string().optional(),
})

settlementsRoute.post(
  '/:id/execute',
  zValidator('json', executeSchema),
  async (c) => {
    const admin = c.get('user')!
    const settlementId = c.req.param('id')
    const { proofUrl } = c.req.valid('json')

    const { userId, amount } = await db.settlementRequest.findUniqueOrThrow({
      where: { id: settlementId },
      select: { userId: true, amount: true },
    })

    await executeSettlement({
      settlementId,
      settledBy: admin.id,
      proofUrl,
      idempotencyKey: settlementId,
    })

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true },
    })

    try {
      await notify({
        userId,
        type: 'SETTLEMENT_SETTLED',
        title: 'Settlement completed',
        body: proofUrl
          ? 'Payment processed. View proof in your settlement history.'
          : 'Your settlement has been processed.',
        link: '/wallet/settlements',
        priority: 'yellow',
      })
    } catch {
      // non-fatal
    }

    if (user) {
      sendEmail({
        to: user.email,
        subject: 'Your settlement has been processed',
        template: 'settlement-confirmation',
        data: {
          recipientName: user.fullName,
          amountKcrd: amount.toString(),
          status: 'settled',
          settlementId,
          historyUrl: `${env.APP_URL}/wallet/settlements`,
        },
        idempotencyKey: `settlement-settled:${settlementId}`,
      }).catch(() => {})
    }

    return c.json({ ok: true, data: { settlementId } })
  },
)
