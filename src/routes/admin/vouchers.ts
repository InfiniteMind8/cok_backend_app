import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Prisma, AttachmentEntityType } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'

export const vouchersRoute = new Hono<AppEnv>()

const createVoucherSchema = z.object({
  recipientId: z.string().min(1),
  amountKcrd: z.string().min(1),
  message: z.string().optional(),
  expiresAt: z.string().optional(),
  attachmentKey: z.string().optional(),
  attachmentName: z.string().optional(),
  attachmentSize: z.number().optional(),
  attachmentMime: z.string().optional(),
})

// ─── POST / — create a voucher request ───────────────────────────────────────
// Stores the request in PENDING state. The admin approve/decline flow
// (mints code, notifies, emails) lives at /v1/admin/voucher-requests/:id/...
vouchersRoute.post('/', zValidator('json', createVoucherSchema), async (c) => {
  const admin = c.get('user')!
  const input = c.req.valid('json')

  const created = await db.$transaction(async (tx) => {
    const request = await tx.voucherRequest.create({
      data: {
        recipientId: input.recipientId,
        amountKcrd: new Prisma.Decimal(input.amountKcrd),
        message: input.message ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        requestedBy: admin.id,
        status: 'PENDING',
      },
    })

    if (
      input.attachmentKey &&
      input.attachmentName &&
      input.attachmentSize !== undefined &&
      input.attachmentMime
    ) {
      await tx.attachment.create({
        data: {
          storageKey: input.attachmentKey,
          mimeType: input.attachmentMime,
          sizeBytes: BigInt(input.attachmentSize),
          name: input.attachmentName,
          entityType: AttachmentEntityType.VOUCHER_REQUEST,
          entityId: request.id,
          fieldName: 'voucherAttachment',
          uploadedBy: admin.id,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        action: 'VOUCHER_CREATED',
        entity: 'VoucherRequest',
        entityId: request.id,
        actorId: admin.id,
        after: {
          recipientId: input.recipientId,
          amountKcrd: input.amountKcrd,
        },
      },
    })

    return request
  })

  return c.json({ ok: true, data: { requestId: created.id } })
})
