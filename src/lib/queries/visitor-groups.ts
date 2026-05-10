import { db } from '../db.js'

export async function getVisitorGroups(includeArchived = false) {
  return db.visitorGroup.findMany({
    where: includeArchived ? undefined : { archived: false },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          memberships: { where: { removedAt: null } },
        },
      },
      createdBy: { select: { fullName: true, memberId: true } },
    },
  })
}

export async function getVisitorGroupById(id: string) {
  return db.visitorGroup.findUnique({
    where: { id },
    include: {
      createdBy: { select: { fullName: true, memberId: true } },
      memberships: {
        where: { removedAt: null },
        orderBy: { assignedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              memberId: true,
              email: true,
              profilePhotoUrl: true,
            },
          },
          assignedBy: { select: { fullName: true, memberId: true } },
        },
      },
    },
  })
}

export async function getUserActiveGroups(userId: string) {
  const memberships = await db.visitorGroupMembership.findMany({
    where: { userId, removedAt: null },
    include: {
      group: { select: { id: true, name: true, theme: true, description: true, archived: true } },
    },
  })
  return memberships.filter((m) => !m.group.archived).map((m) => m.group)
}

export async function getUserActiveGroupIds(userId: string): Promise<string[]> {
  const groups = await getUserActiveGroups(userId)
  return groups.map((g) => g.id)
}
