import { db } from '../db.js'

export async function getActiveEmergencyBroadcasts(userId: string) {
  return db.communityUpdate.findMany({
    where: {
      isEmergency: true,
      acknowledgements: {
        none: { userId },
      },
    },
    orderBy: { publishedAt: 'desc' },
  })
}

export async function getEmergencyBroadcastById(id: string) {
  return db.communityUpdate.findUnique({ where: { id } })
}

export async function getRecentEmergencyBroadcasts(limit = 5) {
  return db.communityUpdate.findMany({
    where: { isEmergency: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    include: { _count: { select: { acknowledgements: true } } },
  })
}
