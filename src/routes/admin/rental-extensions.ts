import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { env } from '../../lib/env.js'
import { ApiError } from '../../lib/api-error.js'
import { sendEmail } from '../../lib/email/service.js'
import { computeNextPaymentDue } from '../../lib/lease/cycle.js'

export const rentalExtensionsRoute = new Hono<AppEnv>()

// Resident-side `requestExtension` lives at POST /v1/resident/property/extension-request.
// This module handles the admin approve/decline pair — both MASTER_ADMIN-only
// per Phase 1+ D-D4-01, inherited from the parent admin router.

// ─── POST /:id/approve ───────────────────────────────────────────────────────
const approveSchema = z.object({
  note: z.string().optional(),
})

rentalExtensionsRoute.post(
  '/:id/approve',
  zValidator('json', approveSchema),
  async (c) => {
    const admin = c.get('user')!
    const requestId = c.req.param('id')
    const { note } = c.req.valid('json')

    const today = new Date()

    const extensionRequest = await db.$transaction(async (tx) => {
      const updated = await tx.rentalExtensionRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          reviewedById: admin.id,
          reviewedAt: today,
          decisionNote: note ?? null,
        },
      })

      if (updated.count !== 1) {
        const current = await tx.rentalExtensionRequest.findUnique({
          where: { id: requestId },
          select: { status: true },
        })
        if (!current) throw ApiError.notFound('Request not found')
        throw ApiError.conflict(`Request already processed (status: ${current.status})`)
      }

      const approvedRequest = await tx.rentalExtensionRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: {
          tenancy: { include: { property: { select: { code: true } } } },
          requestedBy: { select: { id: true, email: true, fullName: true } },
        },
      })

      const tenancy = approvedRequest.tenancy
      const newEndDate = approvedRequest.requestedNewEndDate
      const newNextPaymentDue = tenancy.startDate
        ? computeNextPaymentDue(tenancy.startDate, tenancy.cycleUnit, today)
        : null
      const newLeaseStatus =
        tenancy.leaseStatus === 'ENDING_SOON' ? 'ACTIVE' : tenancy.leaseStatus

      await tx.propertyTenancy.update({
        where: { id: tenancy.id },
        data: {
          endDate: newEndDate,
          ...(newNextPaymentDue ? { nextPaymentDue: newNextPaymentDue } : {}),
          leaseStatus: newLeaseStatus,
        },
      })

      await tx.auditLog.create({
        data: {
          action: 'EXTENSION_APPROVED',
          entity: 'RentalExtensionRequest',
          entityId: requestId,
          actorId: admin.id,
          before: {
            status: 'PENDING',
            endDate: tenancy.endDate?.toISOString() ?? null,
            leaseStatus: tenancy.leaseStatus,
          },
          after: {
            status: 'APPROVED',
            endDate: newEndDate.toISOString(),
            leaseStatus: newLeaseStatus,
            nextPaymentDue: newNextPaymentDue?.toISOString() ?? null,
          },
        },
      })

      return approvedRequest
    })

    const tenancy = extensionRequest.tenancy
    const newEndDate = extensionRequest.requestedNewEndDate

    sendEmail({
      template: 'rental-extension-decision',
      to: extensionRequest.requestedBy.email,
      subject: `Rental extension approved — ${tenancy.property.code}`,
      data: {
        residentName: extensionRequest.requestedBy.fullName,
        propertyCode: tenancy.property.code,
        decision: 'approved',
        newEndDate: newEndDate.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        decisionNote: note ?? undefined,
        leaseUrl: `${env.APP_URL}/property`,
      },
      idempotencyKey: `extension-approved:${requestId}`,
    }).catch(() => {})

    return c.json({ ok: true, data: { requestId } })
  },
)

// ─── POST /:id/decline ───────────────────────────────────────────────────────
const declineSchema = z.object({
  note: z.string().min(1, 'A reason is required when declining'),
})

rentalExtensionsRoute.post(
  '/:id/decline',
  zValidator('json', declineSchema),
  async (c) => {
    const admin = c.get('user')!
    const requestId = c.req.param('id')
    const { note } = c.req.valid('json')

    const today = new Date()

    const extensionRequest = await db.$transaction(async (tx) => {
      const updated = await tx.rentalExtensionRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'DECLINED',
          reviewedById: admin.id,
          reviewedAt: today,
          decisionNote: note,
        },
      })

      if (updated.count !== 1) {
        const current = await tx.rentalExtensionRequest.findUnique({
          where: { id: requestId },
          select: { status: true },
        })
        if (!current) throw ApiError.notFound('Request not found')
        throw ApiError.conflict(`Request already processed (status: ${current.status})`)
      }

      await tx.auditLog.create({
        data: {
          action: 'EXTENSION_DECLINED',
          entity: 'RentalExtensionRequest',
          entityId: requestId,
          actorId: admin.id,
          before: { status: 'PENDING' },
          after: { status: 'DECLINED', decisionNote: note },
        },
      })

      return tx.rentalExtensionRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: {
          tenancy: { include: { property: { select: { code: true } } } },
          requestedBy: { select: { id: true, email: true, fullName: true } },
        },
      })
    })

    sendEmail({
      template: 'rental-extension-decision',
      to: extensionRequest.requestedBy.email,
      subject: `Rental extension request — ${extensionRequest.tenancy.property.code}`,
      data: {
        residentName: extensionRequest.requestedBy.fullName,
        propertyCode: extensionRequest.tenancy.property.code,
        decision: 'declined',
        decisionNote: note,
        leaseUrl: `${env.APP_URL}/property`,
      },
      idempotencyKey: `extension-declined:${requestId}`,
    }).catch(() => {})

    return c.json({ ok: true, data: { requestId } })
  },
)
