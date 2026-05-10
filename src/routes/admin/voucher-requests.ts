import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { env } from '../../lib/env.js'
import { ApiError } from '../../lib/api-error.js'
import { sendEmail } from '../../lib/email/service.js'
import { notify } from '../../lib/notifications/service.js'

export const voucherRequestsRoute = new Hono<AppEnv>()

function generateVoucherCode(): string {
  return `KCRD-${randomBytes(4).toString('hex').toUpperCase()}`
}

// ─── POST /:id/approve ───────────────────────────────────────────────────────
// Generates a fresh voucher code, stamps the request APPROVED in a single
// transaction with the audit row, then emails + notifies the recipient.
voucherRequestsRoute.post('/:id/approve', async (c) => {
  const admin = c.get('user')!
  const requestId = c.req.param('id')
  const voucherCode = generateVoucherCode()

  const req = await db.$transaction(async (tx) => {
    const updated = await tx.voucherRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        voucherCode,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
    })

    if (updated.count !== 1) {
      const current = await tx.voucherRequest.findUnique({
        where: { id: requestId },
        select: { status: true },
      })
      if (!current) throw ApiError.notFound('Request not found')
      throw ApiError.conflict(`Request already processed (status: ${current.status})`)
    }

    await tx.auditLog.create({
      data: {
        action: 'VOUCHER_REQUEST_APPROVED',
        entity: 'VoucherRequest',
        entityId: requestId,
        actorId: admin.id,
        before: { status: 'PENDING' },
        after: { status: 'APPROVED', voucherCode },
      },
    })

    return tx.voucherRequest.findUniqueOrThrow({ where: { id: requestId } })
  })

  const recipient = await db.user.findUnique({
    where: { id: req.recipientId },
    select: { email: true, fullName: true },
  })

  try {
    await notify({
      userId: req.recipientId,
      type: 'VOUCHER_RECEIVED',
      title: 'You received a K Credit voucher',
      body: `A voucher for ${req.amountKcrd} KCRD has been issued to your account.`,
      link: '/wallet',
      priority: 'yellow',
    })
  } catch {
    // non-fatal
  }

  if (recipient) {
    sendEmail({
      to: recipient.email,
      subject: `Your K Credit voucher — ${req.amountKcrd} KCRD`,
      template: 'voucher-delivery',
      data: {
        recipientName: recipient.fullName,
        voucherCode,
        amountKcrd: req.amountKcrd.toString(),
        description:
          req.description ?? req.message ?? 'A voucher has been issued to your account.',
        expiresAt: req.expiresAt
          ? req.expiresAt.toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : undefined,
        redeemUrl: `${env.APP_URL}/wallet`,
      },
      idempotencyKey: `voucher-approved:${requestId}`,
    }).catch(() => {})
  }

  return c.json({ ok: true, data: { requestId, voucherCode } })
})

// ─── POST /:id/decline ───────────────────────────────────────────────────────
const declineSchema = z.object({
  reason: z.string().min(1, 'Decline reason is required'),
})

voucherRequestsRoute.post(
  '/:id/decline',
  zValidator('json', declineSchema),
  async (c) => {
    const admin = c.get('user')!
    const requestId = c.req.param('id')
    const { reason } = c.req.valid('json')

    const req = await db.$transaction(async (tx) => {
      const updated = await tx.voucherRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'DECLINED',
          declinedReason: reason.trim(),
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        },
      })

      if (updated.count !== 1) {
        const current = await tx.voucherRequest.findUnique({
          where: { id: requestId },
          select: { status: true },
        })
        if (!current) throw ApiError.notFound('Request not found')
        throw ApiError.conflict(`Request already processed (status: ${current.status})`)
      }

      await tx.auditLog.create({
        data: {
          action: 'VOUCHER_REQUEST_DECLINED',
          entity: 'VoucherRequest',
          entityId: requestId,
          actorId: admin.id,
          before: { status: 'PENDING' },
          after: { status: 'DECLINED', declinedReason: reason.trim() },
        },
      })

      return tx.voucherRequest.findUniqueOrThrow({ where: { id: requestId } })
    })

    try {
      await notify({
        userId: req.requestedBy,
        type: 'VOUCHER_DECLINED',
        title: 'Voucher request declined',
        body: `The voucher request for ${req.amountKcrd} KCRD was not approved.`,
        link: '/admin/approvals',
        priority: 'yellow',
      })
    } catch {
      // non-fatal
    }

    return c.json({ ok: true, data: { requestId } })
  },
)
