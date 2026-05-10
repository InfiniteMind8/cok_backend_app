import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'

export const visitorGroupsRoute = new Hono<AppEnv>()

async function writeAuditLog(
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  before?: object,
  after?: object,
) {
  await db.auditLog.create({
    data: {
      action,
      entity,
      entityId,
      actorId,
      before: before ?? undefined,
      after: after ?? undefined,
    },
  })
}

// ─── POST / — create a visitor group ─────────────────────────────────────────
const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  theme: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
})

visitorGroupsRoute.post('/', zValidator('json', createGroupSchema), async (c) => {
  const admin = c.get('user')!
  const input = c.req.valid('json')

  const existing = await db.visitorGroup.findUnique({ where: { name: input.name.trim() } })
  if (existing) throw ApiError.conflict('A group with that name already exists')

  const group = await db.visitorGroup.create({
    data: {
      name: input.name.trim(),
      theme: input.theme?.trim() || null,
      description: input.description.trim(),
      createdById: admin.id,
    },
  })

  await writeAuditLog(admin.id, 'CREATE', 'VisitorGroup', group.id, undefined, {
    name: group.name,
    theme: group.theme,
  })

  return c.json({ ok: true, data: { groupId: group.id } })
})

// ─── PATCH /:id — edit a visitor group ───────────────────────────────────────
const editGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  theme: z.string().optional(),
  description: z.string().min(1),
})

visitorGroupsRoute.patch('/:id', zValidator('json', editGroupSchema), async (c) => {
  const admin = c.get('user')!
  const id = c.req.param('id')
  const input = c.req.valid('json')

  const existing = await db.visitorGroup.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Group not found')

  const nameConflict = await db.visitorGroup.findFirst({
    where: { name: input.name.trim(), NOT: { id } },
  })
  if (nameConflict) throw ApiError.conflict('A group with that name already exists')

  const updated = await db.visitorGroup.update({
    where: { id },
    data: {
      name: input.name.trim(),
      theme: input.theme?.trim() || null,
      description: input.description.trim(),
    },
  })

  await writeAuditLog(
    admin.id,
    'UPDATE',
    'VisitorGroup',
    id,
    { name: existing.name },
    { name: updated.name },
  )

  return c.json({ ok: true, data: { groupId: id } })
})

// ─── POST /:id/archive | /:id/unarchive ──────────────────────────────────────
visitorGroupsRoute.post('/:id/archive', async (c) => {
  const admin = c.get('user')!
  const id = c.req.param('id')

  const group = await db.visitorGroup.findUnique({ where: { id } })
  if (!group) throw ApiError.notFound('Group not found')

  await db.visitorGroup.update({ where: { id }, data: { archived: true } })
  await writeAuditLog(admin.id, 'ARCHIVE', 'VisitorGroup', id, { archived: false }, { archived: true })

  return c.json({ ok: true, data: { groupId: id, archived: true } })
})

visitorGroupsRoute.post('/:id/unarchive', async (c) => {
  const admin = c.get('user')!
  const id = c.req.param('id')

  await db.visitorGroup.update({ where: { id }, data: { archived: false } })
  await writeAuditLog(admin.id, 'UNARCHIVE', 'VisitorGroup', id, { archived: true }, { archived: false })

  return c.json({ ok: true, data: { groupId: id, archived: false } })
})

// ─── POST /:id/members — assign a visitor to a group ─────────────────────────
const assignMemberSchema = z.object({
  userId: z.string().min(1),
})

visitorGroupsRoute.post(
  '/:id/members',
  zValidator('json', assignMemberSchema),
  async (c) => {
    const admin = c.get('user')!
    const groupId = c.req.param('id')
    const { userId } = c.req.valid('json')

    const group = await db.visitorGroup.findUnique({ where: { id: groupId } })
    if (!group) throw ApiError.notFound('Group not found')
    if (group.archived) {
      throw ApiError.validation('Cannot assign members to an archived group')
    }

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) throw ApiError.notFound('User not found')
    if (user.role !== 'VISITOR') {
      throw ApiError.validation('Only visitors can be assigned to visitor groups')
    }

    const existing = await db.visitorGroupMembership.findFirst({
      where: { groupId, userId, removedAt: null },
    })
    if (existing) throw ApiError.conflict('User is already a member of this group')

    const membership = await db.visitorGroupMembership.create({
      data: { groupId, userId, assignedById: admin.id },
    })

    await writeAuditLog(
      admin.id,
      'ASSIGN_MEMBER',
      'VisitorGroupMembership',
      membership.id,
      undefined,
      { groupId, userId },
    )

    return c.json({ ok: true, data: { membershipId: membership.id } })
  },
)

// ─── DELETE /memberships/:membershipId — remove a visitor from a group ───────
// Soft remove: sets removedAt instead of deleting the row.
visitorGroupsRoute.delete('/memberships/:membershipId', async (c) => {
  const admin = c.get('user')!
  const membershipId = c.req.param('membershipId')

  const membership = await db.visitorGroupMembership.findUnique({
    where: { id: membershipId },
  })
  if (!membership) throw ApiError.notFound('Membership not found')
  if (membership.removedAt) throw ApiError.conflict('Membership already removed')

  const removedAt = new Date()
  await db.visitorGroupMembership.update({
    where: { id: membershipId },
    data: { removedAt },
  })

  await writeAuditLog(
    admin.id,
    'REMOVE_MEMBER',
    'VisitorGroupMembership',
    membershipId,
    { removedAt: null },
    { removedAt: removedAt.toISOString() },
  )

  return c.json({ ok: true, data: { membershipId, removedAt: removedAt.toISOString() } })
})
