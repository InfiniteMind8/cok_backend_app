import { db } from '../db.js'

export async function getRecentTransactions(walletId: string, limit = 10) {
  return db.ledgerEntry.findMany({
    where: { walletId },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      transaction: {
        select: {
          id: true,
          type: true,
          description: true,
          reference: true,
          initiatedBy: true,
          metadata: true,
          createdAt: true,
          feeScheduleId: true,
        },
      },
    },
  })
}

export type TransactionEntry = Awaited<ReturnType<typeof getRecentTransactions>>[number]

export async function getTransactionPage(walletId: string, cursor?: string, pageSize = 20) {
  const entries = await db.ledgerEntry.findMany({
    where: { walletId },
    take: pageSize + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      transaction: {
        select: {
          id: true,
          type: true,
          description: true,
          reference: true,
          initiatedBy: true,
          metadata: true,
          createdAt: true,
          feeScheduleId: true,
        },
      },
    },
  })

  const hasMore = entries.length > pageSize
  const page = hasMore ? entries.slice(0, pageSize) : entries
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null

  return { entries: page, nextCursor }
}

export async function getUserSettlementRequests(userId: string) {
  return db.settlementRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

export type SettlementRequestRow = Awaited<ReturnType<typeof getUserSettlementRequests>>[number]
