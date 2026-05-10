import type { Role, AccountStatus } from '@prisma/client'
import { db } from '../db.js'
import { getWalletBalance } from '../ledger/balance.js'

export interface UserFilter {
  role?: Role
  status?: AccountStatus
  search?: string
  page?: number
  pageSize?: number
}

export async function getUsers(filters: UserFilter = {}) {
  const { role, status, search, page = 1, pageSize = 20 } = filters
  const skip = (page - 1) * pageSize

  const where = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { memberId: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        wallet: { select: { id: true } },
        groupMemberships: {
          where: { removedAt: null },
          include: { group: { select: { id: true, name: true } } },
        },
      },
    }),
    db.user.count({ where }),
  ])

  const usersWithBalance = await Promise.all(
    users.map(async (u) => ({
      ...u,
      walletBalance: u.wallet ? await getWalletBalance(u.wallet.id) : null,
    })),
  )

  return { users: usersWithBalance, total }
}

export async function getUserDetail(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      wallet: { select: { id: true } },
      ownedProperties: {
        include: { property: { select: { code: true, type: true } } },
      },
      rentedProperties: {
        include: { property: { select: { code: true, type: true } } },
      },
    },
  })
  if (!user) return null

  const walletBalance = user.wallet ? await getWalletBalance(user.wallet.id) : null

  return { ...user, walletBalance }
}

export async function getAllUsersForSelect() {
  return db.user.findMany({
    select: { id: true, fullName: true, email: true, memberId: true },
    orderBy: { fullName: 'asc' },
  })
}
