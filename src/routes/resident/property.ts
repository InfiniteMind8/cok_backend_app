import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'
import { requireRole } from '../../middleware/auth.js'
import { notifyAllOfRole } from '../../lib/notifications/service.js'

export const residentPropertyRoute = new Hono<AppEnv>()

// ─── POST /property/extension-request ────────────────────────────────────────
// Resident requests an extension on their tenancy. Admin approval/decline
// for these requests will be ported to routes/admin/rental-extensions.ts in
// Phase 3.
const requestExtensionSchema = z.object({
  tenancyId: z.string().min(1),
  requestedNewEndDate: z.string().min(1),
  reason: z.string().optional(),
})

residentPropertyRoute.post(
  '/extension-request',
  requireRole('RESIDENT'),
  zValidator('json', requestExtensionSchema),
  async (c) => {
    const user = c.get('user')!
    const { tenancyId, requestedNewEndDate, reason } = c.req.valid('json')

    const newEnd = new Date(requestedNewEndDate)
    if (isNaN(newEnd.getTime())) throw ApiError.validation('Invalid date')

    const tenancy = await db.propertyTenancy.findUniqueOrThrow({
      where: { id: tenancyId },
      include: { property: { select: { code: true } } },
    })

    if (tenancy.userId !== user.id) throw ApiError.forbidden()

    if (tenancy.endDate && newEnd <= tenancy.endDate) {
      throw ApiError.validation('Requested end date must be after the current end date')
    }

    const request = await db.$transaction(async (tx) => {
      const req = await tx.rentalExtensionRequest.create({
        data: {
          tenancyId,
          requestedById: user.id,
          requestedNewEndDate: newEnd,
          reason: reason ?? null,
          status: 'PENDING',
        },
      })

      await tx.auditLog.create({
        data: {
          action: 'EXTENSION_REQUEST',
          entity: 'RentalExtensionRequest',
          entityId: req.id,
          actorId: user.id,
          after: {
            tenancyId,
            requestedNewEndDate: newEnd.toISOString(),
            reason: reason ?? null,
          },
        },
      })

      return req
    })

    // Notify master admins. Best-effort — must not fail the request.
    try {
      const fullName = (await db.user.findUnique({
        where: { id: user.id },
        select: { fullName: true },
      }))?.fullName ?? 'A resident'
      await notifyAllOfRole(['MASTER_ADMIN'], {
        type: 'RENTAL_EXTENSION_REQUEST',
        title: 'New rental extension request',
        body: `${fullName} has requested a lease extension for property ${tenancy.property.code}.`,
        link: '/admin/approvals?tab=rental-extensions',
        priority: 'yellow',
      })
    } catch {
      // non-fatal
    }

    return c.json({ ok: true, data: { requestId: request.id } })
  },
)
