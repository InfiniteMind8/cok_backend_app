import type { Role } from '@prisma/client'
import { db } from '../db.js'

interface NotifyPayload {
  type: string
  title: string
  body?: string
  link?: string
  priority?: string
}

export async function notify(args: NotifyPayload & { userId: string }) {
  await db.notification.create({
    data: {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body ?? null,
      link: args.link ?? null,
      priority: args.priority ?? 'yellow',
    },
  })
}

export async function notifyMany(userIds: string[], payload: NotifyPayload) {
  if (userIds.length === 0) return
  await db.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      link: payload.link ?? null,
      priority: payload.priority ?? 'yellow',
    })),
  })
}

export async function notifyAllOfRole(roles: Role[], payload: NotifyPayload) {
  const users = await db.user.findMany({
    where: { role: { in: roles } },
    select: { id: true },
  })
  const userIds = users.map((u) => u.id)
  await notifyMany(userIds, payload)
}
