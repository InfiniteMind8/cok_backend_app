import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  AnnouncementTargetType,
  type IssueStatus,
  type Role,
} from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'
import { notify, notifyAllOfRole } from '../../lib/notifications/service.js'

export const communityRoute = new Hono<AppEnv>()

// ─── POST /updates — publish a community update ──────────────────────────────
const publishUpdateSchema = z.object({
  headline: z.string().min(1, 'Headline is required'),
  category: z.string().min(1),
  message: z.string().min(1, 'Message is required'),
  photoUrl: z.string().optional(),
  targetType: z
    .enum(['COMMUNITY_WIDE', 'ROLE', 'VISITOR_GROUP', 'SPECIFIC_USERS'])
    .optional(),
  targetRole: z.enum(['MASTER_ADMIN', 'ADMIN', 'VENDOR', 'RESIDENT', 'VISITOR']).optional(),
  targetGroupId: z.string().optional(),
  targetUserIds: z.array(z.string()).optional(),
})

communityRoute.post('/updates', zValidator('json', publishUpdateSchema), async (c) => {
  const admin = c.get('user')!
  const input = c.req.valid('json')

  const targetType = (input.targetType ?? 'COMMUNITY_WIDE') as AnnouncementTargetType

  const update = await db.communityUpdate.create({
    data: {
      headline: input.headline.trim(),
      category: input.category.trim(),
      message: input.message.trim(),
      photoUrl: input.photoUrl ?? null,
      publishedBy: admin.id,
      targetType,
      targetRole: targetType === 'ROLE' ? ((input.targetRole as Role | undefined) ?? null) : null,
      targetGroupId:
        targetType === 'VISITOR_GROUP' ? (input.targetGroupId ?? null) : null,
      targetUserIds:
        targetType === 'SPECIFIC_USERS' ? (input.targetUserIds ?? []) : [],
    },
  })

  await db.auditLog.create({
    data: {
      action: 'PUBLISH',
      entity: 'CommunityUpdate',
      entityId: update.id,
      actorId: admin.id,
      after: { targetType, headline: update.headline },
    },
  })

  // Best-effort fan-out notification — must not fail the publish.
  try {
    if (targetType === 'COMMUNITY_WIDE') {
      await notifyAllOfRole(['RESIDENT', 'VISITOR'], {
        type: 'COMMUNITY_UPDATE',
        title: `New update: ${input.headline.trim()}`,
        link: '/community',
      })
    } else if (targetType === 'ROLE' && input.targetRole) {
      await notifyAllOfRole([input.targetRole as Role], {
        type: 'COMMUNITY_UPDATE',
        title: `New update: ${input.headline.trim()}`,
        link: '/community',
      })
    } else if (targetType === 'VISITOR_GROUP' && input.targetGroupId) {
      const memberships = await db.visitorGroupMembership.findMany({
        where: { groupId: input.targetGroupId, removedAt: null },
        select: { userId: true },
      })
      await Promise.all(
        memberships.map((m) =>
          notify({
            userId: m.userId,
            type: 'COMMUNITY_UPDATE',
            title: `New update: ${input.headline.trim()}`,
            link: '/community',
            priority: 'yellow',
          }),
        ),
      )
    } else if (targetType === 'SPECIFIC_USERS' && input.targetUserIds?.length) {
      await Promise.all(
        input.targetUserIds.map((userId) =>
          notify({
            userId,
            type: 'COMMUNITY_UPDATE',
            title: `New update: ${input.headline.trim()}`,
            link: '/community',
            priority: 'yellow',
          }),
        ),
      )
    }
  } catch {
    // non-fatal
  }

  return c.json({ ok: true, data: { updateId: update.id } })
})

// ─── POST /votes — create a new vote with options ────────────────────────────
const createVoteSchema = z.object({
  headline: z.string().min(1, 'Headline is required'),
  description: z.string(),
  options: z
    .array(
      z.object({
        label: z.string(),
        description: z.string(),
      }),
    )
    .min(2, 'At least 2 options are required'),
})

communityRoute.post('/votes', zValidator('json', createVoteSchema), async (c) => {
  const admin = c.get('user')!
  const input = c.req.valid('json')

  const vote = await db.vote.create({
    data: {
      headline: input.headline.trim(),
      description: input.description.trim(),
      isOpen: true,
      createdBy: admin.id,
      options: {
        createMany: {
          data: input.options.map((o) => ({
            label: o.label.trim(),
            description: o.description.trim(),
          })),
        },
      },
    },
  })

  try {
    await notifyAllOfRole(['RESIDENT'], {
      type: 'VOTE_OPEN',
      title: `New vote: ${input.headline.trim()}`,
      body: 'Cast your vote in the Community tab.',
      link: '/community?tab=voting',
    })
  } catch {
    // non-fatal
  }

  return c.json({ ok: true, data: { voteId: vote.id } })
})

// ─── POST /votes/:voteId/close ───────────────────────────────────────────────
communityRoute.post('/votes/:voteId/close', async (c) => {
  const voteId = c.req.param('voteId')
  await db.vote.update({
    where: { id: voteId },
    data: { isOpen: false, closedAt: new Date() },
  })
  return c.json({ ok: true, data: { voteId } })
})

// ─── POST /issues/:issueId/reply ─────────────────────────────────────────────
const replyToIssueSchema = z.object({
  message: z.string().min(1, 'Reply message is required'),
})

communityRoute.post(
  '/issues/:issueId/reply',
  zValidator('json', replyToIssueSchema),
  async (c) => {
    const admin = c.get('user')!
    const issueId = c.req.param('issueId')
    const { message } = c.req.valid('json')

    const issue = await db.issue.findUnique({
      where: { id: issueId },
      select: { reporterId: true },
    })
    if (!issue) throw ApiError.notFound('Issue not found')

    await db.issueReply.create({
      data: {
        issueId,
        authorId: admin.id,
        message: message.trim(),
      },
    })

    try {
      await notify({
        userId: issue.reporterId,
        type: 'ISSUE_REPLY',
        title: 'A reply has been posted to your issue',
        body: message.trim().slice(0, 100) + (message.trim().length > 100 ? '…' : ''),
        link: '/community/issues',
        priority: 'yellow',
      })
    } catch {
      // non-fatal
    }

    return c.json({ ok: true, data: { issueId } })
  },
)

// ─── POST /issues/:issueId/status ────────────────────────────────────────────
const updateIssueStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
})

communityRoute.post(
  '/issues/:issueId/status',
  zValidator('json', updateIssueStatusSchema),
  async (c) => {
    const issueId = c.req.param('issueId')
    const { status } = c.req.valid('json')
    await db.issue.update({
      where: { id: issueId },
      data: { status: status as IssueStatus },
    })
    return c.json({ ok: true, data: { issueId, status } })
  },
)

// ─── POST /issues/:issueId/assign — assign caller as the assignee ────────────
communityRoute.post('/issues/:issueId/assign', async (c) => {
  const admin = c.get('user')!
  const issueId = c.req.param('issueId')
  await db.issue.update({
    where: { id: issueId },
    data: { assigneeId: admin.id },
  })
  return c.json({ ok: true, data: { issueId, assigneeId: admin.id } })
})
