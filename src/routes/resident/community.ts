import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { AttachmentEntityType, IssueLevel } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'
import { requireRole } from '../../middleware/auth.js'
import { notifyAllOfRole } from '../../lib/notifications/service.js'

export const residentCommunityRoute = new Hono<AppEnv>()

// ─── POST /community/updates/:id/acknowledge ─────────────────────────────────
// Mark a community update as acknowledged. Open to any authenticated user
// (matches website `withResidentAction` with all-roles allowlist).
residentCommunityRoute.post('/updates/:id/acknowledge', async (c) => {
  const user = c.get('user')!
  const updateId = c.req.param('id')

  await db.updateAcknowledgement.upsert({
    where: { updateId_userId: { updateId, userId: user.id } },
    update: {},
    create: { updateId, userId: user.id },
  })

  return c.json({ ok: true, data: { acknowledged: true } })
})

// ─── POST /community/broadcasts/:id/acknowledge ──────────────────────────────
// Acknowledge an emergency broadcast. Open to any authenticated user (the
// banner is shown community-wide). Fails NOT_FOUND if the target isn't an
// emergency broadcast — preserves the website action's invariant.
residentCommunityRoute.post('/broadcasts/:id/acknowledge', async (c) => {
  const user = c.get('user')!
  const broadcastId = c.req.param('id')

  const broadcast = await db.communityUpdate.findUnique({
    where: { id: broadcastId },
    select: { id: true, isEmergency: true },
  })
  if (!broadcast || !broadcast.isEmergency) {
    throw ApiError.notFound('Broadcast not found')
  }

  await db.updateAcknowledgement.upsert({
    where: { updateId_userId: { updateId: broadcastId, userId: user.id } },
    update: {},
    create: { updateId: broadcastId, userId: user.id },
  })

  return c.json({ ok: true, data: { acknowledged: true } })
})

// ─── POST /community/votes/:voteId/cast ──────────────────────────────────────
// Cast a vote. RESIDENT-only.
const castVoteSchema = z.object({
  optionId: z.string().min(1),
})

residentCommunityRoute.post(
  '/votes/:voteId/cast',
  requireRole('RESIDENT'),
  zValidator('json', castVoteSchema),
  async (c) => {
    const user = c.get('user')!
    const voteId = c.req.param('voteId')
    const { optionId } = c.req.valid('json')

    await db.$transaction(async (tx) => {
      const option = await tx.voteOption.findUnique({
        where: { id: optionId },
        select: { voteId: true, vote: { select: { isOpen: true } } },
      })

      if (!option || option.voteId !== voteId) {
        throw ApiError.validation('Invalid vote option')
      }
      if (!option.vote.isOpen) {
        throw ApiError.validation('This vote is no longer open')
      }

      await tx.voteSubmission.create({
        data: { voteId, optionId, userId: user.id },
      })
    })

    return c.json({ ok: true, data: { cast: true } })
  },
)

// ─── POST /community/issues — raise an issue ─────────────────────────────────
// Open to RESIDENT and VISITOR.
const issueAttachmentSchema = z.object({
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  name: z.string().min(1),
  fieldName: z.string().min(1),
})

const raiseIssueSchema = z.object({
  seriousness: z.enum(['GREEN', 'YELLOW', 'ORANGE', 'RED']),
  urgency: z.enum(['GREEN', 'YELLOW', 'ORANGE', 'RED']),
  category: z.string().min(1),
  message: z.string().min(1),
  title: z.string().optional(),
  location: z.string().optional(),
  propertyId: z.string().optional(),
  contactPreference: z.string().optional(),
  attachments: z.array(issueAttachmentSchema).optional(),
})

residentCommunityRoute.post(
  '/issues',
  requireRole('RESIDENT', 'VISITOR'),
  zValidator('json', raiseIssueSchema),
  async (c) => {
    const user = c.get('user')!
    const input = c.req.valid('json')

    const issue = await db.$transaction(async (tx) => {
      const created = await tx.issue.create({
        data: {
          reporterId: user.id,
          seriousness: input.seriousness as IssueLevel,
          urgency: input.urgency as IssueLevel,
          category: input.category.trim(),
          message: input.message.trim(),
          title: input.title?.trim() ?? null,
          location: input.location?.trim() ?? null,
          propertyId: input.propertyId ?? null,
          contactPreference: input.contactPreference ?? null,
        },
      })

      if (input.attachments && input.attachments.length > 0) {
        for (const att of input.attachments) {
          await tx.attachment.create({
            data: {
              storageKey: att.storageKey,
              mimeType: att.mimeType,
              sizeBytes: BigInt(att.sizeBytes),
              name: att.name,
              entityType: AttachmentEntityType.ISSUE,
              entityId: created.id,
              fieldName: att.fieldName,
              uploadedBy: user.id,
            },
          })
        }
      }

      await tx.auditLog.create({
        data: {
          action: 'RAISE_ISSUE',
          entity: 'Issue',
          entityId: created.id,
          actorId: user.id,
          after: { category: created.category, seriousness: created.seriousness },
        },
      })

      return created
    })

    // Best-effort admin notification — must not fail the submit.
    try {
      await notifyAllOfRole(['MASTER_ADMIN', 'ADMIN'], {
        type: 'ISSUE_RAISED',
        title: 'New issue raised',
        body:
          (input.title ? input.title + ': ' : '') +
          input.category.trim() +
          ': ' +
          input.message.trim().slice(0, 80) +
          (input.message.trim().length > 80 ? '…' : ''),
        link: '/admin/community',
      })
    } catch {
      // non-fatal
    }

    return c.json({ ok: true, data: { issueId: issue.id } })
  },
)
