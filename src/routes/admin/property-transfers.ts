import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { env } from '../../lib/env.js'
import { ApiError } from '../../lib/api-error.js'
import { sendEmail } from '../../lib/email/service.js'
import { notify } from '../../lib/notifications/service.js'

export const propertyTransfersRoute = new Hono<AppEnv>()

// ─── POST /:id/approve ───────────────────────────────────────────────────────
// Approves a property transfer request: stamps APPROVED, moves the ownership
// row to the new userId, then notifies + emails both parties. The ownership
// move uses updateMany with an explicit count check so a stale or already-
// transferred row fails loudly inside the transaction (rolling everything back).
propertyTransfersRoute.post('/:id/approve', async (c) => {
  const admin = c.get('user')!
  const requestId = c.req.param('id')

  const req = await db.$transaction(async (tx) => {
    const updated = await tx.propertyTransferRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedBy: admin.id, reviewedAt: new Date() },
    })

    if (updated.count !== 1) {
      const current = await tx.propertyTransferRequest.findUnique({
        where: { id: requestId },
        select: { status: true },
      })
      if (!current) throw ApiError.notFound('Request not found')
      throw ApiError.conflict(`Request already processed (status: ${current.status})`)
    }

    const approved = await tx.propertyTransferRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { property: { select: { code: true, address: true } } },
    })

    const ownershipUpdated = await tx.propertyOwnership.updateMany({
      where: { propertyId: approved.propertyId, userId: approved.fromUserId },
      data: { userId: approved.toUserId },
    })
    if (ownershipUpdated.count !== 1) {
      throw new ApiError('CONFLICT', 'Property ownership could not be transferred')
    }

    await tx.auditLog.create({
      data: {
        action: 'PROPERTY_TRANSFER_APPROVED',
        entity: 'PropertyTransferRequest',
        entityId: requestId,
        actorId: admin.id,
        before: { status: 'PENDING' },
        after: { status: 'APPROVED' },
      },
    })

    return approved
  })

  const [fromUser, toUser] = await Promise.all([
    db.user.findUnique({
      where: { id: req.fromUserId },
      select: { email: true, fullName: true },
    }),
    db.user.findUnique({
      where: { id: req.toUserId },
      select: { email: true, fullName: true },
    }),
  ])

  try {
    await Promise.all([
      fromUser &&
        notify({
          userId: req.fromUserId,
          type: 'TRANSFER_APPROVED',
          title: 'Property transfer approved',
          body: `Ownership of ${req.property.code} has been transferred.`,
          link: '/properties',
          priority: 'yellow',
        }),
      toUser &&
        notify({
          userId: req.toUserId,
          type: 'TRANSFER_APPROVED',
          title: 'Property ownership received',
          body: `You are now the owner of ${req.property.code}.`,
          link: '/properties',
          priority: 'yellow',
        }),
    ])
  } catch {
    // non-fatal
  }

  const emailBase = {
    propertyCode: req.property.code,
    propertyAddress: req.property.address ?? undefined,
    decision: 'approved' as const,
    requestId,
    dashboardUrl: `${env.APP_URL}/properties`,
  }

  if (fromUser) {
    sendEmail({
      to: fromUser.email,
      subject: `Property transfer approved — ${req.property.code}`,
      template: 'property-transfer-decision',
      data: { ...emailBase, recipientName: fromUser.fullName },
      idempotencyKey: `transfer-approved-from:${requestId}`,
    }).catch(() => {})
  }

  if (toUser) {
    sendEmail({
      to: toUser.email,
      subject: `Property transfer approved — ${req.property.code}`,
      template: 'property-transfer-decision',
      data: { ...emailBase, recipientName: toUser.fullName },
      idempotencyKey: `transfer-approved-to:${requestId}`,
    }).catch(() => {})
  }

  return c.json({ ok: true, data: { requestId } })
})

// ─── POST /:id/decline ───────────────────────────────────────────────────────
const declineSchema = z.object({
  reason: z.string().min(1, 'Decline reason is required'),
})

propertyTransfersRoute.post(
  '/:id/decline',
  zValidator('json', declineSchema),
  async (c) => {
    const admin = c.get('user')!
    const requestId = c.req.param('id')
    const { reason } = c.req.valid('json')

    const req = await db.$transaction(async (tx) => {
      const updated = await tx.propertyTransferRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'DECLINED',
          declinedReason: reason.trim(),
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        },
      })

      if (updated.count !== 1) {
        const current = await tx.propertyTransferRequest.findUnique({
          where: { id: requestId },
          select: { status: true },
        })
        if (!current) throw ApiError.notFound('Request not found')
        throw ApiError.conflict(`Request already processed (status: ${current.status})`)
      }

      await tx.auditLog.create({
        data: {
          action: 'PROPERTY_TRANSFER_DECLINED',
          entity: 'PropertyTransferRequest',
          entityId: requestId,
          actorId: admin.id,
          before: { status: 'PENDING' },
          after: { status: 'DECLINED', declinedReason: reason.trim() },
        },
      })

      return tx.propertyTransferRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { property: { select: { code: true, address: true } } },
      })
    })

    const requester = await db.user.findUnique({
      where: { id: req.requestedBy },
      select: { id: true, email: true, fullName: true },
    })

    if (requester) {
      try {
        await notify({
          userId: requester.id,
          type: 'TRANSFER_DECLINED',
          title: 'Property transfer declined',
          body: `Transfer of ${req.property.code} was not approved.`,
          link: '/admin/approvals',
          priority: 'yellow',
        })
      } catch {
        // non-fatal
      }

      sendEmail({
        to: requester.email,
        subject: `Property transfer declined — ${req.property.code}`,
        template: 'property-transfer-decision',
        data: {
          recipientName: requester.fullName,
          propertyCode: req.property.code,
          propertyAddress: req.property.address ?? undefined,
          decision: 'declined',
          declineReason: reason.trim(),
          requestId,
          dashboardUrl: `${env.APP_URL}/admin/approvals`,
        },
        idempotencyKey: `transfer-declined:${requestId}`,
      }).catch(() => {})
    }

    return c.json({ ok: true, data: { requestId } })
  },
)
