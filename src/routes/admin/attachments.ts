import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'

// MASTER_ADMIN-only attachment management. The "get URL" endpoint lives at
// /v1/attachments/:id/url instead of here because it must be reachable by
// the uploader (any role) too — see src/routes/system/attachments.ts.
export const adminAttachmentsRoute = new Hono<AppEnv>()

// ─── POST /:id/delete ────────────────────────────────────────────────────────
// Soft contract: deletes the Attachment row and writes an audit entry. The
// underlying storage object is NOT deleted — that's intentional, mirrors the
// website's behaviour, and lets us recover from accidental deletes.
adminAttachmentsRoute.post('/:id/delete', async (c) => {
  const admin = c.get('user')!
  const attachmentId = c.req.param('id')

  const attachment = await db.attachment.findUniqueOrThrow({
    where: { id: attachmentId },
  })

  await db.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id: attachmentId } })
    await tx.auditLog.create({
      data: {
        action: 'DELETE_ATTACHMENT',
        entity: 'Attachment',
        entityId: attachment.id,
        actorId: admin.id,
        before: {
          attachmentId: attachment.id,
          name: attachment.name,
          entityType: attachment.entityType,
          entityId: attachment.entityId,
        },
      },
    })
  })

  return c.json({ ok: true, data: { attachmentId } })
})
