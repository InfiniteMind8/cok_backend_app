import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { type AnnouncementSeverity } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { createAuditEntry } from '../../lib/audit/index.js'
import { sendEmail } from '../../lib/email/service.js'

export const broadcastRoute = new Hono<AppEnv>()

const CHUNK_SIZE = 50

function subjectPrefix(severity: AnnouncementSeverity): string {
  if (severity === 'CRITICAL') return '[CRITICAL] '
  if (severity === 'URGENT') return '[URGENT] '
  return '[INFO] '
}

const sendBroadcastSchema = z.object({
  title: z.string().min(1).max(80, 'Title must be 80 characters or fewer'),
  body: z.string().min(1).max(2000, 'Body must be 2000 characters or fewer'),
  severity: z.enum(['INFO', 'URGENT', 'CRITICAL']),
})

// ─── POST /send — fan-out an emergency broadcast to all active members ───────
// Creates the CommunityUpdate row first (so the broadcast exists even if all
// emails fail), then chunks the email send to keep memory + DB connections
// reasonable. Returns sent + failed counts; the audit row records both.
broadcastRoute.post('/send', zValidator('json', sendBroadcastSchema), async (c) => {
  const actor = c.get('user')!
  const data = c.req.valid('json')

  const broadcast = await db.communityUpdate.create({
    data: {
      category: 'emergency',
      headline: data.title.trim(),
      message: data.body.trim(),
      publishedBy: actor.id,
      targetType: 'COMMUNITY_WIDE',
      severity: data.severity as AnnouncementSeverity,
      isEmergency: true,
    },
  })

  const recipients = await db.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, email: true, fullName: true },
  })

  let sent = 0
  let failed = 0
  const sentAt = new Date().toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC'

  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE)
    await Promise.all(
      chunk.map(async (user) => {
        const result = await sendEmail({
          to: user.email,
          subject: `${subjectPrefix(data.severity as AnnouncementSeverity)}${data.title.trim()}`,
          template: 'emergency-broadcast',
          data: {
            recipientName: user.fullName,
            headline: data.title.trim(),
            message: data.body.trim(),
            sentAt,
            severity: data.severity,
          },
          idempotencyKey: `broadcast-${broadcast.id}-${user.id}`,
        })
        if (result.ok) sent++
        else failed++
      }),
    )
    if (i + CHUNK_SIZE < recipients.length) {
      await new Promise((r) => setTimeout(r, 20))
    }
  }

  await createAuditEntry({
    action: 'broadcast.send',
    entity: 'CommunityUpdate',
    entityId: broadcast.id,
    actorId: actor.id,
    after: {
      severity: data.severity,
      totalRecipients: recipients.length,
      sent,
      failed,
    },
  })

  return c.json({
    ok: true,
    data: { broadcastId: broadcast.id, sent, failed },
  })
})
